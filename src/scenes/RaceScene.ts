import { TEAMS } from '../meta/teams';
import { TRAILS } from '../meta/cosmetics';
import { EMOTES } from '../meta/emotes';
import { announce, deathLine, finishLine, goLine, robbedLine, shieldLine, stoleLine, stunnedLine, swallowedLine, talk, type Line, type TalkMoment } from '../meta/lines';
import clipList from '../audio/clips.json';
import Phaser from 'phaser';
import { sfx } from '../audio/sfx';
import { viewZoom, VIEW_H } from '../layout';
import { characterById } from '../meta/characters';
import { CAMERA_DISTANCES, loadSave } from '../meta/save';
import type { LocalInput, RaceSession } from '../net/session';
import type { SimEvent } from '../sim/types';
import { ART_RES } from '../render/art/canvas';
import { BackgroundView } from '../render/BackgroundView';
import { CameraDirector } from '../render/CameraDirector';
import { ChaosWallView } from '../render/ChaosWallView';
import { Effects } from '../render/Effects';
import { RunnerView } from '../render/RunnerView';
import { TrackView } from '../render/TrackView';
import type { HudScene } from './HudScene';
import { BotBrain } from '../sim/bot';
import { debugParam } from './flow';
import { GhostRecorder, ghostAt, loadGhost, offerGhost, type Ghost } from '../meta/ghost';
import { createRunner, isDrafting } from '../sim/race';
import { MASK_TIME } from '../sim/constants';
import { LocalSession } from '../net/LocalSession';

/** World pixels visible from top to bottom of the race view (camera distance setting). */
function raceViewH(): number {
  const id = debugParam('cam') ?? loadSave().settings.camera;
  return (CAMERA_DISTANCES.find((c) => c.id === id) ?? CAMERA_DISTANCES[1]).viewH;
}

export interface RaceSceneData {
  session: RaceSession;
}

export class RaceScene extends Phaser.Scene {
  session!: RaceSession;
  private views: RunnerView[] = [];
  private trackView!: TrackView;
  private wallView!: ChaosWallView;
  private bg!: BackgroundView;
  fx!: Effects;
  private projectileViews = new Map<number, Phaser.GameObjects.Image>();
  private trapViews = new Map<number, Phaser.GameObjects.Image>();
  camera!: CameraDirector;
  private endTimer = -1;
  private hud!: HudScene;
  private dustTimer = 0;
  lastEvents: SimEvent[] = [];
  /** Debug/testing: lets a bot drive the local runner in online races (?autoplay). */
  private autopilot: BotBrain | null = null;
  /** Trash-talk speech bubbles over the runners. */
  private bubbles: { id: number; bubble: Phaser.GameObjects.Container; h: number; until: number }[] = [];
  private lastBubble = 0;
  private lastBotTalk = 0;
  private bubbleCooldown = new Map<number, number>();
  /** For overtake talk and "new leader" calls. */
  private lastPlace = 0;
  private leader = -1;
  private lastLeadCall = 0;
  private startTalked = false;
  private wasSliding = false;

  constructor() {
    super('race');
  }

  init(data: RaceSceneData) {
    this.session = data.session;
    this.views = [];
    this.projectileViews.clear();
    this.trapViews.clear();
    this.endTimer = -1;
    this.bubbles = [];
    this.lastBubble = 0;
    this.bubbleCooldown.clear();
    this.lastPlace = 0;
    this.leader = -1;
    this.lastLeadCall = 0;
    this.startTalked = false;
    this.stats = { hits: 0, abilities: 0 };
    this.wasSliding = false;
    this.autopilot = debugParam('autoplay') !== null && this.session.online ? new BotBrain(99, { skill: 0.8 }) : null;
  }

  create() {
    const { race } = this.session;
    this.bg = new BackgroundView(this, race.track.world);
    this.trackView = new TrackView(this, race.track);
    this.wallView = new ChaosWallView(this, race.track.world);
    this.fx = new Effects(this);

    for (const info of this.session.racers) {
      const isLocal = info.id === this.session.localId;
      const view = new RunnerView(this, characterById(info.character), isLocal, isLocal ? undefined : info.name, info.cosmetics?.skin);
      view.setDepth(isLocal ? 36 : 32 + info.id * 0.1);
      if (isLocal && !this.session.spectator) view.markAsYou();
      if (info.team !== undefined) view.setTeam(TEAMS[info.team].color, TEAMS[info.team].css);
      this.views.push(view);
    }
    this.setupGhost();
    sfx.playMusic(`music/${race.track.world}`, 0.32);
    // voices of the racers in this race and the announcer
    const who = new Set([...this.session.racers.map((r) => r.character), 'announcer']);
    sfx.preload((clipList as string[]).filter((c) => c.startsWith('voice/') && who.has(c.split('/')[1])));

    // The race camera is a bit closer than the menus so the runners read well on small phones.
    this.camera = new CameraDirector(this.cameras.main, () => viewZoom(this) * (VIEW_H / raceViewH()));
    this.events.once('shutdown', () => this.session.destroy());

    this.scene.launch('hud', { race: this });
    this.hud = this.scene.get('hud') as HudScene;
  }

  readInput(): LocalInput {
    const input = this.hud?.readInput?.() ?? { jump: false, slide: false, use: 0 };
    if (this.autopilot) {
      const bot = this.autopilot.think(this.session.race, this.session.localId);
      return { jump: bot.jump, slide: bot.slide, use: bot.use };
    }
    return input;
  }

  /** Offline races on a fixed or editor course record the run and replay the best one as a ghost. */
  private recorder: GhostRecorder | null = null;
  private ghost: Ghost | null = null;
  private ghostView: RunnerView | null = null;
  private ghostState = createRunner(99, 0, 0);
  private ghostSaved = false;

  private setupGhost() {
    this.recorder = null;
    this.ghost = null;
    this.ghostView = null;
    this.ghostSaved = false;
    const courseId = this.session.race.courseId;
    if (this.session.online || this.session.spectator || !courseId) return;
    this.recorder = new GhostRecorder();
    this.ghost = loadGhost(courseId);
    if (this.ghost) {
      this.ghostView = new RunnerView(this, characterById(this.ghost.character), false, `Geist ${this.ghost.time.toFixed(1)} s`);
      this.ghostView.setDepth(19);
    }
  }

  private updateGhost(dt: number) {
    const { race } = this.session;
    const me = race.runners[this.session.localId];
    this.recorder?.sample(race.tick, race.time, me);
    if (this.ghost && this.ghostView) {
      const visible = ghostAt(this.ghost, race.time, this.ghostState);
      this.ghostView.root.setVisible(visible);
      if (visible) {
        this.ghostView.update(this.ghostState, this.ghostState.x, this.ghostState.y, dt, race.clock);
        this.ghostView.root.setAlpha(0.4); // the view animates its own alpha; keep the ghost see-through
      }
    }
    if (this.recorder && !this.ghostSaved && me.mode === 'finished' && me.finishTime > 0 && race.courseId) {
      this.ghostSaved = true;
      const info = this.session.racers[this.session.localId];
      const allowed = !info.isBot || debugParam('ghost') !== null; // autopilot tests can record too
      const saved = allowed && offerGhost({ courseId: race.courseId, time: me.finishTime, character: info.character, frames: this.recorder.frames });
      if (saved && this.ghost) this.hud?.toast('Neue Bestzeit – dein Geist ist gespeichert!', '#9ff3ff');
    }
  }

  /** Hit-stop: after a big hit the local race runs in slow motion for a moment (ms left). */
  private hitStop = 0;

  private punch(ms = 90) {
    // only offline: online everyone shares the host's clock
    if (this.session instanceof LocalSession) this.hitStop = Math.max(this.hitStop, ms);
  }

  update(_time: number, delta: number) {
    const dt = delta / 1000;
    const simDelta = this.hitStop > 0 ? delta * 0.15 : delta;
    this.hitStop = Math.max(0, this.hitStop - delta);
    const events = this.session.update(simDelta, this.readInput());
    this.lastEvents = events;
    const { race } = this.session;
    for (const e of events) this.handleEvent(e);

    race.runners.forEach((r, i) => {
      const { x, y } = this.renderPos(i);
      this.views[i].update(r, x, y, dt, race.clock);
      if (r.boost > 0 && r.mode === 'run') this.fx.boostTrail(x, y);
    });
    this.updateDraft(dt);
    this.fx.update();
    this.updateGhost(dt);
    this.updateBubbles();
    this.updateTalk();
    this.updateTrails(dt);
    for (const [id, e] of this.session.takeEmotes?.() ?? []) {
      if (!this.session.racers[id]) continue;
      this.showBubble(id, EMOTES[e] ?? '❓', true);
      if (this.nearCamera(race.runners[id].x)) sfx.play('click');
    }

    this.dustTimer -= dt;
    if (this.dustTimer <= 0) {
      this.dustTimer = 0.09;
      for (const r of race.runners) {
        if (r.mode === 'run' && r.grounded && (r.sliding || r.vx > 300)) this.fx.footDust(r.x - 6, r.y, r.sliding ? 2 : 1);
      }
    }

    this.updateCamera(dt);
    const cam = this.cameras.main;
    const view = cam.worldView;
    this.trackView.update(race.clock, dt, view.x, view.right, race.coinTaken[this.session.localId], race.boxCooldown);
    this.wallView.update(race.wallX, race.clock, view.x);
    this.bg.update(cam);
    this.updateProjectiles();

    if (race.over) {
      if (this.endTimer < 0) this.endTimer = 2.2;
      this.endTimer -= dt;
      if (this.endTimer <= 0 && !this.scene.isActive('result')) {
        this.scene.launch('result', { session: this.session });
        this.endTimer = 9999;
      }
    }
  }

  /** Interpolated on-screen position of a runner (between sim ticks, plus network smoothing). */
  /** A chat message from the room: a speech bubble over the sender's runner (if racing). */
  chatBubble(seat: number, text: string) {
    const racer = this.session.racers.find((r) => r.seat === seat && !r.isBot);
    if (racer) this.showBubble(racer.id, text);
  }

  /** Within a short distance of your own runner. */
  private nearMe(x: number, y: number): boolean {
    const me = this.session.race.runners[this.session.localId];
    return Math.abs(me.x - x) < 360 && Math.abs(me.y - y) < 260;
  }

  renderPos(id: number): { x: number; y: number } {
    const r = this.session.race.runners[id];
    const alpha = this.session.alpha;
    const prev = this.session.prevPosition(id);
    const off = this.session.renderOffset?.(id);
    return { x: prev.x + (r.x - prev.x) * alpha + (off?.x ?? 0), y: prev.y + (r.y - prev.y) * alpha + (off?.y ?? 0) };
  }

  private updateCamera(dt: number) {
    const { race } = this.session;
    const r = race.runners[this.session.localId];
    const p = this.renderPos(r.id);
    this.camera.update(r, p.x, p.y, dt, race.time, race.over);
  }

  private updateProjectiles() {
    const { race } = this.session;
    const s = 1 / ART_RES;
    const seen = new Set<number>();
    for (const p of race.projectiles) {
      seen.add(p.id);
      let img = this.projectileViews.get(p.id);
      if (!img) {
        const key = p.kind === 'saw' ? 'saw-small' : p.kind === 'rocket' ? 'rocket' : 'trap-open';
        img = this.add.image(p.x, p.y, key).setScale(s).setDepth(38);
        this.projectileViews.set(p.id, img);
      }
      img.setPosition(p.x, p.y);
      if (p.kind === 'saw') img.rotation += 0.35 * Math.sign(p.vx || 1);
      else if (p.kind === 'rocket') {
        img.rotation = Math.atan2(p.vy, p.vx);
        if (Math.random() < 0.6) this.fx.footDust(p.x - Math.cos(img.rotation) * 16, p.y - Math.sin(img.rotation) * 16 + 2, 1);
      } else img.rotation += 0.2;
    }
    for (const [id, img] of this.projectileViews) {
      if (!seen.has(id)) {
        img.destroy();
        this.projectileViews.delete(id);
      }
    }
    const trapSeen = new Set<number>();
    for (const t of race.traps) {
      trapSeen.add(t.id);
      if (!this.trapViews.has(t.id)) {
        this.trapViews.set(t.id, this.add.image(t.x, t.y, 'trap-open').setOrigin(0.5, 0.85).setScale(s).setDepth(33));
      }
    }
    for (const [id, img] of this.trapViews) {
      if (!trapSeen.has(id)) {
        img.destroy();
        this.trapViews.delete(id);
      }
    }
  }

  /**
   * A character says something: speech bubble plus its recorded voice, if it is on screen and
   * hasn't talked lately. Your own character is louder and may interrupt the others.
   */
  private say(id: number, moment: TalkMoment, force = false): boolean {
    const line = talk(this.session.racers[id].character, moment);
    const r = this.session.race.runners[id];
    const now = this.time.now;
    const v = this.cameras.main.worldView;
    const local = this.isLocal(id);
    // only runners you can actually see talk
    if (!line || r.x < v.x + 40 || r.x > v.right - 40 || r.y < v.y + 40 || r.y > v.bottom) return false;
    if (!force && (now - this.lastBubble < 1500 || (this.bubbleCooldown.get(id) ?? 0) > now)) return false;
    // bots keep it down: one at a time, now and then, so you keep the overview
    if (!local && (now - this.lastBotTalk < 4500 || (this.bubbleCooldown.get(id) ?? 0) > now)) return false;
    this.lastBubble = now;
    if (!local) this.lastBotTalk = now;
    this.bubbleCooldown.set(id, now + (local ? 5000 : 12000));
    sfx.speak(line.clip, (local ? 3 : 1) + (force ? 1 : 0), local ? 1 : 0.75);
    // what you hear doesn't need to be read as well: the bubble only shows with the voices off
    if (!sfx.voicesHeard) this.showBubble(id, line.text);
    return true;
  }

  /** The announcer shouts (his text shows where the caller puts it). */
  private shout(line: Line | null, priority = 5) {
    if (line?.clip) sfx.speak(line.clip, priority, 1);
  }

  private showBubble(id: number, line: string, emote = false) {
    const now = this.time.now;
    for (const b of this.bubbles.filter((b) => b.id === id)) b.until = 0;
    // comic speech bubble: rounded box with a border and a little tail
    const text = this.add
      .text(0, 0, line, { fontFamily: 'system-ui, sans-serif', fontSize: emote ? '56px' : '26px', fontStyle: 'bold', color: '#1d1a2f', align: 'center', wordWrap: { width: 360 } })
      .setOrigin(0.5, 1);
    const w = text.width + 28;
    const h = text.height + 16;
    const g = this.add.graphics();
    g.fillStyle(0xfff8e6, 1).lineStyle(4, 0x1d1a2f, 1);
    g.fillRoundedRect(-w / 2, -h - 14, w, h, 14).strokeRoundedRect(-w / 2, -h - 14, w, h, 14);
    g.fillTriangle(-12, -16, 12, -16, -4, 0).lineBetween(-12, -14, -4, 0).lineBetween(12, -14, -4, 0);
    text.setPosition(0, -22);
    const bubble = this.add.container(0, 0, [g, text]).setScale(0.66).setDepth(60);
    this.bubbles.push({ id, bubble, h: (h + 14) * 0.66, until: now + 2600 });
  }

  private draftTimer = 0;
  /** How long the own runner has been in a slipstream, and when the hint may show again. */
  private draftFor = 0;
  private draftHintAt = 0;

  /** Slipstream: air lines around everyone in it, and now and then a hint for the own runner. */
  private updateDraft(dt: number) {
    const { race, localId } = this.session;
    this.draftTimer -= dt;
    const emit = this.draftTimer <= 0;
    if (emit) this.draftTimer = 0.045;
    race.runners.forEach((r, i) => {
      const drafting = isDrafting(race.runners, r);
      if (i === localId && !this.session.spectator) {
        this.draftFor = drafting ? this.draftFor + dt : 0;
        if (this.draftFor > 0.4 && race.time > this.draftHintAt) {
          this.draftHintAt = race.time + 12;
          this.fx.riderWord('💨 WINDSCHATTEN!', () => this.renderPos(i), '#bfe9ff');
        }
      }
      if (!drafting || !emit || r.boost > 0 || !this.nearCamera(r.x)) return;
      const { x, y } = this.renderPos(i);
      this.fx.draftTrail(x, y);
    });
  }

  private trailTimers: number[] = [];
  /** Your hits and abilities in this race (for the daily tasks). */
  stats = { hits: 0, abilities: 0 };

  /** Trails from the wardrobe (fart cloud, fire, rainbow, money …) behind running runners. */
  private updateTrails(dt: number) {
    const { race } = this.session;
    race.runners.forEach((r, i) => {
      const trail = TRAILS[this.session.racers[i].cosmetics?.outfit ?? ''];
      if (!trail || r.mode !== 'run' || Math.abs(r.vx) < 120 || !this.nearCamera(r.x)) return;
      this.trailTimers[i] = (this.trailTimers[i] ?? 0) - dt;
      if (this.trailTimers[i] > 0) return;
      this.trailTimers[i] = trail.rate;
      const p = this.renderPos(i);
      const color = trail.colors[Math.floor(Math.random() * trail.colors.length)];
      const x = p.x - 14 + (Math.random() - 0.5) * 6;
      const y = p.y - 14 - Math.random() * 16;
      const dot =
        trail === TRAILS.money
          ? this.add.rectangle(x, y, trail.size * 1.6, trail.size, color).setStrokeStyle(1, 0x1d1a2f)
          : this.add.circle(x, y, trail.size * (0.7 + Math.random() * 0.5), color, 0.85);
      dot.setDepth(31);
      this.tweens.add({
        targets: dot,
        x: x - 20 - Math.random() * 20,
        y: y + (trail === TRAILS.money ? 30 : -14 - Math.random() * 14),
        alpha: 0,
        scale: trail === TRAILS.fart ? 1.8 : 0.4,
        angle: trail === TRAILS.money ? 180 : 0,
        duration: 600 + Math.random() * 300,
        onComplete: () => dot.destroy(),
      });
    });
  }

  /** Talk that doesn't come from a single event: start, overtaking, new leader, sliding. */
  private updateTalk() {
    const { race } = this.session;
    const me = race.runners[this.session.localId];
    if (!this.session.spectator) {
      if (me.sliding && !this.wasSliding && me.grounded && me.mode === 'run') sfx.play('slide');
      this.wasSliding = me.sliding;
    }
    if (race.time < 0 || race.over) return;
    if (!this.startTalked && race.time > 1.2) {
      this.startTalked = true;
      const ids = race.runners.map((r) => r.id).sort(() => Math.random() - 0.5);
      for (const id of ids) if (this.say(id, 'start')) break;
    }
    // overtaking (only after the start scramble)
    const place = me.place > 0 ? me.place : race.placeOf(me.id);
    if (this.lastPlace && race.time > 4 && me.mode === 'run') {
      if (place < this.lastPlace) {
        if (!this.say(me.id, 'pass')) {
          const passedBy = race.standings()[place]; // the one just behind now
          if (passedBy && !this.isLocal(passedBy.id)) this.say(passedBy.id, 'passed');
        }
      } else if (place > this.lastPlace) {
        const ahead = race.standings()[place - 2];
        if (!(ahead && this.say(ahead.id, 'pass'))) this.say(me.id, 'passed');
      }
    }
    this.lastPlace = place;
    // the announcer calls a new leader now and then
    const lead = race.standings()[0];
    if (lead && lead.id !== this.leader) {
      const now = this.time.now;
      if (this.leader >= 0 && race.time > 6 && now - this.lastLeadCall > 9000) {
        this.lastLeadCall = now;
        this.shout(announce('lead'), 2);
      }
      this.leader = lead.id;
    }
  }

  private updateBubbles() {
    const now = this.time.now;
    const view = this.cameras.main.worldView;
    this.bubbles = this.bubbles.filter((b) => {
      if (now > b.until) {
        b.bubble.destroy();
        return false;
      }
      const p = this.renderPos(b.id);
      // stay inside the picture, even when the runner is at the top edge
      b.bubble.setPosition(p.x + 10, Math.max(view.y + b.h + 8, p.y - 104));
      b.bubble.setAlpha(Math.min(1, (b.until - now) / 300));
      return true;
    });
  }

  private isLocal(id: number) {
    return id === this.session.localId;
  }

  private nearCamera(x: number) {
    const v = this.cameras.main.worldView;
    return x > v.x - 200 && x < v.right + 200;
  }

  private handleEvent(e: SimEvent) {
    const { race } = this.session;
    const vib = loadSave().settings.vibration;
    switch (e.t) {
      case 'jump':
        this.views[e.r].onJump(e.double);
        if (this.isLocal(e.r)) sfx.play(e.wall ? 'walljump' : e.double ? 'doublejump' : 'jump');
        if (e.wall) this.fx.footDust(race.runners[e.r].x + 12, race.runners[e.r].y - 10, 3);
        break;
      case 'land':
        this.views[e.r].onLand(e.v);
        this.fx.footDust(race.runners[e.r].x, race.runners[e.r].y, 5);
        if (this.isLocal(e.r)) {
          sfx.play('land');
          if (e.v > 900) this.camera.shake(0.35);
        }
        break;
      case 'pad':
        if (e.kind !== 'boost') this.trackView.bouncePadNear(race.runners[e.r].x);
        if (this.isLocal(e.r) || this.nearCamera(race.runners[e.r].x)) sfx.play(e.kind === 'boost' ? 'turbo' : 'pad');
        break;
      case 'slam':
        this.fx.slam(e.x, e.y);
        this.views[e.r].onLand(1100);
        if (this.isLocal(e.r)) {
          sfx.play('slam');
          this.camera.shake(0.45);
        }
        break;
      case 'crumble': {
        const col = e.tile % race.track.cols;
        const row = Math.floor(e.tile / race.track.cols);
        this.trackView.refreshTile(col, row);
        if (e.broken && this.nearCamera(col * 40)) {
          this.fx.debris(col * 40 + 20, row * 40 + 10);
          sfx.play('crumble', 0.6);
        }
        break;
      }
      case 'death': {
        // comic words only where it matters to you: your own deaths, your hits, right next to you
        this.fx.death(e.kind, e.x, e.y, this.isLocal(e.r) || (e.by !== undefined && this.isLocal(e.by)) || this.nearMe(e.x, e.y));
        if (this.nearCamera(e.x)) {
          const snd = { squash: 'squash', boom: 'boom', zap: 'zap', trap: 'trap', slice: 'slice', fall: 'fall', spike: 'death' } as const;
          sfx.play(snd[e.kind] ?? 'death');
        }
        if (e.by === this.session.localId && e.by !== e.r) {
          this.stats.hits++;
          this.punch(80);
        }
        // whoever threw the item gloats
        if (e.by !== undefined && e.by !== e.r && race.isRival(e.by, e.r) && Math.random() < (this.isLocal(e.by) ? 0.8 : 0.5)) {
          this.say(e.by, 'hit', this.isLocal(e.by));
        }
        if (this.isLocal(e.r)) {
          this.camera.shake(1);
          this.punch(110);
          if (e.kind === 'zap' || e.kind === 'boom') this.cameras.main.flash(90, 255, 255, 255);
          if (vib) navigator.vibrate?.(120);
          const line = deathLine(e.kind);
          if (line) this.hud?.toast(line, '#ff9a8a');
          if (Math.random() < 0.6) this.say(e.r, 'death', true);
        } else if (Math.random() < 0.5) this.say(e.r, 'death');
        break;
      }
      case 'respawn': {
        const r = race.runners[e.r];
        this.fx.respawnPuff(r.x, r.y);
        if (this.isLocal(e.r)) sfx.play('respawn');
        break;
      }
      case 'swallowed': {
        const r = race.runners[e.r];
        this.fx.respawnPuff(r.x, r.y);
        if (this.isLocal(e.r)) {
          sfx.play('swallow');
          this.camera.shake(0.5);
          this.hud?.toast(swallowedLine(), '#c77dff');
          this.say(e.r, 'swallowed', true);
        } else if (Math.random() < 0.4) this.say(e.r, 'swallowed');
        break;
      }
      case 'coin': {
        if (this.isLocal(e.r)) {
          const c = race.track.coins[e.coin];
          this.fx.coin(c.x, c.y);
          sfx.play('coin');
        }
        break;
      }
      case 'box': {
        const b = race.track.boxes[e.box];
        this.fx.box(b.x, b.y);
        if (this.isLocal(e.r)) sfx.play('box');
        break;
      }
      case 'item':
        if (this.isLocal(e.r)) sfx.play('item');
        break;
      case 'use': {
        const r = race.runners[e.r];
        if (e.item === 'shield' && this.nearCamera(r.x)) sfx.play('shield');
        else if (e.item === 'magnet' && this.isLocal(e.r)) sfx.play('magnet');
        else if (e.item === 'rocket' && this.nearCamera(r.x)) sfx.play('rocket');
        else if (e.item === 'turbo' && this.isLocal(e.r)) {
          sfx.play('turbo');
          this.camera.kick(-40);
        }
        else if (e.item === 'ink') {
          sfx.play('ink');
          if (race.runners[this.session.localId].ink > 0) this.hud?.inkSplat();
        } else if (this.nearCamera(r.x)) sfx.play('throw');
        break;
      }
      case 'lightning': {
        sfx.play('lightning');
        this.shout(announce('lightning'), 4);
        this.cameras.main.flash(180, 255, 250, 200);
        this.camera.shake(0.7);
        for (const r of race.runners) {
          if (r.id !== e.r && this.nearCamera(r.x)) this.fx.lightning(r.x, this.cameras.main.worldView.y, r.y - 20);
        }
        break;
      }
      case 'shieldBlock': {
        const r = race.runners[e.r];
        this.fx.shatter(r.x, r.y - 24);
        if (this.nearCamera(r.x)) sfx.play('shieldblock');
        if (this.isLocal(e.r)) this.fx.word('PLONK!', r.x, r.y - 80, '#9fdcff');
        if (this.isLocal(e.r)) this.hud?.toast(shieldLine(), '#7fd0ff');
        break;
      }
      case 'explode':
        this.fx.explosion(e.x, e.y);
        if (this.nearCamera(e.x)) {
          sfx.play('boom');
          this.camera.shake(0.6);
        }
        break;
      case 'sawBreak':
        this.fx.sawBreak(e.x, e.y);
        break;
      case 'trapSet':
        if (this.nearCamera(e.x)) sfx.play('trap');
        break;
      case 'ability': {
        this.fx.ability(e.kind, e.x, e.y);
        // healing quartz: a crystal shell around the runner while it lasts
        if (e.kind === 'mask') this.fx.attach('ice', () => this.renderPos(e.r), MASK_TIME * 1000, 78);
        if (this.isLocal(e.r)) this.stats.abilities++;
        this.say(e.r, 'ability', this.isLocal(e.r));
        if (this.nearCamera(e.x)) sfx.play(`ab-${e.kind}`);
        if (this.isLocal(e.r)) {
          this.camera.shake(e.kind === 'quake' ? 0.6 : 0.25);
          if (e.kind === 'sprint' || e.kind === 'bash') this.camera.kick(-40);
          if (e.kind === 'steal' && e.target !== undefined) this.hud?.toast(stoleLine(this.session.racers[e.target].name), '#ffd84a');
        } else if (e.target === this.session.localId) {
          this.hud?.toast(robbedLine(this.session.racers[e.r].name), '#ff9a8a');
        }
        break;
      }
      case 'stunned': {
        const r = race.runners[e.r];
        this.fx.dizzy(r.x, r.y);
        if (this.isLocal(e.r) || this.nearMe(r.x, r.y)) this.fx.word(Math.random() < 0.5 ? 'BONK!' : 'DOING!', r.x, r.y - 80, '#ffd84a');
        if (this.nearCamera(r.x)) sfx.play('stunned', 0.7);
        if (e.by !== undefined && e.by !== e.r && Math.random() < 0.4) this.say(e.by, 'hit');
        if (this.isLocal(e.r)) {
          this.hud?.toast(stunnedLine(), '#b07cff');
          if (vib) navigator.vibrate?.(60);
          if (Math.random() < 0.6) this.say(e.r, 'stunned', true);
        }
        break;
      }
      case 'finish': {
        const r = race.runners[e.r];
        if (this.isLocal(e.r)) {
          this.fx.celebrate(r.x + 60, r.y - 120);
          sfx.play(e.place === 1 ? 'finish' : e.place >= race.runners.length ? 'lose' : 'go');
          const line = finishLine(e.place);
          if (!sfx.voicesHeard) this.hud?.toast(line.text, '#ffd84a', true);
          this.shout(line);
        }
        if (e.place === 1) this.say(e.r, 'win', true);
        break;
      }
      case 'countdown': {
        sfx.play('countdown');
        this.hud?.countdown(String(e.n));
        if (e.n >= 1 && e.n <= 3) this.shout(announce(`count${e.n}`));
        break;
      }
      case 'go': {
        sfx.play('go', 0.6);
        const line = goLine();
        this.hud?.countdown(line.text);
        this.shout(line);
        break;
      }
      case 'end':
        break;
    }
  }
}
