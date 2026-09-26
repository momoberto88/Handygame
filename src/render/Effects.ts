import Phaser from 'phaser';
import type { AbilityKind, DeathKind } from '../sim/types';

type Emitter = Phaser.GameObjects.Particles.ParticleEmitter;

/** Particle bursts and one-shot effects (explosions, lightning, puffs). */
export class Effects {
  private dust: Emitter;
  private stars: Emitter;
  private sparks: Emitter;
  private smoke: Emitter;
  private confetti: Emitter;
  private coinSparkle: Emitter;
  private speedLines: Emitter;

  constructor(private scene: Phaser.Scene) {
    this.dust = scene.add
      .particles(0, 0, 'p-dust', {
        emitting: false,
        lifespan: 420,
        speed: { min: 20, max: 90 },
        angle: { min: 180, max: 360 },
        scale: { start: 0.9, end: 0.2 },
        alpha: { start: 0.7, end: 0 },
        tint: 0xe8dcc8,
        gravityY: -60,
      })
      .setDepth(30);
    this.stars = scene.add
      .particles(0, 0, 'p-star', {
        emitting: false,
        lifespan: 700,
        speed: { min: 80, max: 220 },
        angle: { min: 200, max: 340 },
        scale: { start: 0.55, end: 0.1 },
        rotate: { min: 0, max: 360 },
        gravityY: 400,
      })
      .setDepth(40);
    this.sparks = scene.add
      .particles(0, 0, 'p-spark', {
        emitting: false,
        lifespan: 380,
        speed: { min: 150, max: 420 },
        scale: { start: 0.9, end: 0 },
        blendMode: 'ADD',
      })
      .setDepth(41);
    this.smoke = scene.add
      .particles(0, 0, 'p-smoke', {
        emitting: false,
        lifespan: 900,
        speed: { min: 10, max: 60 },
        scale: { start: 0.5, end: 1.4 },
        alpha: { start: 0.8, end: 0 },
        gravityY: -80,
      })
      .setDepth(39);
    this.confetti = scene.add
      .particles(0, 0, 'p-confetti', {
        emitting: false,
        lifespan: 1600,
        speed: { min: 150, max: 420 },
        angle: { min: 220, max: 320 },
        rotate: { min: 0, max: 360 },
        gravityY: 500,
        scale: { min: 0.35, max: 0.6 },
        tint: [0xff4f6a, 0xffd84a, 0x4ad0ff, 0x7aff6a, 0xc47aff],
      })
      .setDepth(45);
    this.coinSparkle = scene.add
      .particles(0, 0, 'p-spark', {
        emitting: false,
        lifespan: 300,
        speed: { min: 40, max: 120 },
        scale: { start: 0.8, end: 0 },
        tint: 0xffe070,
        blendMode: 'ADD',
      })
      .setDepth(41);
    this.speedLines = scene.add
      .particles(0, 0, 'p-dust', {
        emitting: false,
        lifespan: 220,
        speedX: { min: -260, max: -140 },
        speedY: { min: -10, max: 10 },
        scaleX: { start: 2.4, end: 0.5 },
        scaleY: 0.25,
        alpha: { start: 0.8, end: 0 },
        tint: 0xfff2a8,
      })
      .setDepth(29);
  }

  footDust(x: number, y: number, n = 4) {
    this.dust.explode(n, x, y - 2);
  }

  boostTrail(x: number, y: number) {
    this.speedLines.explode(1, x - 10, y - 10 - Math.random() * 30);
  }

  coin(x: number, y: number) {
    this.coinSparkle.explode(6, x, y);
  }

  box(x: number, y: number) {
    this.sparks.explode(10, x, y);
    this.stars.explode(3, x, y);
  }

  sawBreak(x: number, y: number) {
    this.sparks.explode(14, x, y);
  }

  explosion(x: number, y: number) {
    this.smoke.explode(8, x, y);
    this.sparks.explode(18, x, y);
    const flash = this.scene.add.circle(x, y, 26, 0xfff0a0, 0.9).setDepth(42).setBlendMode('ADD');
    this.scene.tweens.add({ targets: flash, scale: 2.2, alpha: 0, duration: 260, onComplete: () => flash.destroy() });
  }

  death(kind: DeathKind, x: number, y: number) {
    const cy = y - 22;
    switch (kind) {
      case 'slice':
        this.sparks.explode(16, x, cy);
        this.stars.explode(4, x, cy);
        break;
      case 'boom':
        this.explosion(x, cy);
        break;
      case 'squash':
        this.dust.explode(10, x, y);
        this.stars.explode(5, x, y - 10);
        break;
      case 'zap':
        this.smoke.explode(6, x, cy);
        this.sparks.explode(10, x, cy);
        break;
      case 'trap': {
        this.stars.explode(4, x, cy);
        const trap = this.scene.add.image(x, y, 'trap-closed').setOrigin(0.5, 0.9).setScale(0.5).setDepth(34);
        this.scene.tweens.add({ targets: trap, alpha: 0, delay: 800, duration: 250, onComplete: () => trap.destroy() });
        break;
      }
      case 'spike':
        this.stars.explode(5, x, cy);
        break;
      case 'fall':
        break;
    }
  }

  slam(x: number, y: number) {
    this.dust.explode(14, x, y);
    this.stars.explode(3, x, y - 6);
    const ring = this.scene.add.ellipse(x, y, 20, 8).setStrokeStyle(3, 0xffffff, 0.8).setDepth(31);
    this.scene.tweens.add({ targets: ring, scaleX: 5, scaleY: 3, alpha: 0, duration: 320, onComplete: () => ring.destroy() });
  }

  debris(x: number, y: number) {
    this.smoke.explode(3, x, y);
    for (let i = 0; i < 4; i++) {
      const chunk = this.scene.add.rectangle(x + (Math.random() - 0.5) * 30, y, 8 + Math.random() * 8, 6 + Math.random() * 6, 0x8a6a44).setStrokeStyle(2, 0x2b1d10).setDepth(31);
      this.scene.tweens.add({
        targets: chunk,
        y: y + 200 + Math.random() * 100,
        x: chunk.x + (Math.random() - 0.5) * 60,
        angle: (Math.random() - 0.5) * 400,
        alpha: 0,
        duration: 700,
        ease: 'Quad.In',
        onComplete: () => chunk.destroy(),
      });
    }
  }

  /** Visual burst for a character ability. */
  ability(kind: AbilityKind, x: number, y: number) {
    const s = this.scene;
    switch (kind) {
      case 'megajump':
        this.slam(x, y);
        break;
      case 'sprint':
      case 'bash':
        for (let i = 0; i < 6; i++) this.speedLines.explode(1, x - 20 - i * 12, y - 10 - Math.random() * 40);
        this.sparks.explode(8, x, y - 24);
        break;
      case 'spores':
        for (let i = 0; i < 9; i++) {
          const puff = s.add.circle(x - 20, y - 30, 14 + Math.random() * 10, i % 2 ? 0xb07cff : 0x8fe36a, 0.55).setDepth(33);
          s.tweens.add({
            targets: puff,
            x: x - 60 - Math.random() * 260,
            y: y - 20 - Math.random() * 90,
            scale: 2.4,
            alpha: 0,
            duration: 900 + Math.random() * 300,
            onComplete: () => puff.destroy(),
          });
        }
        break;
      case 'quake': {
        this.dust.explode(18, x, y);
        for (const dir of [-1, 1]) {
          const wave = s.add.ellipse(x, y - 4, 30, 12).setStrokeStyle(4, 0xffe0a0, 0.9).setDepth(31);
          s.tweens.add({ targets: wave, x: x + dir * 300, scaleX: 3, alpha: 0, duration: 450, onComplete: () => wave.destroy() });
        }
        break;
      }
      case 'tongue':
      case 'steal':
        this.stars.explode(5, x + 20, y - 30);
        this.sparks.explode(6, x + 20, y - 30);
        break;
      case 'mask':
        this.smoke.explode(6, x, y - 24);
        break;
    }
  }

  /** Little stars circling over a dazed runner. */
  dizzy(x: number, y: number) {
    this.stars.explode(4, x, y - 56);
  }

  respawnPuff(x: number, y: number) {
    this.smoke.explode(5, x, y - 20);
    this.stars.explode(3, x, y - 30);
  }

  celebrate(x: number, y: number) {
    this.confetti.explode(60, x, y);
  }

  lightning(x: number, top: number, bottom: number) {
    const g = this.scene.add.graphics().setDepth(43).setBlendMode('ADD');
    const draw = () => {
      g.clear();
      g.lineStyle(7, 0xfff27a, 0.5);
      const pts: [number, number][] = [];
      let px = x;
      for (let y = top; y <= bottom; y += 28) {
        pts.push([px, y]);
        px = x + (Math.random() - 0.5) * 36;
      }
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (const [a, b] of pts) g.lineTo(a, b);
      g.strokePath();
      g.lineStyle(3, 0xffffff, 1);
      g.strokePath();
    };
    draw();
    this.scene.time.addEvent({ delay: 60, repeat: 3, callback: draw });
    this.scene.tweens.add({ targets: g, alpha: 0, delay: 200, duration: 200, onComplete: () => g.destroy() });
    this.sparks.explode(12, x, bottom);
  }
}
