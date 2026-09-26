import Phaser from 'phaser';
import { sfx } from '../audio/sfx';
import { setupUiCamera, viewWidth, VIEW_H } from '../layout';
import { characterById } from '../meta/characters';
import { writeSave } from '../meta/save';
import type { RaceSession } from '../net/session';
import { headIcon } from '../render/art/skins';
import { panel, textButton } from '../ui/widgets';
import { currentRoom } from '../net/room';
import { hostStartRace, startCupRace, startLocalRace } from './flow';
import { activeCup, addRaceResult, cupRanking, isLastRace, racerKey, setActiveCup } from '../meta/cup';
import { uiText } from './HudScene';

export const TROPHIES_FOR_PLACE = [10, 6, 3, 1];

export interface ResultData {
  session: RaceSession;
}

export class ResultScene extends Phaser.Scene {
  constructor() {
    super('result');
  }

  create(data: ResultData) {
    setupUiCamera(this);
    const W = viewWidth(this);
    const H = VIEW_H;
    const { session } = data;
    const race = session.race;
    const me = race.runners[session.localId];

    // rewards
    const place = me.place;
    const trophies = TROPHIES_FOR_PLACE[place - 1] ?? 0;
    const bonus = [30, 15, 5, 0][place - 1] ?? 0;
    const coins = me.coins + bonus;
    const courseId = race.courseId;
    writeSave((s) => {
      s.coins += coins;
      s.trophies += trophies;
      s.stats.races += 1;
      if (place === 1) s.stats.wins += 1;
      if (courseId && me.finishTime > 0 && !(s.best[courseId] <= me.finishTime)) s.best[courseId] = me.finishTime;
    });
    const standings = race.standings();
    const cup = activeCup();
    if (cup) addRaceResult(cup, standings.map((r) => session.racers[r.id]));
    sfx.play(place === 1 ? 'finish' : place <= 2 ? 'go' : 'lose');

    this.add.rectangle(0, 0, W, H, 0x0d0a1a, 0.55).setOrigin(0, 0);
    const pw = Math.min(560, W - 40);
    const ph = 420;
    const cx = W / 2;
    const cy = H / 2 - 10;
    const g = panel(this, cx, cy, pw, ph);
    g.setScale(0.6);
    this.tweens.add({ targets: g, scale: 1, duration: 350, ease: 'Back.Out' });

    const content = this.add.container(0, 0).setAlpha(0);
    this.tweens.add({ targets: content, alpha: 1, delay: 200, duration: 250 });
    content.add(uiText(this, cx, cy - ph / 2 + 36, place === 1 ? 'SIEG!' : 'SIEGERTAFEL', 38, '#ffd84a').setOrigin(0.5));
    if (cup) {
      content.add(
        uiText(this, cx, cy - ph / 2 + 68, `${cup.name} · Rennen ${cup.index + 1} von ${cup.courses.length}`, 17, '#fff2b0').setOrigin(0.5),
      );
    }

    const medal = [0xffd84a, 0xc9ced8, 0xd08a4a, 0x7a7a8a];
    standings.forEach((r, i) => {
      const y = cy - ph / 2 + 100 + i * 58;
      const info = session.racers[r.id];
      const isMe = r.id === session.localId;
      const row = this.add.graphics();
      row.fillStyle(isMe ? 0xfff2b0 : 0x2a241c, isMe ? 0.9 : 0.35).fillRoundedRect(cx - pw / 2 + 30, y - 24, pw - 60, 48, 12);
      content.add(row);
      content.add(this.add.circle(cx - pw / 2 + 62, y, 17, medal[i]).setStrokeStyle(3, 0x2a241c));
      content.add(uiText(this, cx - pw / 2 + 62, y, String(i + 1), 20, '#2a241c').setOrigin(0.5).setStroke('#ffffff', 0));
      const icon = headIcon(this, characterById(info.character), 34);
      content.add(this.add.image(cx - pw / 2 + 110, y, icon.key).setScale(icon.scale));
      content.add(uiText(this, cx - pw / 2 + 140, y, info.name + (info.isBot ? ' 🤖' : ''), 22, isMe ? '#3a2a10' : '#ffffff').setOrigin(0, 0.5).setStroke(isMe ? '#fff2b0' : '#1d1a2f', 6));
      const time = r.finishTime >= 0 ? `${r.finishTime.toFixed(2)} s` : '—';
      const timeX = cup ? cx + pw / 2 - 172 : cx + pw / 2 - 50;
      content.add(uiText(this, timeX, y, time, 20, isMe ? '#3a2a10' : '#ffffff').setOrigin(1, 0.5).setStroke(isMe ? '#fff2b0' : '#1d1a2f', 6));
      if (cup) {
        const entry = cup.table.find((e) => e.key === racerKey(info));
        const pts = entry ? `+${entry.last}  = ${entry.points}` : '';
        content.add(uiText(this, cx + pw / 2 - 46, y, pts, 20, isMe ? '#3a2a10' : '#ffd84a').setOrigin(1, 0.5).setStroke(isMe ? '#fff2b0' : '#1d1a2f', 6));
      }
    });

    content.add(
      uiText(this, cx, cy + ph / 2 - 92, `+${coins} Münzen    +${trophies} Pokale`, 22, '#ffe68a').setOrigin(0.5),
    );

    const room = currentRoom();
    const online = session.online && room;
    const isHost = online && room.role === 'host';
    const cupDone = cup && isLastRace(cup);
    const leader = cup ? cupRanking(cup)[0] : null;
    if (cup && leader && !cupDone) {
      content.add(uiText(this, cx, cy + ph / 2 - 118, `Cup-Führung: ${leader.name} mit ${leader.points} Punkten`, 17, '#fff2b0').setOrigin(0.5));
    }
    const nextLabel = cupDone ? 'Siegerehrung 🏆' : cup ? `Weiter (${cup.index + 2}/${cup.courses.length})` : 'Nochmal!';
    const waitForHost = online && !isHost && !cupDone;
    const again = textButton(
      this,
      cx - 110,
      cy + ph / 2 - 40,
      210,
      54,
      waitForHost ? 'Warte …' : nextLabel,
      0x5fd35a,
      () => {
        if (cup && cupDone) {
          const mgr = this.game.scene;
          for (const key of ['hud', 'race', 'result']) if (mgr.isActive(key)) mgr.stop(key);
          mgr.start('podium', { cup, me: racerKey(session.racers[session.localId]), online: !!online });
        } else if (isHost) hostStartRace(this, room);
        else if (cup) startCupRace(this);
        else startLocalRace(this);
      },
      20,
    );
    if (waitForHost) again.setEnabled(false);
    const menu = textButton(
      this,
      cx + 110,
      cy + ph / 2 - 40,
      190,
      54,
      online ? 'Lobby' : 'Menü',
      0xffa94a,
      () => {
        if (!online) setActiveCup(null);
        const mgr = this.game.scene;
        for (const key of ['hud', 'race', 'result']) if (mgr.isActive(key)) mgr.stop(key);
        mgr.start(online ? 'lobby' : 'menu');
      },
      22,
    );
    content.add([again.container, menu.container]);
  }
}
