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

  constructor() {
    super('race');
  }

  init(data: RaceSceneData) {
    this.session = data.session;
    this.views = [];
    this.projectileViews.clear();
    this.trapViews.clear();
    this.endTimer = -1;
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
      const view = new RunnerView(this, characterById(info.character), isLocal, isLocal ? undefined : info.name);
      view.setDepth(isLocal ? 36 : 32 + info.id * 0.1);
      this.views.push(view);
    }

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

  update(_time: number, delta: number) {
    const dt = delta / 1000;
    const events = this.session.update(delta, this.readInput());
    this.lastEvents = events;
    const { race } = this.session;
    for (const e of events) this.handleEvent(e);

    race.runners.forEach((r, i) => {
      const { x, y } = this.renderPos(i);
      this.views[i].update(r, x, y, dt, race.clock);
      if (r.boost > 0 && r.mode === 'run') this.fx.boostTrail(x, y);
    });

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
        if (this.isLocal(e.r)) sfx.play(e.wall ? 'walljump' : 'jump');
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
          sfx.play('squash');
          this.camera.shake(0.45);
        }
        break;
      case 'crumble': {
        const col = e.tile % race.track.cols;
        const row = Math.floor(e.tile / race.track.cols);
        this.trackView.refreshTile(col, row);
        if (e.broken && this.nearCamera(col * 40)) {
          this.fx.debris(col * 40 + 20, row * 40 + 10);
          sfx.play('land');
        }
        break;
      }
      case 'death': {
        this.fx.death(e.kind, e.x, e.y);
        if (this.nearCamera(e.x)) {
          sfx.play(e.kind === 'squash' ? 'squash' : e.kind === 'boom' ? 'boom' : e.kind === 'zap' ? 'zap' : e.kind === 'trap' ? 'trap' : 'death');
        }
        if (this.isLocal(e.r)) {
          this.camera.shake(1);
          if (vib) navigator.vibrate?.(120);
        }
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
          this.hud?.toast('Vom Chaos verschluckt!', '#c77dff');
        }
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
        sfx.play('zap');
        this.cameras.main.flash(180, 255, 250, 200);
        this.camera.shake(0.7);
        for (const r of race.runners) {
          if (r.id !== e.r && this.nearCamera(r.x)) this.fx.lightning(r.x, this.cameras.main.worldView.y, r.y - 20);
        }
        break;
      }
      case 'shieldBlock': {
        const r = race.runners[e.r];
        this.fx.box(r.x, r.y - 24);
        if (this.nearCamera(r.x)) sfx.play('shield');
        if (this.isLocal(e.r)) this.hud?.toast('Schild hält!', '#7fd0ff');
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
      case 'finish': {
        const r = race.runners[e.r];
        if (this.isLocal(e.r)) {
          this.fx.celebrate(r.x + 60, r.y - 120);
          sfx.play(e.place === 1 ? 'finish' : 'go');
          this.hud?.toast(e.place === 1 ? 'SIEG!' : `${e.place}. Platz!`, '#ffd84a', true);
        }
        break;
      }
      case 'countdown':
        sfx.play('countdown');
        this.hud?.countdown(String(e.n));
        break;
      case 'go':
        sfx.play('go');
        this.hud?.countdown('LOS!');
        break;
      case 'end':
        break;
    }
  }
}
