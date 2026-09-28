import Phaser from 'phaser';
import { ChatUI } from '../ui/chat';
import { fluteShort } from '../audio/flute';
import { sfx } from '../audio/sfx';
import { setupUiCamera, viewWidth, VIEW_H } from '../layout';
import { characterById } from '../meta/characters';
import { writeSave } from '../meta/save';
import type { RaceSession } from '../net/session';
import { headIcon } from '../render/art/skins';
import { panel, textButton } from '../ui/widgets';
import { AgainPanel } from '../ui/againPanel';
import { currentRoom } from '../net/room';
import { hostStartRace, startCupRace, startLocalRace } from './flow';
import { activeCup, addRaceResult, cupRanking, isLastRace, lastOut, racerKey, setActiveCup } from '../meta/cup';
import { uiText } from './HudScene';
import { announce, resultComment, resultTitle } from '../meta/lines';
import { countRace, refreshDaily, taskDef } from '../meta/daily';
import { TEAMS, cupTeamScores, scoreLine, teamScores } from '../meta/teams';

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
    const watching = !!session.spectator;
    const place = me.place;
    const trophies = watching ? 0 : (TROPHIES_FOR_PLACE[place - 1] ?? 0);
    // 2 vs 2: team points of this race; the winning team gets a bonus
    const myTeam = session.racers[session.localId]?.team;
    const teams = myTeam !== undefined ? teamScores(race.standings().map((r) => session.racers[r.id])) : null;
    const teamWin = !!teams && teams[0].team === myTeam;
    const bonus = ([30, 15, 5, 0][place - 1] ?? 0) + (teamWin ? 20 : 0);
    const coins = watching ? 0 : me.coins + bonus;
    const courseId = race.courseId;
    // daily tasks
    const raceScene = this.scene.get('race') as unknown as { stats?: { hits: number; abilities: number } };
    let doneTasks: string[] = [];
    if (!watching) {
      writeSave((s) => {
        s.daily = refreshDaily(s.daily);
        doneTasks = countRace(s.daily, { place, coins: me.coins, deaths: me.deaths, hits: raceScene.stats?.hits ?? 0, abilities: raceScene.stats?.abilities ?? 0 });
      });
    }
    if (!watching) writeSave((s) => {
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
    // the announcer: team result, or who is out of the K.-o. cup
    const koOut = cup && lastOut(cup);
    const shout = teams && !watching ? announce(teamWin ? 'teamWin' : 'teamLose') : koOut ? announce('out') : null;
    if (shout) this.time.delayedCall(700, () => sfx.speak(shout.clip, 5));
    // a badly played flute tune to round it off
    this.time.delayedCall(shout ? 2200 : 1300, () => fluteShort());

    this.add.rectangle(0, 0, W, H, 0x0d0a1a, 0.55).setOrigin(0, 0);
    // online (not the last cup race): room on the right for the "again?" panel
    const room = currentRoom();
    const online = session.online && room;
    const withAgain = !!online && !(cup && isLastRace(cup));
    const side = withAgain ? 270 : 0;
    const pw = Math.min(560, W - 40 - side);
    const ph = 420;
    const cx = (W - side) / 2;
    const cy = H / 2 - 10;
    const g = panel(this, cx, cy, pw, ph);
    g.setScale(0.6);
    this.tweens.add({ targets: g, scale: 1, duration: 350, ease: 'Back.Out' });

    const content = this.add.container(0, 0).setAlpha(0);
    this.tweens.add({ targets: content, alpha: 1, delay: 200, duration: 250 });
    const winner = teams ? TEAMS[teams[0].team] : null;
    const title = winner ? (teamWin ? `TEAMSIEG! ${winner.icon}` : `${winner.icon} ${winner.name} gewinnt`) : watching ? 'SIEGERTAFEL' : resultTitle(place);
    content.add(uiText(this, cx, cy - ph / 2 + 36, title, winner && !teamWin ? 32 : 38, winner ? winner.css : '#ffd84a').setOrigin(0.5));
    const sub = [cup ? `${cup.name} · Rennen ${cup.index + 1} von ${cup.courses.length}` : '', teams ? scoreLine(teams) : ''].filter((x) => x).join('   ·   ');
    const comment = watching ? '' : resultComment(place, me.deaths);
    if (sub || comment) content.add(uiText(this, cx, cy - ph / 2 + 68, sub || comment, 17, '#fff2b0').setOrigin(0.5));

    const medal = [0xffd84a, 0xc9ced8, 0xd08a4a, 0x7a7a8a];
    standings.forEach((r, i) => {
      const y = cy - ph / 2 + 100 + i * 58;
      const info = session.racers[r.id];
      const isMe = r.id === session.localId;
      const row = this.add.graphics();
      row.fillStyle(isMe ? 0xfff2b0 : 0x2a241c, isMe ? 0.9 : 0.35).fillRoundedRect(cx - pw / 2 + 30, y - 24, pw - 60, 48, 12);
      content.add(row);
      content.add(this.add.circle(cx - pw / 2 + 62, y, 17, medal[i]).setStrokeStyle(3, info.team !== undefined ? TEAMS[info.team].color : 0x2a241c));
      content.add(uiText(this, cx - pw / 2 + 62, y, String(i + 1), 20, '#2a241c').setOrigin(0.5).setStroke('#ffffff', 0));
      const icon = headIcon(this, characterById(info.character), 34, info.cosmetics?.skin);
      content.add(this.add.image(cx - pw / 2 + 110, y, icon.key).setScale(icon.scale));
      content.add(uiText(this, cx - pw / 2 + 140, y, info.name + (info.isBot ? ' 🤖' : ''), 22, isMe ? '#3a2a10' : '#ffffff').setOrigin(0, 0.5).setStroke(isMe ? '#fff2b0' : '#1d1a2f', 6));
      const time = r.finishTime >= 0 ? `${r.finishTime.toFixed(2)} s` : '—';
      const timeX = cup ? cx + pw / 2 - 172 : cx + pw / 2 - 50;
      content.add(uiText(this, timeX, y, time, 20, isMe ? '#3a2a10' : '#ffffff').setOrigin(1, 0.5).setStroke(isMe ? '#fff2b0' : '#1d1a2f', 6));
      if (cup) {
        const entry = cup.table.find((e) => e.key === racerKey(info));
        const ko = cup.mode === 'ko';
        const knocked = ko && !isLastRace(cup) && lastOut(cup)?.key === racerKey(info);
        const pts = ko ? (isLastRace(cup) ? '' : knocked ? '❌ raus' : '✔ weiter') : entry ? `+${entry.last}  = ${entry.points}` : '';
        content.add(uiText(this, cx + pw / 2 - 46, y, pts, 20, isMe ? '#3a2a10' : '#ffd84a').setOrigin(1, 0.5).setStroke(isMe ? '#fff2b0' : '#1d1a2f', 6));
      }
    });

    content.add(
      uiText(this, cx, cy + ph / 2 - 92, watching ? '👀 Du hast zugeschaut' : `+${coins} Münzen${teamWin ? ' (inkl. Teambonus)' : ''}    +${trophies} Pokale`, 22, '#ffe68a').setOrigin(0.5),
    );

    const isHost = online && room.role === 'host';
    const cupDone = cup && isLastRace(cup);
    const leader = cup ? cupRanking(cup)[0] : null;
    const out = cup ? lastOut(cup) : null;
    const cupTeams = cup ? cupTeamScores(cup) : [];
    if (cup && cupTeams.length && !cupDone) {
      content.add(uiText(this, cx, cy + ph / 2 - 118, `Cup-Stand: ${scoreLine(cupTeams)}`, 17, '#fff2b0').setOrigin(0.5));
    } else if (cup && out) {
      const next = cup.index + 1 >= cup.courses.length - 1 ? ' – jetzt kommt das Finale!' : '';
      content.add(uiText(this, cx, cy + ph / 2 - 118, `❌ ${out.name} scheidet aus${next}`, 17, '#ffb0b0').setOrigin(0.5));
    } else if (cup && leader && !cupDone && cup.mode !== 'ko') {
      content.add(uiText(this, cx, cy + ph / 2 - 118, `Cup-Führung: ${leader.name} mit ${leader.points} Punkten`, 17, '#fff2b0').setOrigin(0.5));
    }
    if (doneTasks.length) {
      content.add(uiText(this, cx, cy + ph / 2 - 142, `✔ Tagesaufgabe geschafft: ${doneTasks.map((id) => taskDef(id).text).join(', ')} – im Menü abholen!`, 15, '#9fff9a').setOrigin(0.5));
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
          // a knocked-out spectator watches someone else: find this phone's own racer key
          const mySeat = !online ? 0 : room!.role === 'host' ? 0 : room!.mySeat;
          const mine = watching ? cup.table.find((e) => !e.isBot && e.key.startsWith(`p:${mySeat}:`))?.key : racerKey(session.racers[session.localId]);
          mgr.start('coronation', { cup, me: mine ?? '', online: !!online });
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
        const back = (this.registry.get('returnScene') as string | undefined) ?? 'menu';
        this.registry.remove('returnScene');
        mgr.start(online ? 'lobby' : back);
      },
      22,
    );
    content.add([again.container, menu.container]);
    if (withAgain) {
      // the "again?" vote replaces the buttons
      again.container.setVisible(false);
      menu.container.setVisible(false);
      this.againPanel = new AgainPanel(this, room!, W - side / 2 - 6, cy, side - 20);
      new ChatUI(this, room!, { x: W - 30, y: 26, feed: { x: W - side + 8, y: cy + 172 }, wrap: side - 24 });
    }
  }

  private againPanel?: AgainPanel;

  update() {
    this.againPanel?.update();
  }
}
