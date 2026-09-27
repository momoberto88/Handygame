import Phaser from 'phaser';
import { currentRoom } from '../net/room';
import { ChatUI } from '../ui/chat';
import { TEAMS, scoreLine, teamScores } from '../meta/teams';
import { EMOTES, emoteChoices } from '../meta/emotes';
import { TutorialCoach } from './TutorialCoach';
import { sfx } from '../audio/sfx';
import { setupUiCamera, viewWidth, VIEW_H } from '../layout';
import { ABILITIES, characterById } from '../meta/characters';
import { loadSave } from '../meta/save';
import type { LocalInput } from '../net/session';
import { ITEM_KINDS } from '../sim/types';
import { ART_RES } from '../render/art/canvas';
import { headIcon } from '../render/art/skins';
import { itemIconKey } from '../render/art/entityArt';
import type { RaceScene } from './RaceScene';
import { setCurrentRoom } from '../net/room';
import { goToMenu } from './flow';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export function textStyle(size: number, color = '#ffffff', stroke = '#1d1a2f'): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT,
    fontSize: `${size * 2}px`,
    fontStyle: 'bold',
    color,
    stroke,
    strokeThickness: Math.max(4, size * 0.35),
  };
}

/** Text is rendered at 2x and scaled down so it stays crisp. */
export function uiText(scene: Phaser.Scene, x: number, y: number, text: string, size: number, color?: string) {
  return scene.add.text(x, y, text, textStyle(size, color)).setScale(0.5);
}

interface Button {
  x: number;
  y: number;
  r: number;
  bg: Phaser.GameObjects.Arc;
  icon: Phaser.GameObjects.Image;
}

export class HudScene extends Phaser.Scene {
  private raceScene!: RaceScene;
  private jumpBtn!: Button;
  private slideBtn!: Button;
  private itemBtn!: Button;
  private itemIcon!: Phaser.GameObjects.Image;
  private abilityBtn!: Button;
  private abilityIcon!: Phaser.GameObjects.Text;
  private abilityRing!: Phaser.GameObjects.Graphics;
  private pendingAbility = false;
  private wasCharged = false;
  private placeText!: Phaser.GameObjects.Text;
  private placeSub!: Phaser.GameObjects.Text;
  private coinText!: Phaser.GameObjects.Text;
  private coinIcon!: Phaser.GameObjects.Image;
  private bigText!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private warnText!: Phaser.GameObjects.Text;
  private progressBar!: Phaser.GameObjects.Graphics;
  private progressHeads: Phaser.GameObjects.Image[] = [];
  /** 2 vs 2: team colour dot behind each progress bar head, and the live team score. */
  private teamDots: Phaser.GameObjects.Arc[] = [];
  private teamText: Phaser.GameObjects.Text | null = null;
  private edgeMarkers: { root: Phaser.GameObjects.Container; arrow: Phaser.GameObjects.Triangle; dist: Phaser.GameObjects.Text }[] = [];
  private wallMarker!: Phaser.GameObjects.Arc;
  private danger!: Phaser.GameObjects.Image;
  private warnTimer = 0;
  private inkLayer!: Phaser.GameObjects.Container;
  private quitBtn!: Phaser.GameObjects.Text;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private pendingUse: -1 | 0 | 1 = 0;
  private itemPointers = new Map<number, { x: number; y: number }>();
  private rollTimer = 0;
  private rollIndex = 0;
  private W = 960;
  private leftHanded = false;

  constructor() {
    super('hud');
  }

  init(data: { race: RaceScene }) {
    this.raceScene = data.race;
    this.itemPointers.clear();
    this.pendingUse = 0;
    this.pendingAbility = false;
    this.wasCharged = false;
    this.progressHeads = [];
    this.teamDots = [];
    this.teamText = null;
    this.edgeMarkers = [];
  }

  create() {
    setupUiCamera(this);
    this.W = viewWidth(this);
    this.leftHanded = loadSave().settings.leftHanded;

    this.danger = this.add.image(0, 0, this.makeDangerTexture()).setOrigin(0, 0).setAlpha(0);
    this.inkLayer = this.add.container(0, 0);

    this.jumpBtn = this.makeButton('ui-jump', 0x4ad0ff);
    this.slideBtn = this.makeButton('ui-slide', 0xffb84a);
    this.itemBtn = this.makeButton('', 0x7aff6a);
    this.itemIcon = this.add.image(0, 0, itemIconKey('saw')).setScale(1.1 / ART_RES).setVisible(false);
    this.abilityBtn = this.makeButton('', 0xffd84a);
    this.abilityRing = this.add.graphics();
    const myAbility = characterById(this.raceScene.session.racers[this.raceScene.session.localId].character).ability;
    this.abilityIcon = uiText(this, 0, 0, ABILITIES[myAbility].icon, 34).setOrigin(0.5);

    this.placeText = uiText(this, 22, 10, '1.', 40, '#ffd84a');
    this.placeSub = uiText(this, 80, 30, '/4', 20);
    this.coinIcon = this.add.image(0, 30, 'coin').setScale(1.1 / ART_RES);
    this.coinText = uiText(this, 0, 16, '0', 22, '#ffe68a').setOrigin(1, 0);
    this.bigText = uiText(this, 0, VIEW_H * 0.36, '', 72, '#ffd84a').setOrigin(0.5).setAlpha(0);
    this.toastText = uiText(this, 0, 110, '', 30).setOrigin(0.5).setAlpha(0);
    this.statusText = uiText(this, 0, 76, '', 16, '#ffb0b0').setOrigin(0.5, 0);
    this.warnText = uiText(this, 0, 150, '⚠ RAKETE!', 26, '#ff6a4a').setOrigin(0.5).setVisible(false);
    this.progressBar = this.add.graphics();
    this.wallMarker = this.add.circle(0, 0, 7, 0x6a2a8a).setStrokeStyle(2, 0xc77dff);
    const session = this.raceScene.session;
    for (const info of session.racers) {
      if (info.team !== undefined) {
        this.teamDots.push(this.add.circle(0, 0, info.id === session.localId ? 17 : 13, TEAMS[info.team].color, 0.9));
      }
    }
    if (this.teamDots.length) this.teamText = uiText(this, 22, 62, '', 18, '#ffffff');
    for (const info of session.racers) {
      const c = characterById(info.character);
      const icon = headIcon(this, c, info.id === session.localId ? 28 : 21, info.cosmetics?.skin);
      const head = this.add.image(0, 0, icon.key).setScale(icon.scale);
      this.progressHeads.push(head);
    }
    for (const info of session.racers) {
      const c = characterById(info.character);
      const root = this.add.container(0, 0).setVisible(false);
      const bg = this.add.circle(0, 0, 19, 0x1d1a2f, 0.75).setStrokeStyle(3, info.team !== undefined ? TEAMS[info.team].color : c.marker);
      const icon = headIcon(this, c, 24, info.cosmetics?.skin);
      const head = this.add.image(0, 0, icon.key).setScale(icon.scale);
      const arrow = this.add.triangle(0, 0, 0, -7, 12, 0, 0, 7, c.marker);
      const dist = uiText(this, 0, 24, '', 12).setOrigin(0.5, 0);
      root.add([bg, head, arrow, dist]);
      this.edgeMarkers.push({ root, arrow, dist });
    }
    const local = this.progressHeads[session.localId];
    this.children.bringToTop(local);

    this.quitBtn = uiText(this, 0, 12, '✕', 22, '#ffffff').setOrigin(1, 0).setInteractive({ useHandCursor: true });
    this.quitBtn.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      this.quitRace();
    });

    if (!session.spectator && session.sendEmote && !session.tutorial) this.makeEmotes();
    // online: chat with the others (their messages appear as speech bubbles over their runners)
    const room = currentRoom();
    if (session.online && room) {
      this.chat = new ChatUI(this, room, { x: 0, y: 30, race: true, onMessage: (m) => this.raceScene.chatBubble(m.seat, m.text) });
    }
    this.layout();
    this.coach = session.tutorial
      ? new TutorialCoach(this, session, { jump: this.jumpBtn.bg, slide: this.slideBtn.bg, item: this.itemBtn.bg, ability: this.abilityBtn.bg }, this.W)
      : undefined;
    if (session.spectator) {
      // knocked out of a K.-o. cup: no controls, just a banner
      for (const b of [this.jumpBtn, this.slideBtn, this.itemBtn, this.abilityBtn]) {
        b.bg.setVisible(false);
        b.icon.setVisible(false);
      }
      this.abilityIcon.setVisible(false);
      this.abilityRing.setVisible(false);
      this.itemIcon.setAlpha(0);
      const watched = session.racers[session.localId]?.name ?? '';
      uiText(this, this.W / 2, VIEW_H - 40, `👀 Du bist raus – du schaust ${watched} zu`, 22, '#ffd84a').setOrigin(0.5);
    }
    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize, this));

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      sfx.unlock();
      const pos = this.toUi(p);
      const zone = this.zoneOf(pos.x, pos.y);
      if (zone === 'item') this.itemPointers.set(p.id, pos);
      if (zone === 'ability') this.pendingAbility = true;
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const start = this.itemPointers.get(p.id);
      if (!start) return;
      this.itemPointers.delete(p.id);
      const pos = this.toUi(p);
      this.pendingUse = pos.x - start.x < -40 ? -1 : 1;
    });

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('SPACE,UP,W,DOWN,S,RIGHT,D,E,LEFT,A,Q') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown', (ev: KeyboardEvent) => {
      sfx.unlock();
      if (['ArrowRight', 'd', 'D', 'e', 'E'].includes(ev.key)) this.pendingUse = 1;
      if (['ArrowLeft', 'a', 'A', 'q', 'Q'].includes(ev.key)) this.pendingUse = -1;
      if (['f', 'F', 'r', 'R', 'Shift'].includes(ev.key)) this.pendingAbility = true;
      if (ev.key === 'Escape') this.quitRace();
    });
  }

  private coach?: TutorialCoach;
  private emoteBtn?: Phaser.GameObjects.Text;
  private chat?: ChatUI;
  private emoteBar?: Phaser.GameObjects.Container;
  private lastEmote = 0;

  /** 😀 button in the top bar; opens a row of emotes (also in the top bar, away from the controls). */
  private makeEmotes() {
    const stop = (ev: Phaser.Types.Input.EventData) => ev.stopPropagation();
    this.emoteBtn = uiText(this, 0, 14, '😀', 30).setOrigin(0.5, 0).setInteractive({ useHandCursor: true });
    this.emoteBtn.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      stop(ev);
      sfx.unlock();
      this.emoteBar?.setVisible(!this.emoteBar.visible);
    });
    this.emoteBar = this.add.container(0, 0).setVisible(false);
    const choices = emoteChoices();
    const bg = this.add.graphics();
    bg.fillStyle(0x1d1a2f, 0.75).fillRoundedRect(-choices.length * 46 - 10, 4, choices.length * 46 + 12, 56, 16);
    this.emoteBar.add(bg);
    choices.forEach((e, k) => {
      const t = uiText(this, -choices.length * 46 + 18 + k * 46, 12, EMOTES[e], 32).setOrigin(0.5, 0).setInteractive({ useHandCursor: true });
      t.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
        stop(ev);
        const now = this.time.now;
        if (now - this.lastEmote < 1200) return;
        this.lastEmote = now;
        this.raceScene.session.sendEmote?.(e);
        this.emoteBar?.setVisible(false);
      });
      this.emoteBar!.add(t);
    });
  }

  private quitRace() {
    sfx.play('click');
    if (this.raceScene.session.online) setCurrentRoom(null);
    goToMenu(this);
  }

  private onResize() {
    setupUiCamera(this);
    this.W = viewWidth(this);
    this.layout();
  }

  private toUi(p: Phaser.Input.Pointer) {
    const pt = this.cameras.main.getWorldPoint(p.x, p.y);
    return { x: pt.x, y: pt.y };
  }

  private makeDangerTexture(): string {
    const key = 'hud-danger';
    if (!this.textures.exists(key)) {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 16;
      const ctx = c.getContext('2d')!;
      const g = ctx.createLinearGradient(0, 0, 256, 0);
      g.addColorStop(0, 'rgba(150,40,200,0.85)');
      g.addColorStop(1, 'rgba(150,40,200,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 16);
      this.textures.addCanvas(key, c);
    }
    return key;
  }

  private makeButton(icon: string, color: number): Button {
    const bg = this.add.circle(0, 0, 60, color, 0.28).setStrokeStyle(4, 0xffffff, 0.75);
    const img = icon ? this.add.image(0, 0, icon).setScale(1.3 / ART_RES).setAlpha(0.9) : this.add.image(0, 0, 'coin').setVisible(false);
    return { x: 0, y: 0, r: 60, bg, icon: img };
  }

  private placeButton(b: Button, x: number, y: number, r: number) {
    b.x = x;
    b.y = y;
    b.r = r;
    b.bg.setPosition(x, y).setRadius(r);
    b.icon.setPosition(x, y);
  }

  private layout() {
    const W = this.W;
    const H = VIEW_H;
    const left = (x: number) => (this.leftHanded ? W - x : x);
    this.placeButton(this.jumpBtn, left(92), H - 92, 70);
    this.placeButton(this.slideBtn, left(236), H - 64, 52);
    this.placeButton(this.itemBtn, this.leftHanded ? 96 : W - 96, H - 92, 66);
    this.itemIcon.setPosition(this.itemBtn.x, this.itemBtn.y);
    this.placeButton(this.abilityBtn, this.leftHanded ? 236 : W - 236, H - 62, 44);
    this.abilityIcon.setPosition(this.abilityBtn.x, this.abilityBtn.y);
    this.coinText.setPosition(W - 70, 16);
    this.coinIcon.setPosition(W - 56, 30);
    this.quitBtn.setPosition(W - 16, 14);
    this.coach?.layout(W);
    this.emoteBtn?.setPosition(W - 172, 10);
    this.chat?.setPosition(W - 222, 30);
    this.emoteBar?.setPosition(W - 196, 0);
    this.bigText.setX(W / 2);
    this.toastText.setX(W / 2);
    this.statusText.setX(W / 2);
    this.warnText.setX(W / 2);
    this.danger.setDisplaySize(W * 0.28, H);
  }

  private zoneOf(x: number, y: number): 'jump' | 'slide' | 'item' | 'ability' | null {
    if (y < 70) return null; // top bar (quit button, etc.)
    const onLeft = this.leftHanded ? x > this.W * 0.5 : x < this.W * 0.5;
    if (!onLeft) {
      const d = Phaser.Math.Distance.Between(x, y, this.abilityBtn.x, this.abilityBtn.y);
      return d < this.abilityBtn.r * 1.3 ? 'ability' : 'item';
    }
    const d = Phaser.Math.Distance.Between(x, y, this.slideBtn.x, this.slideBtn.y);
    if (d < this.slideBtn.r * 1.35) return 'slide';
    // Everything else on the thumb side jumps, except a strip right of the slide button (also slide).
    const beyondSlide = this.leftHanded ? x < this.slideBtn.x : x > this.slideBtn.x;
    if (beyondSlide && y > VIEW_H * 0.55) return 'slide';
    return 'jump';
  }

  readInput(): LocalInput {
    if (this.raceScene.session.spectator) return { jump: false, slide: false, use: 0 };
    // choosing a chat phrase must not make you jump or throw
    if (this.chat?.isOpen) return { jump: false, slide: false, use: 0 };
    let jump = false;
    let slide = false;
    for (const p of this.input.manager.pointers) {
      if (!p.isDown) continue;
      const pos = this.toUi(p);
      const z = this.zoneOf(pos.x, pos.y);
      if (z === 'jump') jump = true;
      if (z === 'slide') slide = true;
    }
    const k = this.keys;
    if (k) {
      jump ||= k.SPACE.isDown || k.UP.isDown || k.W.isDown;
      slide ||= k.DOWN.isDown || k.S.isDown;
    }
    const use = this.pendingUse;
    const ability = this.pendingAbility;
    this.pendingUse = 0;
    this.pendingAbility = false;
    this.jumpBtn.bg.setFillStyle(0x4ad0ff, jump ? 0.6 : 0.28);
    this.slideBtn.bg.setFillStyle(0xffb84a, slide ? 0.6 : 0.28);
    return { jump, slide, use, ability };
  }

  /** Rivals that are off screen show up as heads at the screen edge (with distance in metres). */
  private updateEdgeMarkers() {
    const session = this.raceScene.session;
    const view = this.raceScene.cameras.main.worldView;
    const W = this.W;
    const me = session.race.runners[session.localId];
    session.race.runners.forEach((r, i) => {
      const m = this.edgeMarkers[i];
      if (!m || i === session.localId || r.mode === 'finished') {
        m?.root.setVisible(false);
        return;
      }
      const pos = this.raceScene.renderPos(i);
      const inside = pos.x > view.x - 10 && pos.x < view.right + 10 && pos.y > view.y && pos.y - 40 < view.bottom;
      if (inside) {
        m.root.setVisible(false);
        return;
      }
      const ahead = pos.x >= view.right;
      const behind = pos.x <= view.x;
      const sy = Phaser.Math.Clamp(((pos.y - 30 - view.y) / view.height) * VIEW_H, 90, VIEW_H - 170);
      const x = ahead ? W - 34 : behind ? 34 : Phaser.Math.Clamp(((pos.x - view.x) / view.width) * W, 34, W - 34);
      m.root.setVisible(true).setPosition(x, sy);
      m.arrow.setPosition(ahead ? 24 : behind ? -24 : 0, 0).setRotation(ahead ? 0 : behind ? Math.PI : pos.y < view.y ? -Math.PI / 2 : Math.PI / 2);
      const metres = Math.round(Math.abs(r.x - me.x) / 40);
      m.dist.setText(metres > 0 ? `${metres} m` : '');
      m.root.setAlpha(r.mode === 'dead' ? 0.45 : 1);
    });
    // Keep markers on the same edge from overlapping.
    for (const side of [34, W - 34]) {
      const list = this.edgeMarkers.filter((m) => m.root.visible && m.root.x === side).sort((a, b) => a.root.y - b.root.y);
      for (let i = 1; i < list.length; i++) {
        if (list[i].root.y - list[i - 1].root.y < 50) list[i].root.y = list[i - 1].root.y + 50;
      }
    }
  }

  countdown(text: string) {
    this.bigText.setText(text).setAlpha(1).setScale(1.1);
    this.tweens.killTweensOf(this.bigText);
    this.tweens.add({ targets: this.bigText, scale: 0.5, duration: 250, ease: 'Back.Out' });
    this.tweens.add({ targets: this.bigText, alpha: 0, delay: text.startsWith('LOS') ? 500 : 650, duration: 250 });
  }

  toast(text: string, color = '#ffffff', big = false) {
    this.toastText.setText(text).setColor(color).setAlpha(1).setScale(big ? 0.8 : 0.5);
    this.tweens.killTweensOf(this.toastText);
    this.tweens.add({ targets: this.toastText, scale: big ? 0.65 : 0.45, duration: 200, ease: 'Back.Out' });
    this.tweens.add({ targets: this.toastText, alpha: 0, delay: big ? 2200 : 1200, duration: 300 });
  }

  inkSplat() {
    this.inkLayer.removeAll(true);
    // Big blots, but the runner's own spot (left third) stays readable.
    const spots = [
      [0.55, 0.3],
      [0.78, 0.55],
      [0.4, 0.62],
    ];
    spots.forEach(([fx, fy], i) => {
      const img = this.add
        .image(this.W * fx + (Math.random() - 0.5) * 60, VIEW_H * fy + (Math.random() - 0.5) * 40, 'ink-splat')
        .setRotation(Math.random() * 6)
        .setAlpha(0.92);
      this.inkLayer.add(img);
      img.setScale(0);
      this.tweens.add({ targets: img, scale: (0.42 + Math.random() * 0.22) / ART_RES, duration: 180, delay: i * 70, ease: "Back.Out" });
    });
  }

  update(_t: number, delta: number) {
    const session = this.raceScene.session;
    const race = session.race;
    const me = race.runners[session.localId];
    const dt = delta / 1000;

    const place = me.place > 0 ? me.place : race.placeOf(me.id);
    this.placeText.setText(`${place}.`);
    this.placeSub.setText(`/${race.runners.length}`);
    this.coinText.setText(String(me.coins));
    this.statusText.setText(session.status() ?? '');
    this.coach?.update(dt, this.raceScene.lastEvents);

    // progress bar
    const W = this.W;
    const x0 = W * 0.3;
    const x1 = W * 0.7;
    const y = 26;
    const g = this.progressBar;
    g.clear();
    g.fillStyle(0x1d1a2f, 0.6).fillRoundedRect(x0 - 6, y - 7, x1 - x0 + 12, 14, 7);
    g.fillStyle(0xffffff, 0.9).fillRoundedRect(x0, y - 3, x1 - x0, 6, 3);
    g.fillStyle(0x1a1a1a, 1).fillRect(x1 - 3, y - 12, 6, 24);
    const t = race.track;
    const toBar = (x: number) => x0 + Phaser.Math.Clamp((x - t.startX) / (t.finishX - t.startX), 0, 1) * (x1 - x0);
    race.runners.forEach((r, i) => {
      const head = this.progressHeads[i];
      head.setPosition(toBar(r.x), y + (i === session.localId ? 0 : -2)).setAlpha(r.mode === 'dead' ? 0.4 : 1);
      this.teamDots[i]?.setPosition(head.x, head.y).setAlpha(head.alpha * 0.9);
    });
    if (this.teamText) this.teamText.setText(scoreLine(teamScores(race.standings().map((r) => session.racers[r.id]))));
    this.wallMarker.setPosition(toBar(race.wallX), y).setVisible(race.wallX > t.startX);

    // item slot (spectators have no controls)
    if (session.spectator) {
      this.updateEdgeMarkers();
      return;
    }
    if (me.rolling > 0) {
      this.rollTimer -= dt;
      if (this.rollTimer <= 0) {
        this.rollTimer = 0.07;
        this.rollIndex = (this.rollIndex + 1) % ITEM_KINDS.length;
        this.itemIcon.setTexture(itemIconKey(ITEM_KINDS[this.rollIndex]));
        sfx.play('roll');
      }
      this.itemIcon.setVisible(true).setAlpha(0.7);
    } else if (me.item) {
      this.itemIcon.setTexture(itemIconKey(me.item)).setVisible(true).setAlpha(1);
      this.itemIcon.setScale((1.15 + Math.sin(race.clock * 8) * 0.06) / ART_RES);
    } else {
      this.itemIcon.setVisible(false);
    }
    this.itemBtn.bg.setFillStyle(0x7aff6a, me.item ? 0.45 : 0.15);

    // ability: ring fills up, the button glows when it is ready
    const ready = me.charge >= 1;
    const ab = this.abilityBtn;
    const ring = this.abilityRing;
    ring.clear();
    ring.lineStyle(6, 0x1d1a2f, 0.5).strokeCircle(ab.x, ab.y, ab.r + 4);
    ring.lineStyle(6, ready ? 0xffd84a : 0xfff2b0, 1);
    ring.beginPath();
    ring.arc(ab.x, ab.y, ab.r + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * me.charge, false);
    ring.strokePath();
    ab.bg.setFillStyle(0xffd84a, ready ? 0.45 + Math.sin(race.clock * 9) * 0.15 : 0.12);
    this.abilityIcon.setAlpha(ready ? 1 : 0.45).setScale(ready ? 0.5 + Math.sin(race.clock * 9) * 0.03 : 0.45);
    if (ready && !this.wasCharged) {
      sfx.play('item');
      this.toast(`${ABILITIES[race.abilities[me.id] ?? 'sprint'].name} bereit!`, '#ffd84a');
    }
    this.wasCharged = ready;

    this.updateEdgeMarkers();

    const rocketIncoming = race.projectiles.some((p) => p.kind === 'rocket' && p.target === me.id);
    this.warnText.setVisible(rocketIncoming && Math.floor(race.clock * 6) % 2 === 0);

    // chaos wall danger: the left edge glows red and pulses, a warning beeps faster the closer it gets
    const gap = me.x - race.wallX;
    const near = me.mode === 'run' && !session.spectator ? Phaser.Math.Clamp(1 - (gap - 80) / 420, 0, 1) : 0;
    const pulse = 0.75 + 0.25 * Math.sin(this.time.now / (near > 0.6 ? 70 : 120));
    this.danger.setAlpha(near * 0.9 * pulse);
    if (near > 0.15) {
      this.warnTimer -= this.game.loop.delta / 1000;
      if (this.warnTimer <= 0) {
        sfx.play('warn', 0.4 + near * 0.5);
        this.warnTimer = 0.75 - near * 0.5;
      }
    } else this.warnTimer = 0;

    // ink fades out
    const inkAlpha = Phaser.Math.Clamp(me.ink / 0.8, 0, 1);
    this.inkLayer.setAlpha(inkAlpha);
    if (me.ink <= 0 && this.inkLayer.length) this.inkLayer.removeAll(true);
  }
}
