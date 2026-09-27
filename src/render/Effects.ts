import Phaser from 'phaser';
import { textStyle } from '../scenes/HudScene';
import type { AbilityKind, DeathKind } from '../sim/types';

type Emitter = Phaser.GameObjects.Particles.ParticleEmitter;

/** Painted effect sprites (public/assets/fx/<name>.png, loaded as "fx-<name>"). */
export const FX_SPRITES = ['skelRun', 'skelShock', 'flash', 'kaboom', 'splat', 'drops', 'bolt', 'ice', 'shards', 'slash', 'smoke', 'dust'] as const;
type FxSprite = (typeof FX_SPRITES)[number];

/** Comic word that pops up for each way to die. */
const DEATH_WORDS: Partial<Record<DeathKind, { text: string[]; color: string }>> = {
  slice: { text: ['RATSCH!', 'SCHNIPP!', 'ZACK!'], color: '#ff5a4a' },
  boom: { text: ['KABUMM!', 'BÄM!', 'WUMMS!'], color: '#ffb21a' },
  zap: { text: ['BZZZT!', 'ZISCH!', 'KNISTER!'], color: '#9ff3ff' },
  squash: { text: ['PLATT!', 'MATSCH!', 'KNIRSCH!'], color: '#ffd84a' },
  trap: { text: ['SCHNAPP!', 'KLACK!'], color: '#ffd84a' },
  spike: { text: ['AUTSCH!', 'PIEKS!'], color: '#ff9a8a' },
};

/** Particle bursts and one-shot effects (explosions, lightning, puffs). */
export class Effects {
  private dust: Emitter;
  private stars: Emitter;
  private sparks: Emitter;
  private smoke: Emitter;
  private confetti: Emitter;
  private coinSparkle: Emitter;
  private speedLines: Emitter;
  /** Sprites that stay on a runner for a while (crystal shell …). */
  private attached: { obj: Phaser.GameObjects.Image; pos: () => { x: number; y: number }; until: number; dy: number }[] = [];

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

  private has(name: FxSprite) {
    return this.scene.textures.exists(`fx-${name}`);
  }

  /** A painted effect sprite that pops in, holds and fades out. */
  private pop(name: FxSprite, x: number, y: number, size: number, opts: { hold?: number; depth?: number; angle?: number; grow?: number; add?: boolean } = {}) {
    if (!this.has(name)) return null;
    const img = this.scene.add.image(x, y, `fx-${name}`).setDepth(opts.depth ?? 42).setAngle(opts.angle ?? 0);
    const base = size / Math.max(img.width, img.height);
    img.setScale(base * 0.4);
    if (opts.add) img.setBlendMode('ADD');
    this.scene.tweens.add({ targets: img, scale: base, duration: 110, ease: 'Back.Out' });
    this.scene.tweens.add({
      targets: img,
      alpha: 0,
      scale: base * (opts.grow ?? 1.15),
      delay: 110 + (opts.hold ?? 220),
      duration: 260,
      onComplete: () => img.destroy(),
    });
    return img;
  }

  /** Comic word ("BZZZT!") that pops up, wobbles and floats away. */
  word(text: string, x: number, y: number, color = '#ffd84a') {
    const t = this.scene.add.text(x, y, text, { ...textStyle(34, color), strokeThickness: 14 }).setOrigin(0.5).setDepth(47);
    t.setScale(0.1).setAngle((Math.random() - 0.5) * 24);
    this.scene.tweens.add({ targets: t, scale: 0.5, duration: 160, ease: 'Back.Out' });
    this.scene.tweens.add({ targets: t, y: y - 36, alpha: 0, delay: 520, duration: 320, onComplete: () => t.destroy() });
  }

  /** Jam drops flying out of a hit (with gravity). */
  private drops(x: number, y: number, n: number) {
    if (!this.has('drops')) return;
    for (let i = 0; i < n; i++) {
      const d = this.scene.add.image(x, y, 'fx-drops').setDepth(41).setScale(0.07 + Math.random() * 0.06).setAngle(Math.random() * 360);
      const vx = (Math.random() - 0.3) * 320;
      const vy = -180 - Math.random() * 260;
      const t0 = this.scene.time.now;
      const ev = this.scene.time.addEvent({
        delay: 16,
        loop: true,
        callback: () => {
          const t = (this.scene.time.now - t0) / 1000;
          d.setPosition(x + vx * t, y + vy * t + 700 * t * t);
          d.rotation += 0.15;
          if (t > 0.7) {
            ev.remove();
            d.destroy();
          }
        },
      });
    }
  }

  /** X-ray flash: the skeleton blinks over the runner a few times. */
  private xray(x: number, y: number) {
    if (!this.has('skelShock')) return;
    const glow = this.scene.add.circle(x, y - 26, 40, 0x9fe8ff, 0.3).setDepth(36).setBlendMode('ADD');
    const skel = this.scene.add.image(x, y - 28, 'fx-skelShock').setDepth(37);
    skel.setScale(70 / skel.height);
    let n = 0;
    this.scene.time.addEvent({
      delay: 70,
      repeat: 6,
      callback: () => {
        n++;
        skel.setVisible(n % 2 === 0);
        glow.setVisible(n % 2 === 0);
        if (n >= 7) {
          skel.destroy();
          glow.destroy();
        }
      },
    });
  }

  /** Sprite that sticks to a runner for `ms` (follows `pos`). */
  attach(name: FxSprite, pos: () => { x: number; y: number }, ms: number, size: number, dy = -26) {
    if (!this.has(name)) return;
    const p = pos();
    const img = this.scene.add.image(p.x, p.y + dy, `fx-${name}`).setDepth(37).setAlpha(0.85);
    img.setScale((size / Math.max(img.width, img.height)) * 0.5);
    this.scene.tweens.add({ targets: img, scale: size / Math.max(img.width, img.height), duration: 160, ease: 'Back.Out' });
    this.attached.push({ obj: img, pos, until: this.scene.time.now + ms, dy });
  }

  /** Moves attached sprites along with their runners (call every frame). */
  update() {
    const now = this.scene.time.now;
    this.attached = this.attached.filter((a) => {
      const p = a.pos();
      a.obj.setPosition(p.x, p.y + a.dy);
      if (now < a.until) return true;
      // the shell shatters when it runs out
      this.shatter(p.x, p.y + a.dy);
      a.obj.destroy();
      return false;
    });
  }

  /** Glass/ice shards flying apart (shield blocked, crystal shell over). */
  shatter(x: number, y: number) {
    this.pop('shards', x, y, 70, { hold: 120, grow: 1.6 });
    this.sparks.explode(8, x, y);
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
    this.pop('kaboom', x, y, 120, { hold: 180, angle: (Math.random() - 0.5) * 30 });
    this.pop('smoke', x - 20, y - 10, 90, { depth: 39, hold: 400, grow: 1.5 });
    const ring = this.scene.add.circle(x, y, 20).setStrokeStyle(6, 0xffe08a, 0.9).setDepth(41);
    this.scene.tweens.add({ targets: ring, scale: 4, alpha: 0, duration: 380, onComplete: () => ring.destroy() });
  }

  death(kind: DeathKind, x: number, y: number, withWord = true) {
    const cy = y - 22;
    const w = DEATH_WORDS[kind];
    if (w && withWord) this.word(w.text[Math.floor(Math.random() * w.text.length)], x + 10, y - 78, w.color);
    switch (kind) {
      case 'slice':
        this.sparks.explode(16, x, cy);
        this.stars.explode(4, x, cy);
        this.pop('slash', x, cy, 90, { hold: 80, angle: -20 + Math.random() * 40, add: true });
        this.pop('splat', x, cy, 80, { depth: 31, hold: 700 });
        this.drops(x, cy, 6);
        break;
      case 'boom':
        this.explosion(x, cy);
        break;
      case 'squash':
        this.dust.explode(10, x, y);
        this.stars.explode(5, x, y - 10);
        this.pop('dust', x, y - 14, 90, { depth: 39, hold: 250, grow: 1.4 });
        break;
      case 'zap':
        this.smoke.explode(6, x, cy);
        this.sparks.explode(10, x, cy);
        this.pop('flash', x, cy, 110, { hold: 120, angle: Math.random() * 40, add: true });
        this.xray(x, y);
        break;
      case 'trap': {
        this.stars.explode(4, x, cy);
        const trap = this.scene.add.image(x, y, 'trap-closed').setOrigin(0.5, 0.9).setScale(0.5).setDepth(34);
        this.scene.tweens.add({ targets: trap, alpha: 0, delay: 800, duration: 250, onComplete: () => trap.destroy() });
        break;
      }
      case 'spike':
        this.stars.explode(5, x, cy);
        this.drops(x, cy, 4);
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
      case 'fireworks':
        this.sparks.explode(14, x + 10, y - 44);
        this.smoke.explode(4, x, y - 30);
        break;
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

  lightning(x: number, top: number, bottomY: number) {
    // struck runner above the view: still strike down to it (at least one tile)
    const bottom = Math.max(bottomY, top + 40);
    // a golden column of light from the sky, then the bolt inside it
    const h = bottom - top;
    const column = this.scene.add.rectangle(x, top + h / 2, 70, h, 0xffc93a, 0.55).setDepth(42).setBlendMode('ADD');
    const core = this.scene.add.rectangle(x, top + h / 2, 22, h, 0xffffff, 0.85).setDepth(42).setBlendMode('ADD');
    column.scaleX = core.scaleX = 0.2;
    this.scene.tweens.add({ targets: [column, core], scaleX: 1, duration: 90, ease: 'Cubic.Out' });
    this.scene.tweens.add({ targets: [column, core], scaleX: 0, alpha: 0, delay: 260, duration: 220, onComplete: () => (column.destroy(), core.destroy()) });
    this.pop('bolt', x + 26, bottom - 40, 60, { hold: 160, add: true });
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
