import Phaser from 'phaser';
import { DEATH_TIME } from '../sim/constants';
import type { RunnerState } from '../sim/types';
import type { CharacterDef } from '../meta/characters';
import { ART_RES } from './art/canvas';
import { headLayout, partKey, type Expression } from './art/characterArt';

interface Pose {
  bodyX: number;
  bodyY: number;
  bodyA: number;
  headX: number;
  headY: number;
  headA: number;
  hfX: number;
  hfY: number;
  hbX: number;
  hbY: number;
  ffX: number;
  ffY: number;
  fbX: number;
  fbY: number;
  ffA: number;
  fbA: number;
}

const REST: Pose = {
  bodyX: 0,
  bodyY: -21,
  bodyA: 0,
  headX: 2,
  headY: -41,
  headA: 0,
  hfX: 10,
  hfY: -20,
  hbX: -9,
  hbY: -22,
  ffX: 5,
  ffY: -5,
  fbX: -5,
  fbY: -5,
  ffA: 0,
  fbA: 0,
};

const POSE_KEYS = Object.keys(REST) as (keyof Pose)[];

interface Debris {
  obj: Phaser.GameObjects.Image | Phaser.GameObjects.Container;
  vx: number;
  vy: number;
  va: number;
  x0: number;
  y0: number;
  a0: number;
}

class Spring {
  value = 0;
  vel = 0;
  constructor(
    private k: number,
    private damp: number,
  ) {}
  step(target: number, dt: number) {
    const acc = this.k * (target - this.value) - this.damp * this.vel;
    this.vel += acc * dt;
    this.value += this.vel * dt;
    return this.value;
  }
}

function part(scene: Phaser.Scene, key: string, ox = 0.5, oy = 0.5): Phaser.GameObjects.Image {
  return scene.add.image(0, 0, key).setOrigin(ox, oy).setScale(1 / ART_RES);
}

/**
 * Draws one runner from separate body parts and animates them in code (Rayman style).
 * The same parts are reused for the comic death animations.
 */
export class RunnerView {
  readonly root: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Image;
  private bodyLower: Phaser.GameObjects.Image;
  private head: Phaser.GameObjects.Container;
  private headImg: Phaser.GameObjects.Image;
  private eyes: Phaser.GameObjects.Image;
  private earF?: Phaser.GameObjects.Image;
  private earB?: Phaser.GameObjects.Image;
  private tail?: Phaser.GameObjects.Image;
  private handF: Phaser.GameObjects.Image;
  private handB: Phaser.GameObjects.Image;
  private footF: Phaser.GameObjects.Image;
  private footB: Phaser.GameObjects.Image;
  private shield: Phaser.GameObjects.Image;
  private magnet: Phaser.GameObjects.Image;
  private nameTag?: Phaser.GameObjects.Text;

  private pose: Pose = { ...REST };
  private phase = 0;
  private squash = 0;
  private earSpring = new Spring(160, 9);
  private tailSpring = new Spring(120, 7);
  private blinkTimer = 2;
  private lastVy = 0;
  private wasDead = false;
  private debris: Debris[] = [];
  private popIn = 1;
  private readonly earBase: { fx: number; fy: number; bx: number; by: number; rot: number };
  private readonly allParts: Phaser.GameObjects.Image[];

  constructor(
    scene: Phaser.Scene,
    readonly character: CharacterDef,
    readonly isLocal: boolean,
    label?: string,
  ) {
    const c = character;
    const hl = headLayout(c);
    this.root = scene.add.container(0, 0);

    const earKey = partKey(c, 'ear');
    const hasEar = scene.textures.exists(earKey);
    const tailKey = partKey(c, 'tail');

    if (scene.textures.exists(tailKey)) {
      this.tail = part(scene, tailKey, c.tail === 'puff' ? 0.5 : 0.95, 0.5);
      this.root.add(this.tail);
    }
    this.footB = part(scene, partKey(c, 'foot'), 0.45, 0.8).setTint(0xc8c0c0);
    this.handB = part(scene, partKey(c, 'hand')).setTint(0xc8c0c0);
    this.body = part(scene, partKey(c, 'body'));
    this.bodyLower = part(scene, partKey(c, 'body')).setVisible(false);
    this.footF = part(scene, partKey(c, 'foot'), 0.45, 0.8);
    this.head = scene.add.container(0, 0);
    this.headImg = part(scene, partKey(c, 'head'));
    this.eyes = part(scene, 'eyes-normal').setPosition(hl.eyeX, hl.eyeY).setScale(0.85 / ART_RES);

    let earPos = { fx: 0, fy: -12, bx: -5, by: -12, rot: 0 };
    if (hasEar) {
      switch (c.ears) {
        case 'long':
          earPos = { fx: 0, fy: -10, bx: -6, by: -10, rot: -0.15 };
          break;
        case 'pointy':
          earPos = { fx: 3, fy: -9, bx: -7, by: -8, rot: -0.1 };
          break;
        case 'round':
          earPos = { fx: 6, fy: -10, bx: -9, by: -8, rot: 0 };
          break;
        case 'feathers':
          earPos = { fx: -2, fy: -14, bx: -2, by: -14, rot: -0.2 };
          break;
        case 'ponytail':
          earPos = { fx: -12, fy: -6, bx: -12, by: -6, rot: 0.4 };
          break;
      }
      const oy = c.ears === 'ponytail' ? 0.08 : 0.95;
      if (c.ears !== 'feathers' && c.ears !== 'ponytail') {
        this.earB = part(scene, earKey, 0.5, oy).setTint(0xc8c0c0).setPosition(earPos.bx, earPos.by);
      }
      this.earF = part(scene, earKey, 0.5, oy).setPosition(earPos.fx, earPos.fy);
    }
    this.earBase = earPos;
    if (this.earB) this.head.add(this.earB);
    if (c.ears === 'ponytail' && this.earF) this.head.add(this.earF);
    this.head.add(this.headImg);
    this.head.add(this.eyes);
    if (this.earF && c.ears !== 'ponytail') this.head.add(this.earF);

    this.handF = part(scene, partKey(c, 'hand'));
    this.shield = scene.add.image(0, -24, 'shield-bubble').setScale(1 / ART_RES).setVisible(false);
    this.magnet = scene.add.image(0, -68, 'item-magnet').setScale(0.5 / ART_RES).setVisible(false);

    this.root.add([this.footB, this.handB, this.body, this.bodyLower, this.footF, this.head, this.handF, this.shield, this.magnet]);
    this.allParts = [this.body, this.bodyLower, this.headImg, this.handF, this.handB, this.footF, this.footB];
    if (this.earF) this.allParts.push(this.earF);
    if (this.earB) this.allParts.push(this.earB);
    if (this.tail) this.allParts.push(this.tail);

    if (label) {
      this.nameTag = scene.add
        .text(0, -70 - (character.id.length % 3) * 9, label, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '26px',
          fontStyle: 'bold',
          color: '#ffffff',
          stroke: '#1d1a2f',
          strokeThickness: 6,
        })
        .setOrigin(0.5, 1)
        .setScale(0.5)
        .setAlpha(0.85);
      this.root.add(this.nameTag);
    }
    this.applyPose();
  }

  setDepth(d: number) {
    this.root.setDepth(d);
  }

  destroy() {
    this.root.destroy();
  }

  /** Squash when landing hard. */
  onLand(speed: number) {
    this.squash = Math.min(1, speed / 1100);
    this.earSpring.vel += speed * 0.25;
  }

  onJump() {
    this.squash = -0.6;
    this.earSpring.vel -= 250;
  }

  update(r: RunnerState, x: number, y: number, dt: number, time: number) {
    this.root.setPosition(x, y);

    if (r.mode === 'dead') {
      if (!this.wasDead) this.startDeath(r);
      this.wasDead = true;
      this.updateDeath(r);
      return;
    }
    if (this.wasDead) this.endDeath();
    this.wasDead = false;

    this.popIn = Math.min(1, this.popIn + dt * 5);
    const pop = this.popIn < 1 ? Phaser.Math.Easing.Back.Out(this.popIn) : 1;

    const target = this.computePose(r, dt, time);
    const k = 1 - Math.exp(-dt * 28);
    for (const key of POSE_KEYS) this.pose[key] += (target[key] - this.pose[key]) * k;
    this.applyPose();

    // squash & stretch
    this.squash *= Math.exp(-dt * 9);
    const sy = 1 - this.squash * 0.28;
    const sx = 1 + this.squash * 0.22;
    this.root.setScale(sx * pop, sy * pop);

    // ears & tail springs
    const accel = (r.vy - this.lastVy) / Math.max(dt, 1e-3);
    this.lastVy = r.vy;
    const earTarget = Phaser.Math.Clamp(-r.vy * 0.0009 - r.vx * 0.0008, -0.9, 0.9) + (r.grounded ? Math.sin(this.phase * 2) * 0.08 : 0);
    const ear = this.earSpring.step(earTarget + Phaser.Math.Clamp(accel * 0.00002, -0.3, 0.3), dt);
    if (this.earF) this.earF.setRotation(this.earBase.rot + ear);
    if (this.earB) this.earB.setRotation(this.earBase.rot - 0.25 + ear * 0.8);
    if (this.tail) {
      const tailT = this.tailSpring.step(Phaser.Math.Clamp(r.vy * 0.0008, -0.6, 0.6) + Math.sin(this.phase) * 0.15, dt);
      this.tail.setPosition(this.pose.bodyX - 11, this.pose.bodyY + 4).setRotation(tailT);
    }

    // face
    this.blinkTimer -= dt;
    if (this.blinkTimer < -0.12) this.blinkTimer = 1.5 + ((time * 7.3 + r.id) % 2.5);
    this.eyes.setTexture(`eyes-${this.expression(r)}`);

    const ghost = r.ghost > 0 ? (Math.floor(time * 16) % 2 ? 0.35 : 0.9) : 1;
    this.root.setAlpha(ghost);
    this.magnet.setVisible(r.magnet > 0).setY(-66 + Math.sin(time * 5) * 3).setRotation(Math.sin(time * 3) * 0.3);
    this.shield.setVisible(r.shield > 0);
    if (r.shield > 0) {
      const flicker = r.shield < 1.5 && Math.floor(time * 10) % 2 === 0;
      this.shield.setAlpha(flicker ? 0.25 : 0.9).setScale((1 + Math.sin(time * 6) * 0.04) / ART_RES);
    }
  }

  private expression(r: RunnerState): Expression {
    if (r.mode === 'finished') return 'happy';
    if (r.vy > 650 && !r.grounded) return 'scared';
    if (r.blocked || r.onWall) return 'strain';
    if (r.boost > 0) return 'happy';
    if (r.sliding && r.slope > 0) return 'happy';
    if (this.blinkTimer < 0) return 'blink';
    return 'normal';
  }

  private computePose(r: RunnerState, dt: number, time: number): Pose {
    const p: Pose = { ...REST };
    const speed = r.vx;
    if (r.mode === 'finished') {
      const hop = Math.abs(Math.sin(time * 7));
      p.bodyY -= hop * 6;
      p.headY -= hop * 7;
      p.hfX = 11;
      p.hfY = -46 - hop * 6;
      p.hbX = -9;
      p.hbY = -47 - hop * 6;
      p.ffY -= hop * 6;
      p.fbY -= hop * 6;
      return p;
    }
    if (r.sliding) {
      this.phase += dt * 6;
      p.bodyX = -2;
      p.bodyY = -12;
      p.bodyA = -1.25;
      p.headX = -16;
      p.headY = -17;
      p.headA = -0.35;
      p.ffX = 17;
      p.ffY = -4;
      p.fbX = 22;
      p.fbY = -3;
      p.ffA = -0.3;
      p.fbA = -0.2;
      p.hfX = -20;
      p.hfY = -6;
      p.hbX = -24;
      p.hbY = -10;
      const jitter = Math.sin(time * 40) * (speed > 400 ? 1.2 : 0.4);
      p.headY += jitter;
      return p;
    }
    if (r.diving) {
      p.bodyA = 0.7;
      p.headX = 10;
      p.headY = -34;
      p.headA = 0.4;
      p.hfX = 20;
      p.hfY = -26;
      p.hbX = 16;
      p.hbY = -30;
      p.ffX = -12;
      p.ffY = -24;
      p.fbX = -15;
      p.fbY = -18;
      return p;
    }
    if (r.onWall) {
      const climb = Math.sin(time * 18);
      p.bodyA = -0.15;
      p.hfX = 13;
      p.hfY = -30 + climb * 3;
      p.hbX = 12;
      p.hbY = -20 - climb * 3;
      p.ffX = 10;
      p.ffY = -8 - climb * 2;
      p.fbX = 9;
      p.fbY = -3 + climb * 2;
      p.ffA = -1.2;
      p.fbA = -1.2;
      p.headX = 0;
      return p;
    }
    if (!r.grounded) {
      if (r.vy < 0) {
        p.bodyA = 0.1;
        p.ffX = 7;
        p.ffY = -13;
        p.fbX = -7;
        p.fbY = -8;
        p.ffA = 0.3;
        p.hfX = 13;
        p.hfY = -38;
        p.hbX = -11;
        p.hbY = -34;
        p.headY = -43;
      } else {
        const flail = Math.sin(time * 26);
        p.bodyA = -0.05;
        p.ffX = 6;
        p.ffY = -2;
        p.fbX = -6;
        p.fbY = -3;
        p.hfX = 14 + flail * 2;
        p.hfY = -34 + flail * 4;
        p.hbX = -12 - flail * 2;
        p.hbY = -32 - flail * 4;
        p.headY = -42;
      }
      return p;
    }
    // Running (also pushing against walls).
    const stride = r.blocked ? 45 : 68;
    const cycleSpeed = r.blocked ? 300 : Math.max(speed, 40);
    this.phase += (cycleSpeed * dt * Math.PI * 2) / stride / 2;
    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);
    const bob = Math.abs(s);
    const lean = r.blocked ? 0.28 : Phaser.Math.Clamp(speed / 340, 0, 1.6) * 0.13 + (r.slope < 0 ? 0.12 : r.slope > 0 ? -0.1 : 0);
    p.bodyA = lean;
    p.bodyY = -21 - bob * 2.5;
    p.bodyX = lean * 6;
    p.headY = -41 - bob * 3;
    p.headX = 2 + lean * 12;
    p.headA = Math.sin(this.phase * 2) * 0.05 + lean * 0.4;
    p.ffX = 2 + s * 10;
    p.ffY = -4 - Math.max(0, c) * 9;
    p.fbX = 2 - s * 10;
    p.fbY = -4 - Math.max(0, -c) * 9;
    p.ffA = s * 0.35;
    p.fbA = -s * 0.35;
    if (r.blocked) {
      p.hfX = 16;
      p.hfY = -30;
      p.hbX = 15;
      p.hbY = -22;
    } else {
      p.hfX = 6 + lean * 8 - s * 9;
      p.hfY = -19 - Math.abs(c) * 3;
      p.hbX = -4 + lean * 8 + s * 9;
      p.hbY = -21 - Math.abs(c) * 3;
    }
    return p;
  }

  private applyPose() {
    const cur = this.pose;
    this.body.setPosition(cur.bodyX, cur.bodyY).setRotation(cur.bodyA);
    this.head.setPosition(cur.headX, cur.headY).setRotation(cur.headA);
    this.handF.setPosition(cur.hfX, cur.hfY);
    this.handB.setPosition(cur.hbX, cur.hbY);
    this.footF.setPosition(cur.ffX, cur.ffY).setRotation(cur.ffA);
    this.footB.setPosition(cur.fbX, cur.fbY).setRotation(cur.fbA);
  }

  // ---------------------------------------------------------------------------------------
  // Comic deaths

  private startDeath(r: RunnerState) {
    this.debris = [];
    this.root.setScale(1).setAlpha(1);
    this.shield.setVisible(false);
    this.magnet.setVisible(false);
    this.eyes.setTexture('eyes-dead');
    const kind = r.deathKind;
    const rnd = (i: number) => Math.sin(i * 12.9898 + r.id * 78.233 + r.deaths * 3.1) * 0.5 + 0.5;
    const fling = (obj: Debris['obj'], i: number, power: number) => {
      this.debris.push({
        obj,
        x0: obj.x,
        y0: obj.y,
        a0: obj.rotation,
        vx: (rnd(i) - 0.35) * 260 * power,
        vy: (-220 - rnd(i + 7) * 260) * power,
        va: (rnd(i + 3) - 0.5) * 18 * power,
      });
    };
    if (kind === 'slice' || kind === 'boom') {
      // Body is split into two halves with a crop.
      const tex = this.body.frame;
      const half = tex.height / 2;
      this.body.setCrop(0, 0, tex.width, half);
      this.bodyLower.setVisible(true).setCrop(0, half, tex.width, half);
      this.bodyLower.setPosition(this.body.x, this.body.y).setRotation(this.body.rotation);
      const power = kind === 'boom' ? 1.35 : 1;
      [this.head, this.body, this.bodyLower, this.handF, this.handB, this.footF, this.footB].forEach((o, i) =>
        fling(o, i, power),
      );
      if (this.tail) fling(this.tail, 9, power);
      if (kind === 'boom') for (const p of this.allParts) p.setTint(0x6a5a50);
    }
    if (kind === 'zap') {
      for (const p of this.allParts) p.setTint(0x2a2622);
    }
  }

  private updateDeath(r: RunnerState) {
    const t = DEATH_TIME - r.deathTimer;
    const kind = r.deathKind;
    if (kind === 'slice' || kind === 'boom') {
      for (const d of this.debris) {
        d.obj.x = d.x0 + d.vx * t;
        d.obj.y = d.y0 + d.vy * t + 0.5 * 1500 * t * t;
        d.obj.rotation = d.a0 + d.va * t;
      }
      this.root.setAlpha(t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1);
    } else if (kind === 'squash') {
      const k = Math.min(1, t / 0.06);
      this.root.setScale(1 + 0.8 * k, 1 - 0.82 * k);
      this.root.setAlpha(t > 0.8 ? 1 - (t - 0.8) / 0.2 : 1);
    } else if (kind === 'zap') {
      const shake = t < 0.35 ? Math.sin(t * 90) * 2.5 : 0;
      this.root.x += shake;
      this.pose.hfY = -36;
      this.pose.hbY = -35;
      this.applyPose();
      this.eyes.setTexture(t < 0.35 ? 'eyes-scared' : 'eyes-blink');
      this.root.setAlpha(t > 0.8 ? 1 - (t - 0.8) / 0.2 : 1);
    } else if (kind === 'trap') {
      this.root.x += Math.sin(t * 50) * 1.5;
      this.eyes.setTexture('eyes-strain');
      this.pose.hfY = -38 + Math.sin(t * 30) * 4;
      this.pose.hbY = -36 - Math.sin(t * 30) * 4;
      this.applyPose();
      this.root.setAlpha(t > 0.8 ? 1 - (t - 0.8) / 0.2 : 1);
    } else if (kind === 'spike') {
      const hop = t < 0.5 ? Math.sin((t / 0.5) * Math.PI) * 26 : 0;
      this.root.y -= hop;
      this.root.setRotation(t < 0.5 ? t * 1.5 : 0.75);
      this.root.setAlpha(t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1);
    } else {
      this.root.setAlpha(0);
    }
  }

  private endDeath() {
    for (const d of this.debris) {
      d.obj.setPosition(d.x0, d.y0).setRotation(d.a0);
    }
    this.debris = [];
    this.body.setCrop();
    this.bodyLower.setVisible(false);
    for (const p of this.allParts) p.clearTint();
    this.footB.setTint(0xc8c0c0);
    this.handB.setTint(0xc8c0c0);
    if (this.earB) this.earB.setTint(0xc8c0c0);
    this.root.setRotation(0).setAlpha(1).setScale(1);
    this.popIn = 0;
  }
}
