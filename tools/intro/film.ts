import Phaser from 'phaser';
import { characterById } from '../../src/meta/characters';
import { makeCharacterArt, makeEyes, type Expression } from '../../src/render/art/characterArt';
import { canvasTexture, ellipse } from '../../src/render/art/canvas';
import { preloadObjectArt } from '../../src/render/art/entityArt';
import { preloadPainted } from '../../src/render/art/skins';
import { preloadWorldArt, worldAssetKey } from '../../src/render/art/worldArt';
import { RunnerView } from '../../src/render/RunnerView';
import { createRunner } from '../../src/sim/race';
import type { RunnerState, WorldId } from '../../src/sim/types';
import { CUES as C, FPS } from './cues.mjs';
import { SketchPipeline } from './sketch';

/**
 * "Die Krone des Königs" – the 20 s intro, made entirely in code with the game's own characters.
 * Nothing runs in real time: the capture script steps the game one frame (1/30 s) at a time, and
 * every object is placed from the film time t.
 */

const W = 1920;
const H = 1080;
const DT = 1 / FPS;
const FLOOR = 900;
const INK = '#2a2233';
const HAND = '"Patrick Hand", "Comic Sans MS", sans-serif';
const MARKER = '"Permanent Marker", "Comic Sans MS", sans-serif';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const E = Phaser.Math.Easing;
/** Height of a hop at progress k (0..1). */
const hop = (k: number, h: number) => (k <= 0 || k >= 1 ? 0 : 4 * h * k * (1 - k));

/** One of our characters, driven by a fake runner state so the real game rig animates it. */
class Actor {
  readonly holder: Phaser.GameObjects.Container;
  readonly view: RunnerView;
  readonly st: RunnerState;
  x = 0;
  y = 0;
  flip = false;
  face: Expression | null = null;
  lean = 0;
  private lastY = 0;

  constructor(
    scene: Phaser.Scene,
    id: string,
    private scale: number,
    index: number,
  ) {
    this.view = new RunnerView(scene, characterById(id), false);
    this.holder = scene.add.container(0, 0, [this.view.root]);
    this.st = createRunner(index, 0, 0);
  }

  /** Places the actor; `vx` drives the run cycle, `air` the jump pose. */
  set(x: number, y: number, vx: number, air: boolean, flip = this.flip) {
    this.x = x;
    this.y = y;
    this.flip = flip;
    this.st.vx = vx;
    this.st.grounded = !air;
    return this;
  }

  tick(time: number) {
    this.st.vy = (this.y - this.lastY) / DT;
    if (!this.st.grounded && Math.abs(this.st.vy) < 1) this.st.vy = -1;
    this.lastY = this.y;
    this.view.update(this.st, 0, 0, DT, time);
    if (this.face) (this.view as unknown as { setFace(e: Expression): void }).setFace(this.face);
    this.holder.setPosition(this.x, this.y).setScale(this.flip ? -this.scale : this.scale, this.scale).setRotation(this.lean);
  }

  /** Where the top of the head is on screen (for the crown). */
  headTop(): { x: number; y: number } {
    const head = (this.view as unknown as { head: Phaser.GameObjects.Container }).head;
    const m = head.getWorldTransformMatrix();
    return { x: m.tx, y: m.ty - 17 * this.scale };
  }
}

class FilmScene extends Phaser.Scene {
  private frame = 0;
  private sketch!: SketchPipeline;
  // scene 1–3: the throne hall
  private hall!: Phaser.GameObjects.Container;
  private gears: { img: Phaser.GameObjects.Image; dir: number; teeth: number }[] = [];
  private gearAngle = 0;
  private needle!: Phaser.GameObjects.Rectangle;
  private lamp!: Phaser.GameObjects.Arc;
  private machine!: Phaser.GameObjects.Container;
  private buttonCap!: Phaser.GameObjects.Image;
  private puffs: Phaser.GameObjects.Arc[] = [];
  private storm!: Phaser.GameObjects.Graphics;
  private stormEyes: Phaser.GameObjects.Image[] = [];
  private king!: Actor;
  private rat!: Actor;
  private cat!: Actor;
  private mole!: Actor;
  private crown!: Phaser.GameObjects.Image;
  private zzz: Phaser.GameObjects.Text[] = [];
  private words: { obj: Phaser.GameObjects.Text; from: number; to: number; x: number; y: number; rot: number; size: number }[] = [];
  private caption!: Phaser.GameObjects.Text;
  private captionBox!: Phaser.GameObjects.Graphics;
  private bubble!: Phaser.GameObjects.Container;
  // scene 4: the chase
  private chase!: Phaser.GameObjects.Container;
  private chaseBgs: Partial<Record<WorldId, Phaser.GameObjects.TileSprite>> = {};
  private chaseTops: Partial<Record<WorldId, Phaser.GameObjects.TileSprite>> = {};
  private chaseFills: Partial<Record<WorldId, Phaser.GameObjects.TileSprite>> = {};
  private runners: Actor[] = [];
  private saw!: Phaser.GameObjects.Image;
  private chaseStorm!: Phaser.GameObjects.Graphics;
  private chaseEyes: Phaser.GameObjects.Image[] = [];
  private speed!: Phaser.GameObjects.Graphics;
  // scene 5: title
  private titleLayer!: Phaser.GameObjects.Container;
  private logo!: Phaser.GameObjects.Image;
  private tagline!: Phaser.GameObjects.Text;
  private confetti: { obj: Phaser.GameObjects.Rectangle; vx: number; vy: number; spin: number }[] = [];
  private flash!: Phaser.GameObjects.Rectangle;

  constructor() {
    super('film');
  }

  preload() {
    // the game's asset paths are relative to the site root, this page lives in tools/intro/
    this.load.setBaseURL('/');
    preloadPainted(this);
    preloadWorldArt(this);
    preloadObjectArt(this);
    this.load.image('brand-title', 'assets/brand/title.png');
  }

  create() {
    makeEyes(this);
    for (const id of ['hase', 'ratte', 'katze', 'maulwurf']) makeCharacterArt(this, characterById(id));
    this.makeTextures();
    this.buildHall();
    this.buildChase();
    this.buildTitle();
    this.flash = this.add.rectangle(W / 2, H / 2, W * 2, H * 2, 0xfff6e0).setDepth(900).setAlpha(0).setScrollFactor(0);
    this.cameras.main.setPostPipeline(SketchPipeline);
    this.sketch = this.cameras.main.getPostPipeline(SketchPipeline) as SketchPipeline;
    (window as unknown as { filmReady: boolean }).filmReady = true;
  }

  // ------------------------------------------------------------------------------------------
  // textures drawn in code

  private makeTextures() {
    // the crown
    canvasTexture(this, 'crown', 120, 92, (ctx) => {
      ctx.beginPath();
      ctx.moveTo(10, 80);
      ctx.lineTo(6, 26);
      ctx.lineTo(34, 50);
      ctx.lineTo(60, 10);
      ctx.lineTo(86, 50);
      ctx.lineTo(114, 26);
      ctx.lineTo(110, 80);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, 10, 0, 84);
      g.addColorStop(0, '#fff09a');
      g.addColorStop(0.5, '#ffc93a');
      g.addColorStop(1, '#d98a12');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.fillStyle = '#d98a12';
      ctx.fillRect(12, 70, 96, 12);
      ctx.strokeRect(12, 70, 96, 12);
      for (const [x, y, c] of [[60, 58, '#e8364e'], [32, 62, '#3aa0ff'], [88, 62, '#3aa0ff']] as const) {
        ellipse(ctx, x, y, 7, 7);
        ctx.fillStyle = c;
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      for (const x of [6, 60, 114]) {
        ellipse(ctx, x, x === 60 ? 10 : 26, 6, 6);
        ctx.fillStyle = '#fff6c0';
        ctx.fill();
        ctx.stroke();
      }
    });
    // gears
    const gear = (key: string, r: number, teeth: number, color: string) =>
      canvasTexture(this, key, r * 2 + 8, r * 2 + 8, (ctx) => {
        const c = r + 4;
        ctx.beginPath();
        for (let i = 0; i < teeth * 2; i++) {
          const a0 = (i / (teeth * 2)) * Math.PI * 2;
          const a1 = ((i + 1) / (teeth * 2)) * Math.PI * 2;
          const rr = i % 2 === 0 ? r : r * 0.82;
          ctx.lineTo(c + Math.cos(a0) * rr, c + Math.sin(a0) * rr);
          ctx.lineTo(c + Math.cos(a1) * rr, c + Math.sin(a1) * rr);
        }
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = INK;
        ctx.stroke();
        ellipse(ctx, c, c, r * 0.55, r * 0.55);
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fill();
        ctx.stroke();
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(c, c);
          ctx.lineTo(c + Math.cos(a) * r * 0.55, c + Math.sin(a) * r * 0.55);
          ctx.lineWidth = 6;
          ctx.strokeStyle = color;
          ctx.stroke();
        }
        ellipse(ctx, c, c, r * 0.16, r * 0.16);
        ctx.fillStyle = '#3a2a1e';
        ctx.fill();
      });
    gear('gear-l', 110, 14, '#c98a3a');
    gear('gear-m', 70, 10, '#b3743a');
    gear('gear-s', 46, 8, '#d9a653');
    // the throne
    canvasTexture(this, 'throne', 320, 540, (ctx) => {
      ctx.lineWidth = 5;
      ctx.strokeStyle = INK;
      ctx.beginPath();
      ctx.moveTo(40, 340);
      ctx.lineTo(40, 80);
      ctx.quadraticCurveTo(160, -20, 280, 80);
      ctx.lineTo(280, 340);
      ctx.closePath();
      ctx.fillStyle = '#d9a032';
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(70, 330);
      ctx.lineTo(70, 100);
      ctx.quadraticCurveTo(160, 20, 250, 100);
      ctx.lineTo(250, 330);
      ctx.closePath();
      ctx.fillStyle = '#b3243c';
      ctx.fill();
      ctx.stroke();
      // seat and legs
      ctx.fillStyle = '#d9a032';
      ctx.fillRect(20, 330, 280, 50);
      ctx.strokeRect(20, 330, 280, 50);
      ctx.fillStyle = '#9a6a1e';
      ctx.fillRect(40, 380, 40, 160);
      ctx.strokeRect(40, 380, 40, 160);
      ctx.fillRect(240, 380, 40, 160);
      ctx.strokeRect(240, 380, 40, 160);
      ctx.fillStyle = '#b3243c';
      ctx.fillRect(20, 318, 280, 16);
      ctx.strokeRect(20, 318, 280, 16);
      // a carrot emblem
      ctx.save();
      ctx.translate(160, 150);
      ctx.rotate(0.5);
      ctx.beginPath();
      ctx.moveTo(-14, -34);
      ctx.lineTo(14, -34);
      ctx.lineTo(0, 40);
      ctx.closePath();
      ctx.fillStyle = '#ff8a2a';
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#5fbf3a';
      ellipse(ctx, 0, -44, 8, 14);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });
    // the machine body
    canvasTexture(this, 'machine', 500, 640, (ctx) => {
      ctx.lineWidth = 6;
      ctx.strokeStyle = INK;
      // chimney
      ctx.fillStyle = '#7a5a3a';
      ctx.fillRect(330, 0, 70, 150);
      ctx.strokeRect(330, 0, 70, 150);
      ctx.fillStyle = '#5a4030';
      ctx.fillRect(318, 0, 94, 26);
      ctx.strokeRect(318, 0, 94, 26);
      // body
      ctx.beginPath();
      ctx.roundRect(20, 130, 460, 500, 30);
      const g = ctx.createLinearGradient(0, 130, 0, 630);
      g.addColorStop(0, '#d9904a');
      g.addColorStop(1, '#9a5a2a');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.stroke();
      // rivets
      ctx.fillStyle = '#ffd9a0';
      for (let x = 50; x <= 450; x += 50) {
        for (const y of [158, 600]) {
          ellipse(ctx, x, y, 6, 6);
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
      ctx.lineWidth = 6;
      // the hatch (where the storm comes out)
      ctx.beginPath();
      ctx.roundRect(300, 380, 150, 190, 18);
      ctx.fillStyle = '#3a2a3e';
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#6a4a6e';
      for (let i = 0; i < 4; i++) ctx.fillRect(314, 400 + i * 42, 122, 18);
      // gauge
      ellipse(ctx, 130, 480, 70, 70);
      ctx.fillStyle = '#fff4dc';
      ctx.fill();
      ctx.stroke();
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(130, 480, 52, Math.PI * 0.85, Math.PI * 1.5);
      ctx.strokeStyle = '#5fbf3a';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(130, 480, 52, Math.PI * 1.5, Math.PI * 2.15);
      ctx.strokeStyle = '#e8364e';
      ctx.stroke();
      ctx.lineWidth = 6;
      ctx.strokeStyle = INK;
    });
    // pedestal and the big red button
    canvasTexture(this, 'pedestal', 150, 170, (ctx) => {
      ctx.lineWidth = 5;
      ctx.strokeStyle = INK;
      ctx.fillStyle = '#8a8a9a';
      ctx.beginPath();
      ctx.moveTo(30, 30);
      ctx.lineTo(120, 30);
      ctx.lineTo(140, 168);
      ctx.lineTo(10, 168);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffd84a';
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(22 + i * 30, 168);
        ctx.lineTo(38 + i * 30, 168);
        ctx.lineTo(52 + i * 30, 120);
        ctx.lineTo(36 + i * 30, 120);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = '#5a5a6a';
      ctx.fillRect(18, 18, 114, 18);
      ctx.strokeRect(18, 18, 114, 18);
    });
    canvasTexture(this, 'button', 100, 50, (ctx) => {
      ctx.lineWidth = 5;
      ctx.strokeStyle = INK;
      ctx.beginPath();
      ctx.ellipse(50, 46, 44, 30, 0, Math.PI, 0);
      ctx.closePath();
      const g = ctx.createRadialGradient(38, 26, 4, 50, 40, 46);
      g.addColorStop(0, '#ff8a8a');
      g.addColorStop(1, '#c8102e');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.stroke();
    });
    // the hall: stone wall with a big arched window on the right
    canvasTexture(
      this,
      'hall',
      W,
      H,
      (ctx) => {
        ctx.fillStyle = '#4a4e6a';
        ctx.fillRect(0, 0, W, H);
        // stone blocks
        ctx.strokeStyle = 'rgba(30,26,40,0.55)';
        ctx.lineWidth = 3;
        for (let row = 0; row < 14; row++) {
          const y = row * 70;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(W, y);
          ctx.stroke();
          for (let x = (row % 2) * 90; x < W; x += 180) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x, y + 70);
            ctx.stroke();
          }
        }
        // vines
        ctx.strokeStyle = '#3f7a2e';
        ctx.lineWidth = 9;
        for (const x0 of [720, 1380]) {
          ctx.beginPath();
          ctx.moveTo(x0, 0);
          for (let y = 0; y < 560; y += 40) ctx.lineTo(x0 + Math.sin(y / 60) * 26, y);
          ctx.stroke();
        }
        // the window
        const wx = 1500;
        const wy = 230;
        const ww = 300;
        const wh = 460;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(wx, wy + wh);
        ctx.lineTo(wx, wy + ww / 2);
        ctx.arc(wx + ww / 2, wy + ww / 2, ww / 2, Math.PI, 0);
        ctx.lineTo(wx + ww, wy + wh);
        ctx.closePath();
        ctx.clip();
        const sky = ctx.createLinearGradient(0, wy, 0, wy + wh);
        sky.addColorStop(0, '#1d1a4f');
        sky.addColorStop(1, '#5a4a8a');
        ctx.fillStyle = sky;
        ctx.fillRect(wx, wy, ww, wh);
        ctx.fillStyle = '#fff6c8';
        ellipse(ctx, wx + 200, wy + 120, 44, 44);
        ctx.fill();
        ctx.fillStyle = '#1d1a4f';
        ellipse(ctx, wx + 218, wy + 108, 40, 40);
        ctx.fill();
        ctx.fillStyle = '#fffbe0';
        for (let i = 0; i < 14; i++) ctx.fillRect(wx + ((i * 97) % ww), wy + ((i * 61) % 260) + 20, 4, 4);
        ctx.fillStyle = '#2a4a2a';
        for (let i = 0; i < 6; i++) {
          ellipse(ctx, wx + i * 60, wy + wh - 40, 70, 60);
          ctx.fill();
        }
        ctx.restore();
        ctx.lineWidth = 16;
        ctx.strokeStyle = '#2e2a3e';
        ctx.beginPath();
        ctx.moveTo(wx, wy + wh);
        ctx.lineTo(wx, wy + ww / 2);
        ctx.arc(wx + ww / 2, wy + ww / 2, ww / 2, Math.PI, 0);
        ctx.lineTo(wx + ww, wy + wh);
        ctx.stroke();
        ctx.fillStyle = '#7a7a8e';
        ctx.fillRect(wx - 30, wy + wh, ww + 60, 26);
        ctx.strokeRect(wx - 30, wy + wh, ww + 60, 26);
        // floor
        ctx.fillStyle = '#6a5e5a';
        ctx.fillRect(0, FLOOR, W, H - FLOOR);
        ctx.strokeStyle = 'rgba(30,26,40,0.6)';
        ctx.lineWidth = 3;
        for (let x = 0; x < W; x += 160) {
          ctx.beginPath();
          ctx.moveTo(x, FLOOR);
          ctx.lineTo(x - 80, H);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(0, FLOOR + 70);
        ctx.lineTo(W, FLOOR + 70);
        ctx.stroke();
        ctx.lineWidth = 6;
        ctx.strokeStyle = INK;
        ctx.beginPath();
        ctx.moveTo(0, FLOOR);
        ctx.lineTo(W, FLOOR);
        ctx.stroke();
        // a red carpet up to the throne
        ctx.fillStyle = '#9a1f34';
        ctx.beginPath();
        ctx.moveTo(1020, FLOOR);
        ctx.lineTo(1320, FLOOR);
        ctx.lineTo(1420, H);
        ctx.lineTo(920, H);
        ctx.closePath();
        ctx.fill();
      },
      1,
    );
    canvasTexture(this, 'eye', 30, 18, (ctx) => {
      ellipse(ctx, 15, 9, 13, 7);
      ctx.fillStyle = '#ffe14a';
      ctx.shadowColor = '#ff5a2a';
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;
      ellipse(ctx, 19, 9, 3.5, 5.5);
      ctx.fillStyle = '#1a0a0a';
      ctx.fill();
    });
    canvasTexture(this, 'paper', W, H, (ctx) => {
      const g = ctx.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 1200);
      g.addColorStop(0, '#fff6e0');
      g.addColorStop(1, '#e8d2a6');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }, 1);
  }

  private text(x: number, y: number, s: string, size: number, font = HAND, color = INK) {
    return this.add
      .text(x, y, s, { fontFamily: font, fontSize: `${size}px`, color, stroke: '#fff8e6', strokeThickness: Math.round(size / 7), align: 'center' })
      .setOrigin(0.5);
  }

  // ------------------------------------------------------------------------------------------
  // scene 1–3: the throne hall

  private buildHall() {
    const hall = this.add.container(0, 0);
    this.hall = hall;
    const bg = this.add.image(W / 2, H / 2, 'hall');
    hall.add(bg);

    // the machine
    this.machine = this.add.container(330, FLOOR - 320);
    const body = this.add.image(0, 0, 'machine').setScale(0.5);
    const gl = this.add.image(-110, -60, 'gear-l').setScale(0.5);
    const gm = this.add.image(62, -112, 'gear-m').setScale(0.5);
    const gs = this.add.image(152, -42, 'gear-s').setScale(0.5);
    this.gears = [
      { img: gl, dir: 1, teeth: 14 },
      { img: gm, dir: -1, teeth: 10 },
      { img: gs, dir: -1, teeth: 8 },
    ];
    this.needle = this.add.rectangle(-120, 160, 8, 58, 0x2a2233).setOrigin(0.5, 1);
    this.lamp = this.add.circle(190, -150, 20, 0x5a1a1a).setStrokeStyle(5, 0x2a2233);
    const sign = this.text(-10, -250, 'CHAOS-O-MAT 3000', 46, MARKER, '#3a1f4a');
    for (let i = 0; i < 6; i++) this.puffs.push(this.add.circle(0, 0, 40, 0xf2eef8).setStrokeStyle(4, 0x6a6a8a).setVisible(false));
    this.machine.add([body, gl, gm, gs, this.needle, this.lamp, sign, ...this.puffs]);
    hall.add(this.machine);

    // the storm that comes out of it
    this.storm = this.add.graphics();
    hall.add(this.storm);
    for (let i = 0; i < 4; i++) {
      const eye = this.add.image(0, 0, 'eye').setScale(2.4).setVisible(false);
      this.stormEyes.push(eye);
    }

    // pedestal with the red button
    const ped = this.add.image(720, FLOOR - 85, 'pedestal').setScale(0.5);
    this.buttonCap = this.add.image(720, FLOOR - 170, 'button').setOrigin(0.5, 1).setScale(0.5);
    const warn = this.text(720, FLOOR - 250, 'NICHT\nDRÜCKEN!', 40, MARKER, '#c8102e');
    warn.setRotation(-0.06).setLineSpacing(-12);
    hall.add([this.buttonCap, ped, warn]);

    // throne
    const throne = this.add.image(1170, FLOOR - 270, 'throne').setScale(0.5);
    hall.add(throne);

    this.king = new Actor(this, 'hase', 5.2, 0);
    this.rat = new Actor(this, 'ratte', 4.6, 1);
    this.cat = new Actor(this, 'katze', 4.6, 2);
    this.mole = new Actor(this, 'maulwurf', 4.6, 3);
    hall.add([this.king.holder, this.cat.holder, this.mole.holder, this.rat.holder]);
    this.crown = this.add.image(0, 0, 'crown').setScale(0.55);
    hall.add(this.crown);
    for (const eye of this.stormEyes) hall.add(eye);

    for (let i = 0; i < 3; i++) {
      const z = this.text(0, 0, 'Z', 54 + i * 10, HAND, '#5a5a9a');
      this.zzz.push(z);
      hall.add(z);
    }
    const word = (s: string, from: number, to: number, x: number, y: number, rot: number, size: number, color: string) => {
      const obj = this.text(x, y, s, size, MARKER, color);
      obj.setStroke('#fff8e6', 16);
      this.words.push({ obj, from, to, x, y, rot, size });
      hall.add(obj);
    };
    word('KLICK!', C.click, C.click + 1.0, 720, FLOOR - 360, -0.12, 110, '#c8102e');
    word('RATTER!', 8.45, 9.55, 360, 180, 0.08, 96, '#b3743a');
    word('RATTER!', 9.2, 10.3, 560, 330, -0.1, 84, '#b3743a');
    word('WUUUSCH!', C.stormOut, C.stormOut + 1.1, 620, 520, 0.05, 90, '#7a3aa8');

    // speech bubble of the king
    this.bubble = this.add.container(0, 0);
    const bg2 = this.add.graphics();
    bg2.fillStyle(0xfffaf0, 1).lineStyle(6, 0x2a2233, 1);
    bg2.fillRoundedRect(-230, -70, 460, 120, 40).strokeRoundedRect(-230, -70, 460, 120, 40);
    bg2.fillTriangle(-40, 46, 10, 46, -70, 110).lineBetween(-40, 49, -70, 110).lineBetween(10, 49, -70, 110);
    const say = this.text(0, -10, 'MEINE KRONE!!', 60, MARKER, '#c8102e');
    say.setStroke('#fffaf0', 4);
    this.bubble.add([bg2, say]);
    hall.add(this.bubble);

    // caption on a torn paper strip
    this.captionBox = this.add.graphics().setDepth(800);
    this.caption = this.add
      .text(W / 2, 96, '', { fontFamily: HAND, fontSize: '62px', color: INK })
      .setOrigin(0.5)
      .setDepth(801);
  }

  private updateHall(t: number, time: number) {
    const visible = t < C.chase + 0.4;
    this.hall.setVisible(visible);
    if (!visible) return;

    // camera: slow push-in, then towards the button, back out for the chaos, then along to the window
    const push = E.Sine.InOut(seg(t, 0, 4));
    const focus = E.Sine.InOut(seg(t, 5.9, 6.9)) * (1 - E.Sine.InOut(seg(t, 7.9, 8.6)));
    const out = E.Sine.InOut(seg(t, 10.8, 12.1));
    const zoom = lerp(1.0, 1.04, push) + focus * 0.14 - out * 0.02;
    let cx = lerp(960, 990, push) + focus * (870 - 990) + out * 60;
    let cy = 540 + focus * 60;
    // shake while the machine runs
    const shake = seg(t, C.machineStart, C.machineStart + 0.4) * (1 - seg(t, 10.6, 11.4));
    cx += Math.sin(time * 71) * 7 * shake;
    cy += Math.cos(time * 57) * 5 * shake;
    this.setCam(cx, cy, zoom);

    // --- the machine: ticking gears, then spinning up ---
    // tick: a small, eased step every half second
    const ticks = Math.floor(t / 0.5) + E.Back.Out(clamp01((t % 0.5) / 0.18));
    this.gearAngle = ticks * 0.12 + (t > C.machineStart ? this.spinDistance(t) : 0);
    for (const g of this.gears) g.img.setRotation(this.gearAngle * g.dir * (14 / g.teeth));
    this.needle.setRotation(lerp(-1.0, 1.25, E.Cubic.Out(seg(t, C.machineStart, 9.2))) + Math.sin(time * 40) * 0.08 * shake);
    const blink = t > C.click && Math.floor(t * 6) % 2 === 0;
    this.lamp.setFillStyle(blink ? 0xff3a3a : 0x5a1a1a);
    const mShake = shake * (Math.sin(time * 90) * 4);
    this.machine.setPosition(330 + mShake, FLOOR - 320 + Math.abs(mShake) * 0.5).setRotation(Math.sin(time * 60) * 0.012 * shake);
    // steam puffs from the chimney
    this.puffs.forEach((p, i) => {
      const start = C.steam[i % C.steam.length] + Math.floor(i / C.steam.length) * 0.3;
      const k = seg(t, start, start + 1.3);
      p.setVisible(k > 0 && k < 1);
      p.setPosition(35 + k * 60 + Math.sin(k * 6 + i) * 20, -300 - k * 260).setScale(0.6 + k * 1.8).setAlpha(1 - k);
    });
    // the button goes down on the click
    const press = seg(t, C.click - 0.05, C.click + 0.05) * (1 - seg(t, C.click + 0.5, C.click + 0.8));
    this.buttonCap.setY(FLOOR - 170 + press * 16).setScale(1, 1 - press * 0.45);

    // --- the storm grows out of the hatch ---
    const sk = E.Cubic.Out(seg(t, C.stormOut, 11.6)) * 0.7 + seg(t, 11.6, 12.3) * 0.25;
    const front = lerp(480, 1150, sk);
    this.drawStorm(this.storm, t >= C.stormOut ? front : -999, time, 0, 1.0, t >= C.stormOut ? seg(t, C.stormOut, C.stormOut + 0.6) : 0);
    this.stormEyes.forEach((e, i) => {
      const show = t > C.stormOut + 0.5;
      e.setVisible(show);
      if (show) e.setPosition(front - 120 - (i % 2) * 190, 260 + i * 150 + Math.sin(time * 2 + i) * 20).setAlpha(0.9 + Math.sin(time * 8 + i) * 0.1);
    });

    // --- the king ---
    const k = this.king;
    const kingY0 = FLOOR - 218; // standing on the throne seat
    k.face = t < C.wake ? 'blink' : null;
    if (t < C.wake) {
      k.set(1170, kingY0, 0, false, false);
      k.lean = Math.sin(time * 1.3) * 0.03 - 0.05;
    } else if (t < C.runStart) {
      const j = seg(t, C.wake, C.wake + 0.6);
      k.set(1170, kingY0 - hop(j, 150), 0, j > 0 && j < 1, false);
      k.lean = 0;
      k.face = 'scared';
    } else {
      // jumps off the throne and runs after the crown
      const r = seg(t, C.runStart, 12.3);
      const x = lerp(1170, 2300, E.Quadratic.In(r));
      const drop = seg(t, C.runStart, C.runStart + 0.35);
      const leap = seg(t, C.leap + 0.15, C.leap + 0.75);
      k.set(x, lerp(kingY0, FLOOR, E.Quadratic.In(drop)) - hop(leap, 260), 520, (drop > 0 && drop < 1) || (leap > 0 && leap < 1), false);
      k.face = 'strain';
    }

    // --- the rivals ---
    this.sneaker(this.cat, t, time, C.mocca, 1450, 0);
    this.sneaker(this.mole, t, time, C.buddel, 1330, 1);
    this.rat.face = null;
    const r = this.rat;
    if (t < C.zuendi) {
      r.holder.setVisible(false);
    } else {
      r.holder.setVisible(true);
      if (t < C.zuendi + 0.45) {
        // drops from the window sill
        const d = seg(t, C.zuendi, C.zuendi + 0.45);
        r.set(lerp(1650, 1540, d), lerp(690, FLOOR, E.Quadratic.In(d)) - hop(d, 40), 0, true, true);
      } else if (t < C.tiptoeEnd) {
        // tiptoes to the left past the throne
        const d = seg(t, C.zuendi + 0.45, C.tiptoeEnd);
        r.set(lerp(1540, 900, E.Sine.InOut(d)), FLOOR - Math.abs(Math.sin(d * 18)) * 10, 110, false, true);
      } else if (t < C.stumble) {
        // turns round and stretches towards the crown
        r.set(900 + seg(t, C.stretch, C.stumble) * 30, FLOOR, 0, false, false);
        r.lean = 0.18 * seg(t, C.stretch, C.stumble);
        r.face = 'strain';
      } else if (t < C.click + 0.1) {
        // loses balance and staggers back onto the button
        const d = seg(t, C.stumble, C.click);
        r.set(lerp(930, 752, E.Quadratic.In(d)), FLOOR - 170 * E.Sine.Out(d) + hop(d, 0), 60, true, false);
        r.lean = lerp(0.18, -0.5, d);
        r.face = 'scared';
      } else if (t < C.runStart) {
        // sits on the button, frozen
        r.set(752, FLOOR - 170 + seg(t, C.click, C.click + 0.1) * 16, 0, false, false);
        r.lean = -0.3 + Math.sin(time * 30) * 0.02;
        r.face = 'scared';
      } else {
        const d = seg(t, C.runStart, 12.3);
        const leap = seg(t, C.leap, C.leap + 0.6);
        r.set(lerp(752, 2250, E.Quadratic.In(d)), lerp(FLOOR - 154, FLOOR, seg(t, C.runStart, C.runStart + 0.3)) - hop(leap, 240), 520, leap > 0 && leap < 1, false);
        r.lean = 0;
        r.face = 'scared';
      }
    }
    for (const a of [this.king, this.rat, this.cat, this.mole]) a.tick(time);
    // the rat is drawn in front of the throne and the cat/mole in front of the rat's path
    this.hall.bringToTop(this.rat.holder);

    // --- the crown ---
    if (t < C.crownPop) {
      const head = this.king.headTop();
      this.crown.setPosition(head.x + 6, head.y - 6).setRotation(-0.25 + Math.sin(time * 1.3) * 0.03);
      this.crownStart = { x: head.x + 6, y: head.y - 6 };
    } else {
      const c = seg(t, C.crownPop, C.crownOut);
      const start = this.crownStart;
      const x = lerp(start.x, 2050, E.Sine.In(c));
      // a flat arc that stays in the picture, out through the window
      const y = lerp(start.y, 420, c) - hop(c, 90);
      this.crown.setPosition(x, y).setRotation(c * 9);
    }
    this.hall.bringToTop(this.crown);

    // --- Zzz, comic words, bubble ---
    this.zzz.forEach((z, i) => {
      const period = 1.6;
      const p = (t + i * (period / 3)) % period;
      const k2 = p / period;
      const show = t < C.wake - 0.1;
      z.setVisible(show);
      const head = this.king.headTop();
      z.setPosition(head.x + 60 + k2 * 90 + Math.sin(k2 * 7) * 12, head.y - 20 - k2 * 170).setAlpha(Math.sin(k2 * Math.PI)).setScale(0.6 + k2 * 0.6);
    });
    for (const w of this.words) {
      const k2 = seg(t, w.from, w.to);
      w.obj.setVisible(k2 > 0 && k2 < 1);
      const pop = E.Back.Out(clamp01(k2 * 5));
      w.obj.setPosition(w.x, w.y - k2 * 30).setScale(pop).setRotation(w.rot + Math.sin(k2 * 20) * 0.03).setAlpha(k2 > 0.8 ? (1 - k2) * 5 : 1);
    }
    this.hall.bringToTop(this.stormEyes[0]);
    const b = seg(t, C.wake + 0.45, C.runStart + 0.2);
    this.bubble.setVisible(b > 0 && b < 1);
    const head = this.king.headTop();
    this.bubble.setPosition(head.x + 250, head.y - 150).setScale(E.Back.Out(clamp01(b * 6)));
    this.hall.bringToTop(this.bubble);
    for (const w of this.words) this.hall.bringToTop(w.obj);
    // the flying crown is the star of the moment: always in front
    this.hall.bringToTop(this.crown);
  }

  private crownStart = { x: 1180, y: 330 };

  /** How far the gears turned since the machine started (integral of an ease-in spin). */
  private spinDistance(t: number): number {
    const a = C.machineStart;
    const b = 9.6;
    const top = 13;
    if (t <= b) {
      const d = t - a;
      const len = b - a;
      return (top * d * d * d) / (3 * len * len);
    }
    return (top * (b - a)) / 3 + top * (t - b);
  }

  /** Mocca and Buddel: in through the window, tiptoe a little, then freeze in shock. */
  private sneaker(a: Actor, t: number, time: number, start: number, stopX: number, i: number) {
    if (t < start) {
      a.holder.setVisible(false);
      return;
    }
    a.holder.setVisible(true);
    a.face = null;
    a.lean = 0;
    if (t < start + 0.45) {
      const d = seg(t, start, start + 0.45);
      a.set(lerp(1650, 1580 - i * 40, d), lerp(690, FLOOR, E.Quadratic.In(d)) - hop(d, 40), 0, true, true);
    } else if (t < start + 1.4) {
      const d = seg(t, start + 0.45, start + 1.4);
      a.set(lerp(1580 - i * 40, stopX, E.Sine.InOut(d)), FLOOR - Math.abs(Math.sin(d * 12)) * 8, 100, false, true);
    } else if (t < C.runStart + 0.15 + i * 0.12) {
      a.set(stopX, FLOOR, 0, false, true);
      if (t > C.click) {
        a.face = 'scared';
        a.lean = Math.sin(time * 34 + i) * 0.03;
      } else if (t > C.stretch) a.face = 'strain';
    } else {
      const s = C.runStart + 0.15 + i * 0.12;
      const d = seg(t, s, 12.3);
      const leap = seg(t, C.leap + 0.2 + i * 0.12, C.leap + 0.8 + i * 0.12);
      a.set(lerp(stopX, 2300, E.Quadratic.In(d)), FLOOR - hop(leap, 220), 520, leap > 0 && leap < 1, false);
      a.face = 'scared';
    }
  }

  /** A wall of storm cloud with its front edge at x; `glow` fades the purple rim in. */
  private drawStorm(g: Phaser.GameObjects.Graphics, front: number, time: number, left: number, height: number, grow: number) {
    g.clear();
    if (front < -900) return;
    const top = 0;
    const bottom = H * height + 40;
    g.fillStyle(0x3a1f4a, 1);
    g.fillRect(left - 400, top - 200, front - left + 400 - 60, bottom + 400);
    // billowing front
    for (let i = 0; i < 16; i++) {
      const y = top + (i / 15) * bottom;
      const r = (70 + Math.sin(time * 2.3 + i * 1.7) * 18) * (0.4 + 0.6 * grow);
      const x = front - 80 + Math.sin(time * 3 + i) * 22;
      g.fillStyle(i % 3 === 0 ? 0x4e2a62 : 0x3a1f4a, 1);
      g.fillCircle(x, y, r);
    }
    // swirls inside
    for (let i = 0; i < 12; i++) {
      const x = front - 220 - ((i * 137) % 700);
      const y = ((i * 211 + time * 90) % (bottom + 200)) - 100;
      g.fillStyle(0x5e3478, 0.6);
      g.fillCircle(x, y, 30 + (i % 4) * 16);
    }
    g.lineStyle(10, 0xb86bff, 0.9 * grow);
    g.beginPath();
    for (let i = 0; i <= 30; i++) {
      const y = top + (i / 30) * bottom;
      const x = front - 20 + Math.sin(time * 3 + i * 0.8) * 22 + Math.sin(i * 2.1) * 10;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.strokePath();
  }

  // ------------------------------------------------------------------------------------------
  // scene 4: the chase through three worlds

  private buildChase() {
    const c = this.add.container(0, 0);
    this.chase = c;
    const worlds: WorldId[] = ['jungle', 'mine', 'sky'];
    for (const w of worlds) {
      const bg = this.add.tileSprite(W / 2, H / 2, W, H, worldAssetKey(w, 'bg'));
      const src = this.textures.get(worldAssetKey(w, 'bg')).getSourceImage() as HTMLImageElement;
      bg.setTileScale(H / src.height);
      const fill = this.add.tileSprite(W / 2, FLOOR + 90, W, 360, worldAssetKey(w, 'fill')).setOrigin(0.5, 0);
      const top = this.add.tileSprite(W / 2, FLOOR + 40, W, 98, worldAssetKey(w, 'top')).setOrigin(0.5, 0.5);
      fill.setTileScale(1.2);
      this.chaseBgs[w] = bg;
      this.chaseFills[w] = fill;
      this.chaseTops[w] = top;
      c.add([bg, fill, top]);
    }
    this.chaseStorm = this.add.graphics();
    this.speed = this.add.graphics();
    this.saw = this.add.image(0, 0, 'po-saw').setScale(0.9);
    c.add([this.speed, this.saw]);
    const ids = ['katze', 'ratte', 'maulwurf', 'hase'];
    ids.forEach((id, i) => {
      const a = new Actor(this, id, 3.8, 4 + i);
      this.runners.push(a);
      c.add(a.holder);
    });
    this.chaseCrown = this.add.image(0, 0, 'crown').setScale(0.6);
    c.add(this.chaseCrown);
    c.add(this.chaseStorm);
    for (let i = 0; i < 3; i++) {
      const eye = this.add.image(0, 0, 'eye').setScale(2.2);
      this.chaseEyes.push(eye);
      c.add(eye);
    }
    c.setVisible(false);
  }

  private chaseCrown!: Phaser.GameObjects.Image;

  private updateChase(t: number, time: number) {
    const on = t >= C.chase && t < C.title + 0.3;
    this.chase.setVisible(on);
    if (!on) return;
    const k = t - C.chase;
    this.setCam(W / 2, H / 2 - 20, 1 + Math.sin(k * 0.8) * 0.02);
    const scroll = k * 1150;
    // three worlds, cross-fading
    const mix = { jungle: 1 - seg(t, C.mine - 0.25, C.mine + 0.25), mine: seg(t, C.mine - 0.25, C.mine + 0.25) * (1 - seg(t, C.sky - 0.25, C.sky + 0.25)), sky: seg(t, C.sky - 0.25, C.sky + 0.25) };
    for (const w of ['jungle', 'mine', 'sky'] as WorldId[]) {
      const a = mix[w as 'jungle' | 'mine' | 'sky'];
      for (const s of [this.chaseBgs[w]!, this.chaseFills[w]!, this.chaseTops[w]!]) s.setAlpha(a).setVisible(a > 0.01);
      this.chaseBgs[w]!.tilePositionX = scroll * 0.25 / this.chaseBgs[w]!.tileScaleX;
      this.chaseTops[w]!.tilePositionX = scroll;
      this.chaseFills[w]!.tilePositionX = scroll / 1.2;
    }

    // the saw rolls towards the runners, they hop over it one after the other
    const sawX = 2150 - (t - C.sawJump + 1.0) * 1150;
    this.saw.setPosition(sawX, FLOOR - 30).setRotation(-time * 8).setVisible(sawX > -200 && sawX < 2200);

    // runners: bunched up, overtaking each other
    const base = [1010, 1250, 770, 520];
    this.runners.forEach((a, i) => {
      const wob = Math.sin(k * (1.3 + i * 0.37) + i * 2) * 80 + Math.sin(k * 0.6 + i) * 30;
      const x = base[i] + wob + (i === 3 ? seg(t, 15.2, 16.8) * 260 : 0);
      // jump over the saw when it passes
      const tJump = C.sawJump - 1.0 + (2150 - x - 130) / 1150;
      const j = seg(t, tJump, tJump + 0.5);
      // and a few happy hops across gaps
      const extra = seg(t, 15.9 + i * 0.11, 16.35 + i * 0.11);
      const y = FLOOR - hop(j, 190) - hop(extra, 120);
      a.set(x, y, 560, (j > 0 && j < 1) || (extra > 0 && extra < 1), false);
      a.face = i === 3 ? 'strain' : null;
      a.lean = 0.08;
      a.holder.setDepth(10 + i);
      a.tick(time);
    });

    // the crown hops ahead of them
    const ck = k * 2.2;
    const cx = 1500 + Math.sin(k * 0.9) * 60;
    this.chaseCrown.setPosition(cx, FLOOR - 40 - Math.abs(Math.sin(ck * Math.PI)) * 220).setRotation(Math.sin(ck * Math.PI * 2) * 0.4);

    // speed lines
    this.speed.clear();
    this.speed.lineStyle(5, 0xffffff, 0.55);
    for (let i = 0; i < 14; i++) {
      const y = 180 + ((i * 137) % 620);
      const x = W - ((k * 2600 + i * 311) % (W + 400));
      this.speed.lineBetween(x, y, x + 120 + (i % 3) * 60, y);
    }

    // the storm behind them
    const front = 260 + Math.sin(k * 1.4) * 50 + seg(t, 15.8, 16.9) * 60;
    this.drawStorm(this.chaseStorm, front, time, -200, 1.0, 1);
    this.chaseEyes.forEach((e, i) => e.setPosition(front - 110 - (i % 2) * 120, 240 + i * 210 + Math.sin(time * 2 + i) * 20));
  }

  // ------------------------------------------------------------------------------------------
  // scene 5: title

  private buildTitle() {
    const c = this.add.container(0, 0);
    this.titleLayer = c;
    const paper = this.add.image(W / 2, H / 2, 'paper');
    this.logo = this.add.image(W / 2, 440, 'brand-title');
    this.titleCrown = this.add.image(0, 0, 'crown').setScale(1.1);
    this.tagline = this.add
      .text(W / 2, 880, 'Wer zuerst ankommt, trägt die Krone!', { fontFamily: HAND, fontSize: '84px', color: INK, stroke: '#fff8e6', strokeThickness: 10 })
      .setOrigin(0.5);
    c.add([paper, this.logo, this.titleCrown, this.tagline]);
    const colors = [0xe8364e, 0xffd84a, 0x3aa0ff, 0x5fd35a, 0xff8a2a, 0xb86bff];
    for (let i = 0; i < 70; i++) {
      const r = this.add.rectangle(0, 0, 18, 10, colors[i % colors.length]).setStrokeStyle(2, 0x2a2233);
      // deterministic "random" burst
      const rnd = (n: number) => {
        const x = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453;
        return x - Math.floor(x);
      };
      const a = -Math.PI / 2 + (rnd(1) - 0.5) * Math.PI * 1.6;
      const sp = 500 + rnd(2) * 900;
      r.setSize(14 + rnd(3) * 14, 8 + rnd(4) * 8);
      this.confetti.push({ obj: r, vx: Math.cos(a) * sp + (rnd(5) - 0.5) * 300, vy: Math.sin(a) * sp, spin: (rnd(6) - 0.5) * 16 });
      c.add(r);
    }
    c.setVisible(false);
  }

  private titleCrown!: Phaser.GameObjects.Image;

  private updateTitle(t: number, time: number) {
    const on = t >= C.title;
    this.titleLayer.setVisible(on);
    if (!on) return;
    this.setCam(W / 2, H / 2, 1 + seg(t, C.title, 20) * 0.04);
    // the logo stamps in
    const s = seg(t, C.stamp - 0.25, C.stamp);
    const settle = seg(t, C.stamp, C.stamp + 0.35);
    const scale = t < C.stamp ? lerp(2.4, 1.28, E.Quadratic.In(s)) : 1.28 + Math.sin(settle * Math.PI * 3) * 0.05 * (1 - settle);
    this.logo.setScale(scale).setAlpha(clamp01(s * 3)).setRotation(lerp(-0.12, -0.02, s));
    // the crown falls onto the logo
    const c = seg(t, C.crownLand - 0.55, C.crownLand);
    const bounce = seg(t, C.crownLand, C.crownLand + 0.4);
    const cy = t < C.crownLand ? lerp(-150, 118, E.Quadratic.In(c)) : 118 - hop(bounce, 40);
    this.titleCrown.setPosition(W / 2 + 330, cy).setRotation(t < C.crownLand ? lerp(-2, 0.25, c) : 0.25 - Math.sin(bounce * 8) * 0.06 * (1 - bounce));
    this.titleCrown.setVisible(t > C.crownLand - 0.55);
    // confetti from the stamp
    const ck = t - C.stamp;
    this.confetti.forEach((p) => {
      p.obj.setVisible(ck > 0 && ck < 2.5);
      if (ck <= 0) return;
      p.obj.setPosition(W / 2 + p.vx * ck * 0.55, 440 + p.vy * ck * 0.55 + 700 * ck * ck).setRotation(p.spin * ck);
    });
    // tagline writes itself
    const tk = seg(t, C.tagline, C.tagline + 1.1);
    const full = 'Wer zuerst ankommt, trägt die Krone!';
    this.tagline.setText(full.slice(0, Math.round(full.length * tk)));
    // fade out at the very end
    this.flash.setFillStyle(0x1d1a2f).setAlpha(seg(t, 19.55, 20));
    void time;
  }

  // ------------------------------------------------------------------------------------------

  private cam = { x: W / 2, y: H / 2, z: 1 };

  private setCam(x: number, y: number, z: number) {
    // never show anything outside the drawn 1920×1080 picture
    x = Phaser.Math.Clamp(x, W / 2 / z, W - W / 2 / z);
    y = Phaser.Math.Clamp(y, H / 2 / z, H - H / 2 / z);
    this.cam = { x, y, z };
    this.cameras.main.setZoom(z).centerOn(x, y);
  }

  private updateCaption(t: number) {
    const caps: [number, number, string][] = [
      [0.3, 3.9, 'Mitternacht im Dschungeltempel …'],
      [4.2, 7.1, 'Drei Rivalen wollen die Königskrone.'],
    ];
    const cur = caps.find(([a, b]) => t >= a && t < b);
    this.captionBox.clear();
    if (!cur) {
      this.caption.setVisible(false);
      return;
    }
    const [a, b, s] = cur;
    const alpha = seg(t, a, a + 0.35) * (1 - seg(t, b - 0.35, b));
    // stays at the top of the picture whatever the camera does
    const z = this.cam.z;
    const top = this.cam.y - H / 2 / z;
    this.caption.setVisible(true).setText(s).setAlpha(alpha).setScale(1 / z).setPosition(this.cam.x, top + 96 / z);
    const w = (this.caption.width + 90) / z;
    this.captionBox.fillStyle(0xfff6e0, 0.92 * alpha).lineStyle(4 / z, 0x2a2233, alpha);
    this.captionBox.fillRoundedRect(this.cam.x - w / 2, top + 50 / z, w, 96 / z, 14 / z).strokeRoundedRect(this.cam.x - w / 2, top + 50 / z, w, 96 / z, 14 / z);
  }

  update() {
    const t = this.frame / FPS;
    const time = t;
    this.updateHall(t, time);
    this.updateChase(t, time);
    this.updateTitle(t, time);
    this.updateCaption(t);
    // quick paper flashes between the scenes
    const cut = Math.max(1 - Math.abs(t - C.chase) / 0.12, 1 - Math.abs(t - C.title) / 0.12, 0);
    if (t < 19.5) this.flash.setFillStyle(0xfff6e0).setAlpha(clamp01(cut));
    // the pencil lines "boil" 12 times a second; the title is a little cleaner
    this.sketch.seed = Math.floor(t * 12) * 0.137;
    this.sketch.amount = t >= C.title + 0.2 ? 0.8 : 1;
    this.frame++;
  }
}

// the hand-lettering fonts must be ready before the first text is drawn
await Promise.all([document.fonts.load('60px "Patrick Hand"'), document.fonts.load('60px "Permanent Marker"')]);
const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'film',
  width: W,
  height: H,
  backgroundColor: '#1d1a2f',
  render: { antialias: true, preserveDrawingBuffer: true },
  pipeline: { Sketch: SketchPipeline } as unknown as Phaser.Types.Core.PipelineConfig,
  scene: [FilmScene],
  fps: { target: FPS },
});
(window as unknown as { game: Phaser.Game }).game = game;
