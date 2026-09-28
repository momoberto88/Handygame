import Phaser from "phaser";
import { characterById } from "../../meta/characters";
import { canvasTexture, ellipse } from "../art/canvas";
import type { Expression } from "../art/characterArt";
import { RunnerView } from "../RunnerView";
import { createRunner } from "../../sim/race";
import type { RunnerState } from "../../sim/types";

/**
 * Building blocks of the drawn films (the intro in tools/intro/ and the coronation after a cup):
 * film space is 1920×1080 with the floor at FLOOR, props are drawn in code, and the characters are
 * the game's own rigs driven by fake runner states.
 */
export const FILM_W = 1920;
export const FILM_H = 1080;
export const FLOOR = 900;
export const INK = "#2a2233";
export const HAND = '"Patrick Hand", "Comic Sans MS", sans-serif';
export const MARKER = '"Permanent Marker", "Comic Sans MS", sans-serif';

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const seg = (t: number, a: number, b: number) =>
  clamp01((t - a) / (b - a));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** Height of a hop at progress k (0..1). */
export const hop = (k: number, h: number) =>
  k <= 0 || k >= 1 ? 0 : 4 * h * k * (1 - k);

/** One of our characters, driven by a fake runner state so the real game rig animates it. */
export class Actor {
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
    skin?: string | null,
  ) {
    this.view = new RunnerView(
      scene,
      characterById(id),
      false,
      undefined,
      skin,
    );
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

  tick(time: number, dt = 1 / 30) {
    this.st.vy = (this.y - this.lastY) / Math.max(dt, 1e-3);
    if (!this.st.grounded && Math.abs(this.st.vy) < 1) this.st.vy = -1;
    this.lastY = this.y;
    this.view.update(this.st, 0, 0, dt, time);
    if (this.face)
      (this.view as unknown as { setFace(e: Expression): void }).setFace(
        this.face,
      );
    this.holder
      .setPosition(this.x, this.y)
      .setScale(this.flip ? -this.scale : this.scale, this.scale)
      .setRotation(this.lean);
  }

  /** Where the top of the head is on screen (for the crown). */
  headTop(): { x: number; y: number } {
    const head = (
      this.view as unknown as { head: Phaser.GameObjects.Container }
    ).head;
    const m = head.getWorldTransformMatrix();
    return { x: m.tx, y: m.ty - 17 * this.scale };
  }
}

/** Hand-lettered text as used in the films. */
export function filmText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  s: string,
  size: number,
  font = HAND,
  color = INK,
) {
  return scene.add
    .text(x, y, s, {
      fontFamily: font,
      fontSize: `${size}px`,
      color,
      stroke: "#fff8e6",
      strokeThickness: Math.round(size / 7),
      align: "center",
    })
    .setOrigin(0.5);
}

/** Crown, gears, throne, machine, pedestal, button, eye, paper and the 1920 px throne hall. */
export function makeFilmTextures(scene: Phaser.Scene) {
  // the crown
  canvasTexture(scene, "crown", 120, 92, (ctx) => {
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
    g.addColorStop(0, "#fff09a");
    g.addColorStop(0.5, "#ffc93a");
    g.addColorStop(1, "#d98a12");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = "#d98a12";
    ctx.fillRect(12, 70, 96, 12);
    ctx.strokeRect(12, 70, 96, 12);
    for (const [x, y, c] of [
      [60, 58, "#e8364e"],
      [32, 62, "#3aa0ff"],
      [88, 62, "#3aa0ff"],
    ] as const) {
      ellipse(ctx, x, y, 7, 7);
      ctx.fillStyle = c;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    for (const x of [6, 60, 114]) {
      ellipse(ctx, x, x === 60 ? 10 : 26, 6, 6);
      ctx.fillStyle = "#fff6c0";
      ctx.fill();
      ctx.stroke();
    }
  });
  // gears
  const gear = (key: string, r: number, teeth: number, color: string) =>
    canvasTexture(scene, key, r * 2 + 8, r * 2 + 8, (ctx) => {
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
      ctx.fillStyle = "rgba(0,0,0,0.18)";
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
      ctx.fillStyle = "#3a2a1e";
      ctx.fill();
    });
  gear("gear-l", 110, 14, "#c98a3a");
  gear("gear-m", 70, 10, "#b3743a");
  gear("gear-s", 46, 8, "#d9a653");
  // the throne
  canvasTexture(scene, "throne", 320, 540, (ctx) => {
    ctx.lineWidth = 5;
    ctx.strokeStyle = INK;
    ctx.beginPath();
    ctx.moveTo(40, 340);
    ctx.lineTo(40, 80);
    ctx.quadraticCurveTo(160, -20, 280, 80);
    ctx.lineTo(280, 340);
    ctx.closePath();
    ctx.fillStyle = "#d9a032";
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(70, 330);
    ctx.lineTo(70, 100);
    ctx.quadraticCurveTo(160, 20, 250, 100);
    ctx.lineTo(250, 330);
    ctx.closePath();
    ctx.fillStyle = "#b3243c";
    ctx.fill();
    ctx.stroke();
    // seat and legs
    ctx.fillStyle = "#d9a032";
    ctx.fillRect(20, 330, 280, 50);
    ctx.strokeRect(20, 330, 280, 50);
    ctx.fillStyle = "#9a6a1e";
    ctx.fillRect(40, 380, 40, 160);
    ctx.strokeRect(40, 380, 40, 160);
    ctx.fillRect(240, 380, 40, 160);
    ctx.strokeRect(240, 380, 40, 160);
    ctx.fillStyle = "#b3243c";
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
    ctx.fillStyle = "#ff8a2a";
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#5fbf3a";
    ellipse(ctx, 0, -44, 8, 14);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  });
  // the machine body
  canvasTexture(scene, "machine", 500, 640, (ctx) => {
    ctx.lineWidth = 6;
    ctx.strokeStyle = INK;
    // chimney
    ctx.fillStyle = "#7a5a3a";
    ctx.fillRect(330, 0, 70, 150);
    ctx.strokeRect(330, 0, 70, 150);
    ctx.fillStyle = "#5a4030";
    ctx.fillRect(318, 0, 94, 26);
    ctx.strokeRect(318, 0, 94, 26);
    // body
    ctx.beginPath();
    ctx.roundRect(20, 130, 460, 500, 30);
    const g = ctx.createLinearGradient(0, 130, 0, 630);
    g.addColorStop(0, "#d9904a");
    g.addColorStop(1, "#9a5a2a");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.stroke();
    // rivets
    ctx.fillStyle = "#ffd9a0";
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
    ctx.fillStyle = "#3a2a3e";
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#6a4a6e";
    for (let i = 0; i < 4; i++) ctx.fillRect(314, 400 + i * 42, 122, 18);
    // gauge
    ellipse(ctx, 130, 480, 70, 70);
    ctx.fillStyle = "#fff4dc";
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(130, 480, 52, Math.PI * 0.85, Math.PI * 1.5);
    ctx.strokeStyle = "#5fbf3a";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(130, 480, 52, Math.PI * 1.5, Math.PI * 2.15);
    ctx.strokeStyle = "#e8364e";
    ctx.stroke();
    ctx.lineWidth = 6;
    ctx.strokeStyle = INK;
  });
  // pedestal and the big red button
  canvasTexture(scene, "pedestal", 150, 170, (ctx) => {
    ctx.lineWidth = 5;
    ctx.strokeStyle = INK;
    ctx.fillStyle = "#8a8a9a";
    ctx.beginPath();
    ctx.moveTo(30, 30);
    ctx.lineTo(120, 30);
    ctx.lineTo(140, 168);
    ctx.lineTo(10, 168);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffd84a";
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(22 + i * 30, 168);
      ctx.lineTo(38 + i * 30, 168);
      ctx.lineTo(52 + i * 30, 120);
      ctx.lineTo(36 + i * 30, 120);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = "#5a5a6a";
    ctx.fillRect(18, 18, 114, 18);
    ctx.strokeRect(18, 18, 114, 18);
  });
  canvasTexture(scene, "button", 100, 50, (ctx) => {
    ctx.lineWidth = 5;
    ctx.strokeStyle = INK;
    ctx.beginPath();
    ctx.ellipse(50, 46, 44, 30, 0, Math.PI, 0);
    ctx.closePath();
    const g = ctx.createRadialGradient(38, 26, 4, 50, 40, 46);
    g.addColorStop(0, "#ff8a8a");
    g.addColorStop(1, "#c8102e");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.stroke();
  });
  // the hall: stone wall with a big arched window on the right
  canvasTexture(scene, "eye", 30, 18, (ctx) => {
    ellipse(ctx, 15, 9, 13, 7);
    ctx.fillStyle = "#ffe14a";
    ctx.shadowColor = "#ff5a2a";
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;
    ellipse(ctx, 19, 9, 3.5, 5.5);
    ctx.fillStyle = "#1a0a0a";
    ctx.fill();
  });
  canvasTexture(
    scene,
    "paper",
    FILM_W,
    FILM_H,
    (ctx) => {
      const g = ctx.createRadialGradient(
        FILM_W / 2,
        FILM_H / 2,
        200,
        FILM_W / 2,
        FILM_H / 2,
        1200,
      );
      g.addColorStop(0, "#fff6e0");
      g.addColorStop(1, "#e8d2a6");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, FILM_W, FILM_H);
    },
    1,
  );
  hallTexture(scene, "hall", 0, FILM_W);
}

/** The throne hall for a wide screen (film x from x0 to x1). */
export function makeWideHall(
  scene: Phaser.Scene,
  key: string,
  x0: number,
  x1: number,
) {
  hallTexture(scene, key, x0, x1);
}

/**
 * The throne hall (stone wall, vines, arched window, floor, red carpet) in film coordinates from x0
 * to x1: 0–1920 for the intro, wider for live scenes on wide phone screens.
 */
function hallTexture(scene: Phaser.Scene, key: string, x0: number, x1: number) {
  const H = FILM_H;
  canvasTexture(
    scene,
    key,
    x1 - x0,
    H,
    (ctx) => {
      ctx.translate(-x0, 0);
      ctx.fillStyle = "#4a4e6a";
      ctx.fillRect(x0, 0, x1 - x0, H);
      // stone blocks
      ctx.strokeStyle = "rgba(30,26,40,0.55)";
      ctx.lineWidth = 3;
      for (let row = 0; row < 14; row++) {
        const y = row * 70;
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
        ctx.stroke();
        for (
          let x = (row % 2) * 90 + Math.ceil((x0 - (row % 2) * 90) / 180) * 180;
          x < x1;
          x += 180
        ) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + 70);
          ctx.stroke();
        }
      }
      // vines
      ctx.strokeStyle = "#3f7a2e";
      ctx.lineWidth = 9;
      for (const x0 of [720, 1380]) {
        ctx.beginPath();
        ctx.moveTo(x0, 0);
        for (let y = 0; y < 560; y += 40)
          ctx.lineTo(x0 + Math.sin(y / 60) * 26, y);
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
      sky.addColorStop(0, "#1d1a4f");
      sky.addColorStop(1, "#5a4a8a");
      ctx.fillStyle = sky;
      ctx.fillRect(wx, wy, ww, wh);
      ctx.fillStyle = "#fff6c8";
      ellipse(ctx, wx + 200, wy + 120, 44, 44);
      ctx.fill();
      ctx.fillStyle = "#1d1a4f";
      ellipse(ctx, wx + 218, wy + 108, 40, 40);
      ctx.fill();
      ctx.fillStyle = "#fffbe0";
      for (let i = 0; i < 14; i++)
        ctx.fillRect(wx + ((i * 97) % ww), wy + ((i * 61) % 260) + 20, 4, 4);
      ctx.fillStyle = "#2a4a2a";
      for (let i = 0; i < 6; i++) {
        ellipse(ctx, wx + i * 60, wy + wh - 40, 70, 60);
        ctx.fill();
      }
      ctx.restore();
      ctx.lineWidth = 16;
      ctx.strokeStyle = "#2e2a3e";
      ctx.beginPath();
      ctx.moveTo(wx, wy + wh);
      ctx.lineTo(wx, wy + ww / 2);
      ctx.arc(wx + ww / 2, wy + ww / 2, ww / 2, Math.PI, 0);
      ctx.lineTo(wx + ww, wy + wh);
      ctx.stroke();
      ctx.fillStyle = "#7a7a8e";
      ctx.fillRect(wx - 30, wy + wh, ww + 60, 26);
      ctx.strokeRect(wx - 30, wy + wh, ww + 60, 26);
      // floor
      ctx.fillStyle = "#6a5e5a";
      ctx.fillRect(x0, FLOOR, x1 - x0, H - FLOOR);
      ctx.strokeStyle = "rgba(30,26,40,0.6)";
      ctx.lineWidth = 3;
      for (let x = Math.ceil(x0 / 160) * 160; x < x1; x += 160) {
        ctx.beginPath();
        ctx.moveTo(x, FLOOR);
        ctx.lineTo(x - 80, H);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(x0, FLOOR + 70);
      ctx.lineTo(x1, FLOOR + 70);
      ctx.stroke();
      ctx.lineWidth = 6;
      ctx.strokeStyle = INK;
      ctx.beginPath();
      ctx.moveTo(x0, FLOOR);
      ctx.lineTo(x1, FLOOR);
      ctx.stroke();
      // a red carpet up to the throne
      ctx.fillStyle = "#9a1f34";
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
}
