import Phaser from 'phaser';
import { ChatUI } from '../ui/chat';
import { setupUiCamera, viewWidth, VIEW_H } from '../layout';
import { characterById } from '../meta/characters';
import { MAX_PLAYERS, type Playlist } from '../net/protocol';
import { NetRoom, currentRoom, setCurrentRoom } from '../net/room';
import { ROOM_CODE_LENGTH, isRoomCode } from '../net/protocol';
import { headIcon } from '../render/art/skins';
import { panel, textButton } from '../ui/widgets';
import { goToMenu, hostStartRace, myProfile, wireClientRoom } from './flow';
import { uiText } from './HudScene';
import { courseById, courseName } from '../sim/track/courses';
import { courseThumb } from './CourseSelectScene';
import { PAIRINGS, TEAMS, pairingLabel } from '../meta/teams';

type View = 'choose' | 'join' | 'busy' | 'room';

/** Short description of the host's course choice, e.g. "Pilz-Cup (4 Rennen)". */
function playlistLabel(p: Playlist): string {
  if (p.vote) return p.teams !== undefined ? '👥 🗳 Abstimmung' : '🗳 Abstimmung';
  if (p.ko) return `🥊 K.-o.-Cup (${p.courses.length} Rennen)`;
  if (!p.courses.length) return p.teams !== undefined ? '👥 Zufall' : 'Zufall';
  const base = p.courses.length === 1 ? p.name : `${p.name} (${p.courses.length} Rennen)`;
  return p.teams !== undefined ? `👥 ${base}` : base;
}

function playlistCourses(p: Playlist): string {
  if (p.courses.length < 2) return '';
  return p.courses.map((id) => courseName(id)).join(' → ');
}

export class LobbyScene extends Phaser.Scene {
  private view: View = 'choose';
  private ui!: Phaser.GameObjects.Container;
  private error = '';
  private code = '';
  private busyText = '';
  /** Gives up knocking (while the host still has to let you in). */
  private cancelJoin: AbortController | null = null;
  private W = 960;
  private alive = false;
  private voteSecs = -1;

  constructor() {
    super('lobby');
  }

  create(data?: { join?: string }) {
    setupUiCamera(this);
    this.W = viewWidth(this);
    this.add.rectangle(0, 0, this.W, VIEW_H, 0x241d3d).setOrigin(0, 0);
    const bg = this.add.graphics();
    for (let i = 0; i < 14; i++) {
      bg.fillStyle(i % 2 ? 0x2d2550 : 0x2a2247, 1).fillCircle((i * 173) % this.W, (i * 97) % VIEW_H, 60 + (i % 4) * 30);
    }
    this.ui = this.add.container(0, 0);
    this.alive = true;
    this.events.once('shutdown', () => {
      this.alive = false;
      const r = currentRoom();
      if (r) {
        r.onLobby = null;
      }
    });
    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize, this));
    const room = currentRoom();
    this.view = room ? 'room' : 'choose';
    if (room) this.attach(room);
    this.render();
    // opened through an invitation link: straight into the room
    if (!room && data?.join && isRoomCode(data.join)) {
      this.code = data.join;
      void this.joinRoom();
    }
  }

  /** Shares a link that opens the game right in this room (WhatsApp & Co.), or copies it. */
  private async invite(room: NetRoom) {
    const url = `${window.location.origin}${window.location.pathname}?raum=${room.code}`;
    const text = `Komm in mein Runaway-Rivals-Rennen! Raum ${room.code}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Runaway Rivals', text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text}: ${url}`);
      this.flash('Link kopiert – schick ihn deinen Freunden!');
    } catch {
      // share sheet closed or clipboard blocked: show the link instead
      this.flash(url);
    }
  }

  private flash(text: string) {
    const t = uiText(this, this.W / 2, VIEW_H - 60, text, 18, '#9fff9a').setOrigin(0.5).setDepth(50);
    this.tweens.add({ targets: t, alpha: 0, delay: 2600, duration: 400, onComplete: () => t.destroy() });
  }

  private onResize() {
    this.scene.restart();
  }

  private chat?: ChatUI;

  private attach(room: NetRoom) {
    this.chat ??= new ChatUI(this, room, { x: this.W - 36, y: 34, feed: { x: 16, y: 70 }, wrap: 200 });
    room.onLobby = () => this.render();
    room.onClosed = (reason) => {
      setCurrentRoom(null);
      this.error = reason;
      this.view = 'choose';
      this.render();
    };
    if (room.role === 'client') wireClientRoom(this.game, room);
  }

  private setView(v: View) {
    this.view = v;
    this.render();
  }

  private render() {
    if (!this.alive) return;
    this.ui.removeAll(true);
    const W = this.W;
    this.ui.add(uiText(this, W / 2, 34, 'Mit Freunden spielen', 34, '#ffd84a').setOrigin(0.5));
    switch (this.view) {
      case 'choose':
        this.renderChoose();
        break;
      case 'join':
        this.renderJoin();
        break;
      case 'busy':
        this.ui.add(uiText(this, W / 2, VIEW_H / 2 - (this.busyText.includes('\n') ? 40 : 20), this.busyText, 26).setOrigin(0.5).setAlign('center'));
        if (this.cancelJoin) {
          this.ui.add(textButton(this, W / 2, VIEW_H / 2 + 90, 200, 52, 'Abbrechen', 0x8a84a8, () => this.cancelJoin?.abort(), 20).container);
        }
        this.ui.add(uiText(this, W / 2, VIEW_H / 2 + (this.busyText.includes('\n') ? 40 : 20), 'Einen Moment …', 18, '#c9c2e8').setOrigin(0.5));
        break;
      case 'room':
        this.renderRoom();
        break;
    }
    if (this.error) {
      this.ui.add(uiText(this, W / 2, VIEW_H - 24, this.error, 18, '#ff9a8a').setOrigin(0.5));
    }
  }

  private renderChoose() {
    const W = this.W;
    this.ui.add(
      uiText(
        this,
        W / 2,
        92,
        'Ein Handy erstellt einen Raum und zeigt einen Code.\nDie anderen tippen den Code ein. Freie Plätze fahren Bots.',
        17,
        '#e6e0ff',
      )
        .setOrigin(0.5, 0)
        .setAlign('center'),
    );
    this.ui.add(textButton(this, W / 2, 230, 320, 66, 'Raum erstellen', 0x5fd35a, () => void this.createRoom(), 26).container);
    this.ui.add(
      textButton(this, W / 2, 316, 320, 66, 'Raum beitreten', 0x4aa3ff, () => {
        this.code = '';
        this.error = '';
        this.setView('join');
      }, 26).container,
    );
    this.ui.add(textButton(this, W / 2, 404, 200, 52, 'Zurück', 0x8a84a8, () => goToMenu(this), 20).container);
  }

  private renderJoin() {
    const W = this.W;
    const left = W * 0.3;
    this.ui.add(uiText(this, left, 100, 'Raum-Code eingeben:', 22).setOrigin(0.5));
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      const x = left + (i - (ROOM_CODE_LENGTH - 1) / 2) * 62;
      const g = this.add.graphics();
      g.fillStyle(0xffffff, 1).fillRoundedRect(x - 26, 140, 52, 72, 10);
      g.lineStyle(4, 0x1d1a2f, 1).strokeRoundedRect(x - 26, 140, 52, 72, 10);
      this.ui.add(g);
      this.ui.add(uiText(this, x, 176, this.code[i] ?? '', 38, '#1d1a2f').setOrigin(0.5).setStroke('#ffffff', 0));
    }
    const join = textButton(this, left, 290, 250, 60, 'Beitreten', 0x5fd35a, () => void this.joinRoom(), 24);
    join.setEnabled(this.code.length === ROOM_CODE_LENGTH);
    this.ui.add(join.container);
    this.ui.add(
      textButton(this, left, 372, 180, 50, 'Zurück', 0x8a84a8, () => {
        this.error = '';
        this.setView('choose');
      }, 20).container,
    );

    // keypad
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'];
    const kx = W * 0.72;
    keys.forEach((k, i) => {
      const x = kx + ((i % 3) - 1) * 84;
      const y = 120 + Math.floor(i / 3) * 76;
      const color = k === 'OK' ? 0x5fd35a : k === '⌫' ? 0xffa94a : 0xe8e2ff;
      const b = textButton(this, x, y, 74, 62, k, color, () => this.keypad(k), 26);
      if (k === 'OK') b.setEnabled(this.code.length === ROOM_CODE_LENGTH);
      this.ui.add(b.container);
    });
  }

  private keypad(k: string) {
    if (k === '⌫') this.code = this.code.slice(0, -1);
    else if (k === 'OK') {
      if (this.code.length === ROOM_CODE_LENGTH) void this.joinRoom();
      return;
    } else if (this.code.length < ROOM_CODE_LENGTH) this.code += k;
    this.render();
  }

  update() {
    const room = currentRoom();
    if (this.view !== 'room' || !room?.vote) return;
    const secs = Math.max(0, Math.ceil((room.vote.endsAt - Date.now()) / 1000));
    if (secs !== this.voteSecs) this.render();
  }

  /** Course vote: three cards, tap to vote, voters' heads under each card. */
  private renderVote(room: NetRoom) {
    const vote = room.vote!;
    const W = this.W;
    const secs = Math.max(0, Math.ceil((vote.endsAt - Date.now()) / 1000));
    this.voteSecs = secs;
    this.ui.add(uiText(this, W / 2, 84, `🗳 Welche Strecke fahren wir?  noch ${secs} s`, 24, '#ffffff').setOrigin(0.5));
    const cw = Math.min(290, (W - 80) / 3);
    const ch = 250;
    const mySeat = room.role === 'host' ? 0 : room.mySeat;
    const mine = vote.votes.find(([s]) => s === mySeat)?.[1] ?? -1;
    vote.options.forEach((id, i) => {
      const course = courseById(id);
      const cx = W / 2 + (i - 1) * (cw + 20);
      const cy = 250;
      const c = this.add.container(cx, cy);
      const g = this.add.graphics();
      g.fillStyle(i === mine ? 0x5a4a20 : 0x3d3470, 1).fillRoundedRect(-cw / 2, -ch / 2, cw, ch, 16);
      g.lineStyle(4, i === mine ? 0xffd84a : 0x514880, 1).strokeRoundedRect(-cw / 2, -ch / 2, cw, ch, 16);
      c.add(g);
      const thumb = this.add.image(0, -ch / 2 + 12, courseThumb(this, course)).setOrigin(0.5, 0);
      thumb.setScale((cw - 20) / thumb.width, 80 / thumb.height);
      c.add(thumb);
      c.add(uiText(this, 0, -ch / 2 + 110, course.name, 20).setOrigin(0.5).setWordWrapWidth((cw - 16) * 2).setAlign('center'));
      c.add(uiText(this, 0, -ch / 2 + 142, '★'.repeat(course.difficulty), 18, '#ffd84a').setOrigin(0.5));
      const voters = vote.votes.filter(([, o]) => o === i).map(([s]) => room.players.find((p) => p.seat === s)).filter((p) => !!p);
      voters.forEach((p, k) => {
        const icon = headIcon(this, characterById(p!.character), 34, p!.cosmetics?.skin);
        c.add(this.add.image((k - (voters.length - 1) / 2) * 40, ch / 2 - 40, icon.key).setScale(icon.scale));
      });
      if (!voters.length) c.add(uiText(this, 0, ch / 2 - 40, 'noch keine Stimme', 14, '#8a84b8').setOrigin(0.5));
      c.setSize(cw, ch);
      c.setInteractive({ useHandCursor: true });
      c.on('pointerup', () => {
        if (room.role === 'host') room.castVote(0, i);
        else room.sendVote(i);
      });
      this.ui.add(c);
    });
    this.ui.add(uiText(this, W / 2, 410, 'Tippe auf deine Lieblingsstrecke – bei Gleichstand entscheidet der Zufall.', 16, '#c9c2e8').setOrigin(0.5));
  }

  private renderRoom() {
    const room = currentRoom();
    if (!room) {
      this.setView('choose');
      return;
    }
    const W = this.W;
    if (room.vote) {
      this.renderVote(room);
      return;
    }
    this.ui.add(panel(this, W / 2, 128, 340, 76));
    this.ui.add(uiText(this, W / 2, 106, 'Raum-Code', 16, '#3a3228').setOrigin(0.5).setStroke('#a39c8c', 0));
    this.ui.add(uiText(this, W / 2, 138, `${room.code.slice(0, 3)} ${room.code.slice(3)}`, 40, '#ffffff').setOrigin(0.5));
    this.ui.add(textButton(this, W / 2 + 280, 128, 190, 50, '📨 Einladen', 0x5fd35a, () => void this.invite(room), 19).container);

    const slotW = Math.min(170, (W - 80) / 4);
    const teams = room.playlist.teams !== undefined && !room.playlist.ko;
    for (let seat = 0; seat < MAX_PLAYERS; seat++) {
      const x = W / 2 + (seat - 1.5) * (slotW + 12);
      const y = 262;
      const p = room.players.find((pl) => pl.seat === seat);
      const team = teams ? TEAMS[PAIRINGS[room.playlist.teams!][seat]] : null;
      const g = this.add.graphics();
      g.fillStyle(p ? 0x3d3470 : 0x2a2449, 1).fillRoundedRect(x - slotW / 2, y - 62, slotW, 124, 14);
      g.lineStyle(team ? 5 : 3, p && seat === room.mySeat ? 0xffd84a : team ? team.color : 0x514880, 1).strokeRoundedRect(x - slotW / 2, y - 62, slotW, 124, 14);
      this.ui.add(g);
      if (team) this.ui.add(uiText(this, x + slotW / 2 - 16, y - 50, team.icon, 16).setOrigin(0.5));
      if (p) {
        const c = characterById(p.character);
        const icon = headIcon(this, c, 56, p.cosmetics?.skin);
        this.ui.add(this.add.image(x, y - 14, icon.key).setScale(icon.scale));
        this.ui.add(uiText(this, x, y + 38, p.name, 18).setOrigin(0.5));
        if (seat === 0) this.ui.add(uiText(this, x, y - 52, 'Gastgeber', 12, '#ffd84a').setOrigin(0.5));
      } else {
        this.ui.add(uiText(this, x, y - 8, 'frei', 20, '#8a84b8').setOrigin(0.5));
        this.ui.add(uiText(this, x, y + 22, '(sonst Bot)', 14, '#8a84b8').setOrigin(0.5));
      }
    }

    if (room.role === 'host') {
      this.ui.add(
        textButton(this, W / 2 - 150, 380, 250, 54, `Strecken: ${playlistLabel(room.playlist)}`, 0x9b7aff, () => {
          this.scene.start('courses', { mode: 'room' });
        }, 16).container,
      );
      const start = textButton(this, W / 2 + 150, 380, 250, 54, room.racing ? 'Rennen läuft …' : 'Rennen starten!', 0x5fd35a, () => hostStartRace(this, room), 22);
      start.setEnabled(!room.racing);
      this.ui.add(start.container);
    } else {
      const text = room.racing ? 'Ein Rennen läuft gerade – du bist beim nächsten dabei.' : `${playlistLabel(room.playlist)} · Warte auf den Gastgeber …`;
      this.ui.add(uiText(this, W / 2, 380, text, 20, '#e6e0ff').setOrigin(0.5));
    }
    const courses = playlistCourses(room.playlist);
    if (courses) this.ui.add(uiText(this, W / 2, 338, courses, 14, '#c9c2e8').setOrigin(0.5).setWordWrapWidth((W - 60) * 2).setAlign('center'));
    if (room.role === 'host') {
      this.ui.add(
        textButton(this, W / 2 - 230, 450, 210, 44, room.playlist.vote ? '🗳 Abstimmung: an' : '🗳 Abstimmung: aus', room.playlist.vote ? 0xffd84a : 0x8a84a8, () => {
          const t = room.playlist.teams;
          room.playlist = room.playlist.vote ? { name: 'Zufall', courses: [], teams: t } : { name: 'Abstimmung', courses: [], vote: true, teams: t };
          room.broadcastLobby();
          this.render();
        }, 15).container,
      );
      // 2 vs 2: off → 1+2 vs 3+4 → 1+3 vs 2+4 → 1+4 vs 2+3 → off
      const pairing = room.playlist.teams;
      const label = room.playlist.ko ? '👥 2 gegen 2: nicht im K.-o.' : pairing === undefined ? '👥 2 gegen 2: aus' : `👥 ${pairingLabel(pairing)}`;
      const teamBtn = textButton(this, W / 2, 450, 220, 44, label, pairing !== undefined && !room.playlist.ko ? 0x4aa3ff : 0x8a84a8, () => {
        const next = pairing === undefined ? 0 : pairing + 1 < PAIRINGS.length ? pairing + 1 : undefined;
        room.playlist = { ...room.playlist, teams: next };
        if (next === undefined) delete room.playlist.teams;
        room.broadcastLobby();
        this.render();
      }, 15);
      teamBtn.setEnabled(!room.playlist.ko);
      this.ui.add(teamBtn.container);
    } else if (teams) {
      this.ui.add(uiText(this, W / 2, 420, `👥 2 gegen 2: ${pairingLabel(room.playlist.teams!)}`, 16, '#7cc0ff').setOrigin(0.5));
    }
    this.ui.add(
      textButton(this, room.role === 'host' ? W / 2 + 230 : W / 2, room.role === 'host' ? 450 : 460, room.role === 'host' ? 200 : 220, 44, 'Raum verlassen', 0xe0604a, () => {
        setCurrentRoom(null);
        this.error = '';
        this.setView('choose');
      }, 18).container,
    );
  }

  private async createRoom() {
    this.error = '';
    this.busyText = 'Raum wird erstellt …';
    this.setView('busy');
    try {
      const room = await NetRoom.host(myProfile());
      setCurrentRoom(room);
      this.attach(room);
      this.setView('room');
    } catch (e) {
      this.error = (e as Error).message;
      this.setView('choose');
    }
  }

  private async joinRoom() {
    this.error = '';
    this.busyText = `Verbinde mit Raum ${this.code} …`;
    this.setView('busy');
    const cancel = new AbortController();
    try {
      const room = await NetRoom.join(
        this.code,
        myProfile(),
        () => {
          // the host's phone now asks "let them in?"
          this.cancelJoin = cancel;
          this.busyText = `Angeklopft bei Raum ${this.code} 🚪\nWarte, bis der Gastgeber dich reinlässt …`;
          if (this.scene.isActive()) this.setView('busy');
        },
        cancel.signal,
      );
      this.cancelJoin = null;
      setCurrentRoom(room);
      this.attach(room);
      this.setView('room');
    } catch (e) {
      this.cancelJoin = null;
      if (!this.scene.isActive()) return;
      this.error = cancel.signal.aborted ? '' : (e as Error).message;
      this.setView('join');
    }
  }
}
