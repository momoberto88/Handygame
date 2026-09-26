import type Phaser from 'phaser';
import { Rng } from '../../sim/rng';
import type { WorldId } from '../../sim/types';
import { WORLDS, type WorldTheme } from '../worlds';
import { ART_RES, canvasTexture, ellipse, fillStroke, shade } from './canvas';

// Tileset layout: 16 edge masks × 8 texture sections, then ramps (8 sections each), 2 plank halves, spikes.
export const TILE_SLOPE_UP = 128;
export const TILE_SLOPE_DOWN = 136;
export const TILE_PLATFORM = 144;
export const TILE_SPIKES = 146;
export const TILESET_COUNT = 147;
/** Exposure bits for solid tiles. */
export const EDGE_TOP = 1;
export const EDGE_RIGHT = 2;
export const EDGE_BOTTOM = 4;
export const EDGE_LEFT = 8;

const T = 40;

function groundFill(ctx: CanvasRenderingContext2D, w: WorldTheme, x: number, y: number, seed: number) {
  ctx.fillStyle = w.ground;
  ctx.fillRect(x, y, T, T);
  const rng = new Rng(seed);
  if (w.id === 'neon') {
    ctx.strokeStyle = w.groundDark;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 2, y + 2, T - 4, T - 4);
    ctx.fillStyle = w.groundSpeck;
    for (const [dx, dy] of [
      [6, 6],
      [T - 6, 6],
      [6, T - 6],
      [T - 6, T - 6],
    ]) {
      ellipse(ctx, x + dx, y + dy, 1.6, 1.6);
      ctx.fill();
    }
    return;
  }
  if (w.id === 'mine') {
    // stone bricks
    ctx.strokeStyle = w.groundDark;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y + T / 2);
    ctx.lineTo(x + T, y + T / 2);
    ctx.moveTo(x + T / 2, y);
    ctx.lineTo(x + T / 2, y + T / 2);
    ctx.moveTo(x + 8, y + T / 2);
    ctx.lineTo(x + 8, y + T);
    ctx.stroke();
  }
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i % 2 ? w.groundSpeck : w.groundDark;
    ellipse(ctx, x + 4 + rng.next() * (T - 8), y + 4 + rng.next() * (T - 8), 1.5 + rng.next() * 2.5, 1 + rng.next() * 1.8);
    ctx.fill();
  }
}

function topStrip(ctx: CanvasRenderingContext2D, w: WorldTheme, x: number, y: number, width: number) {
  if (w.id === 'neon') {
    ctx.fillStyle = w.groundTopDark;
    ctx.fillRect(x, y, width, 6);
    ctx.fillStyle = w.groundTop;
    ctx.fillRect(x, y, width, 3);
    return;
  }
  if (w.id === 'mine') {
    ctx.fillStyle = w.groundTop;
    ctx.fillRect(x, y, width, 9);
    ctx.strokeStyle = w.groundTopDark;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y + 9);
    ctx.lineTo(x + width, y + 9);
    ctx.moveTo(x + width * 0.55, y);
    ctx.lineTo(x + width * 0.55, y + 9);
    ctx.stroke();
    ctx.fillStyle = w.outline;
    ellipse(ctx, x + 5, y + 4.5, 1.3, 1.3);
    ctx.fill();
    return;
  }
  ctx.fillStyle = w.groundTopDark;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + width, y);
  ctx.lineTo(x + width, y + 10);
  for (let i = 4; i >= 0; i--) {
    const px = x + (width * i) / 4;
    ctx.quadraticCurveTo(px + width / 8, y + 15, px, y + 10);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = w.groundTop;
  ctx.fillRect(x, y, width, 7);
}

/** Painted (AI) textures for a world's ground, if they were loaded. */
interface PaintedTiles {
  fill: HTMLImageElement;
  top: HTMLImageElement;
  plank: HTMLImageElement;
  spikes: HTMLImageElement;
}

export const PAINTED_WORLDS: WorldId[] = ['jungle'];
const PAINTED_TILE_FILES = ['fill', 'top', 'plank', 'spikes', 'bg'] as const;

export function worldAssetKey(world: WorldId, file: string): string {
  return `wt-${world}-${file}`;
}

export function preloadWorldArt(scene: Phaser.Scene) {
  for (const w of PAINTED_WORLDS) {
    for (const f of PAINTED_TILE_FILES) {
      scene.load.image(worldAssetKey(w, f), `assets/worlds/${w}/${f}.${f === 'bg' ? 'jpg' : 'png'}`);
    }
  }
}

function paintedTiles(scene: Phaser.Scene, world: WorldId): PaintedTiles | null {
  const get = (f: string) => {
    const key = worldAssetKey(world, f);
    return scene.textures.exists(key) ? (scene.textures.get(key).getSourceImage() as HTMLImageElement) : null;
  };
  const fill = get('fill');
  const top = get('top');
  const plank = get('plank');
  const spikes = get('spikes');
  return fill && top && plank && spikes ? { fill, top, plank, spikes } : null;
}

function fillArea(ctx: CanvasRenderingContext2D, w: WorldTheme, p: PaintedTiles | null, x: number, vx: number, vy: number, seed: number) {
  if (!p) {
    groundFill(ctx, w, x, 0, seed);
    return;
  }
  // The fill texture covers a 2 × 2 block of tiles, so neighbouring tiles continue it seamlessly.
  const fw = p.fill.width / 2;
  const fh = p.fill.height / 2;
  ctx.drawImage(p.fill, (vx % 2) * fw, vy * fh, fw, fh, x, 0, T, T);
}

function topArea(ctx: CanvasRenderingContext2D, w: WorldTheme, p: PaintedTiles | null, x: number, y: number, width: number, vx: number) {
  if (!p) {
    topStrip(ctx, w, x, y, width);
    return;
  }
  // The grass strip spans four tiles.
  const seg = p.top.width / 4;
  const h = (T * 4 * p.top.height) / p.top.width;
  let dx = x;
  let remaining = width;
  let sx = (vx % 4) * seg;
  while (remaining > 0.01) {
    const take = Math.min(remaining, ((p.top.width - sx) / seg) * T);
    ctx.drawImage(p.top, sx, 0, (take / T) * seg, p.top.height, dx, y - 1, take, h);
    dx += take;
    remaining -= take;
    sx = 0;
  }
}

function drawSolid(ctx: CanvasRenderingContext2D, w: WorldTheme, p: PaintedTiles | null, x: number, mask: number, vx: number, vy: number) {
  fillArea(ctx, w, p, x, vx, vy, 17 + mask * 3 + vx);
  ctx.strokeStyle = w.outline;
  ctx.lineWidth = 3;
  if (mask & EDGE_BOTTOM) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x, T - 7, T, 7);
    ctx.beginPath();
    ctx.moveTo(x, T - 1.5);
    ctx.lineTo(x + T, T - 1.5);
    ctx.stroke();
  }
  if (mask & EDGE_RIGHT) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(x + T - 6, 0, 6, T);
    ctx.beginPath();
    ctx.moveTo(x + T - 1.5, 0);
    ctx.lineTo(x + T - 1.5, T);
    ctx.stroke();
  }
  if (mask & EDGE_LEFT) {
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x, 0, 6, T);
    ctx.beginPath();
    ctx.moveTo(x + 1.5, 0);
    ctx.lineTo(x + 1.5, T);
    ctx.stroke();
  }
  if (mask & EDGE_TOP) {
    topArea(ctx, w, p, x, 0, T, vx);
    if (!p) {
      ctx.beginPath();
      ctx.moveTo(x, 1.5);
      ctx.lineTo(x + T, 1.5);
      ctx.stroke();
    }
  }
}

function drawSlope(ctx: CanvasRenderingContext2D, w: WorldTheme, p: PaintedTiles | null, x: number, up: boolean, vx: number, vy: number) {
  ctx.save();
  ctx.beginPath();
  if (up) {
    ctx.moveTo(x, T);
    ctx.lineTo(x + T, 0);
    ctx.lineTo(x + T, T);
  } else {
    ctx.moveTo(x, 0);
    ctx.lineTo(x + T, T);
    ctx.lineTo(x, T);
  }
  ctx.closePath();
  ctx.clip();
  fillArea(ctx, w, p, x, vx, vy, up ? 91 : 92);
  // grass band along the ramp
  ctx.translate(x + T / 2, T / 2);
  ctx.rotate(up ? -Math.PI / 4 : Math.PI / 4);
  const len = T * 1.5;
  topArea(ctx, w, p, -len / 2, 0, len, vx);
  ctx.restore();
  if (!p) {
    ctx.strokeStyle = w.outline;
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (up) {
      ctx.moveTo(x, T);
      ctx.lineTo(x + T, 0);
    } else {
      ctx.moveTo(x, 0);
      ctx.lineTo(x + T, T);
    }
    ctx.stroke();
  }
}

function drawPlatform(ctx: CanvasRenderingContext2D, w: WorldTheme, p: PaintedTiles | null, x: number, vx: number) {
  if (p) {
    const half = p.plank.width / 2;
    const h = (T * 2 * p.plank.height) / p.plank.width;
    ctx.drawImage(p.plank, (vx % 2) * half, 0, half, p.plank.height, x, 0, T, h);
    return;
  }
  ctx.fillStyle = w.platform;
  ctx.strokeStyle = w.outline;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(x + 0.5, 1.5, T - 1, 12, 3);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = shade(w.platform, -0.3);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x + 6, 7);
  ctx.lineTo(x + 22, 7);
  ctx.moveTo(x + 26, 10);
  ctx.lineTo(x + 34, 10);
  ctx.stroke();
  // little bracket
  ctx.fillStyle = shade(w.platform, -0.35);
  ctx.beginPath();
  ctx.moveTo(x + 14, 13);
  ctx.lineTo(x + 26, 13);
  ctx.lineTo(x + 20, 20);
  ctx.closePath();
  ctx.fill();
}

function drawSpikes(ctx: CanvasRenderingContext2D, w: WorldTheme, p: PaintedTiles | null, x: number) {
  if (p) {
    const h = Math.min(T * 0.7, (T * p.spikes.height) / p.spikes.width);
    ctx.drawImage(p.spikes, x, T - h, T, h);
    return;
  }
  const metal = w.id === 'neon' ? '#ff4fb8' : '#c9ced8';
  for (let i = 0; i < 3; i++) {
    const bx = x + 2 + i * 12;
    ctx.beginPath();
    ctx.moveTo(bx, T);
    ctx.lineTo(bx + 6, T - 22);
    ctx.lineTo(bx + 12, T);
    ctx.closePath();
    fillStroke(ctx, metal, w.outline, 2.2);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.moveTo(bx + 5, T - 17);
    ctx.lineTo(bx + 6, T - 20);
    ctx.lineTo(bx + 7.5, T - 6);
    ctx.closePath();
    ctx.fill();
  }
}

export function tilesetKey(world: WorldId): string {
  return `tiles-${world}`;
}

/** Pixels of extruded border around each tile in the tileset (avoids seams when filtering). */
export const TILE_PAD = 2;
export const TILESET_COLS = 12;

/** Tile index of a solid tile with the given exposed edges; vx 0..3 and vy 0..1 pick the texture section. */
export function solidIndex(mask: number, vx: number, vy: number): number {
  return mask * 8 + vy * 4 + vx;
}

export function slopeIndex(up: boolean, vx: number, vy: number): number {
  return (up ? TILE_SLOPE_UP : TILE_SLOPE_DOWN) + vy * 4 + vx;
}

export function makeTileset(scene: Phaser.Scene, world: WorldId): string {
  const w = WORLDS[world];
  const key = tilesetKey(world);
  if (scene.textures.exists(key)) return key;
  const painted = paintedTiles(scene, world);
  const size = T * ART_RES;
  const cell = size + TILE_PAD * 2;
  const tile = document.createElement('canvas');
  tile.width = size;
  tile.height = size;
  const tctx = tile.getContext('2d')!;
  const sheet = document.createElement('canvas');
  sheet.width = cell * TILESET_COLS;
  sheet.height = cell * Math.ceil(TILESET_COUNT / TILESET_COLS);
  const sctx = sheet.getContext('2d')!;
  for (let i = 0; i < TILESET_COUNT; i++) {
    tctx.setTransform(1, 0, 0, 1, 0, 0);
    tctx.clearRect(0, 0, size, size);
    tctx.setTransform(ART_RES, 0, 0, ART_RES, 0, 0);
    tctx.lineJoin = 'round';
    tctx.lineCap = 'round';
    if (i < TILE_SLOPE_UP) {
      const mask = Math.floor(i / 8);
      drawSolid(tctx, w, painted, 0, mask, i % 4, Math.floor(i / 4) % 2);
    } else if (i < TILE_SLOPE_DOWN) {
      const k = i - TILE_SLOPE_UP;
      drawSlope(tctx, w, painted, 0, true, k % 4, Math.floor(k / 4));
    } else if (i < TILE_PLATFORM) {
      const k = i - TILE_SLOPE_DOWN;
      drawSlope(tctx, w, painted, 0, false, k % 4, Math.floor(k / 4));
    } else if (i < TILE_SPIKES) {
      drawPlatform(tctx, w, painted, 0, i - TILE_PLATFORM);
    } else {
      drawSpikes(tctx, w, painted, 0);
    }
    const x = (i % TILESET_COLS) * cell + TILE_PAD;
    const y = Math.floor(i / TILESET_COLS) * cell + TILE_PAD;
    // extrude edges
    sctx.drawImage(tile, 0, 0, 1, size, x - TILE_PAD, y, TILE_PAD, size);
    sctx.drawImage(tile, size - 1, 0, 1, size, x + size, y, TILE_PAD, size);
    sctx.drawImage(tile, 0, 0, size, 1, x, y - TILE_PAD, size, TILE_PAD);
    sctx.drawImage(tile, 0, size - 1, size, 1, x, y + size, size, TILE_PAD);
    sctx.drawImage(tile, x, y);
  }
  scene.textures.addCanvas(key, sheet);
  // Named frames so single tiles can be used outside of tilemaps (menus, previews).
  const tex = scene.textures.get(key);
  for (let i = 0; i < TILESET_COUNT; i++) {
    tex.add(`t${i}`, 0, (i % TILESET_COLS) * cell + TILE_PAD, Math.floor(i / TILESET_COLS) * cell + TILE_PAD, size, size);
  }
  // A 4 × 2 tile ground block for menus.
  const strip = document.createElement('canvas');
  strip.width = size * 4;
  strip.height = size * 2;
  const g = strip.getContext('2d')!;
  for (let vx = 0; vx < 4; vx++) {
    for (let vy = 0; vy < 2; vy++) {
      const idx = solidIndex(vy === 0 ? EDGE_TOP : 0, vx, vy);
      g.drawImage(sheet, (idx % TILESET_COLS) * cell + TILE_PAD, Math.floor(idx / TILESET_COLS) * cell + TILE_PAD, size, size, vx * size, vy * size, size, size);
    }
  }
  scene.textures.addCanvas(`ground-${world}`, strip);
  return key;
}

// ---------------------------------------------------------------------------------------------
// Parallax backgrounds (drawn at 1x, they are soft anyway)

export const BG_W = 1024;
export const BG_H = 540;

function wrapDraw(x: number, width: number, draw: (x: number) => void) {
  draw(x);
  if (x + width > BG_W) draw(x - BG_W);
  if (x - width < 0) draw(x + BG_W);
}

function bgSky(scene: Phaser.Scene, w: WorldTheme) {
  return canvasTexture(
    scene,
    `bg-${w.id}-sky`,
    16,
    BG_H,
    (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 0, BG_H);
      g.addColorStop(0, w.skyTop);
      g.addColorStop(1, w.skyBottom);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 16, BG_H);
    },
    1,
  );
}

function layer(scene: Phaser.Scene, w: WorldTheme, n: number, draw: (ctx: CanvasRenderingContext2D, rng: Rng) => void) {
  return canvasTexture(scene, `bg-${w.id}-${n}`, BG_W, BG_H, (ctx) => draw(ctx, new Rng(n * 97 + w.id.length)), 1);
}

export function makeBackground(scene: Phaser.Scene, world: WorldId): string[] {
  const w = WORLDS[world];
  const keys = [bgSky(scene, w)];
  switch (world) {
    case 'jungle':
      keys.push(
        layer(scene, w, 0, (ctx, rng) => {
          ctx.fillStyle = w.far;
          ctx.beginPath();
          ctx.moveTo(0, BG_H);
          for (let x = 0; x <= BG_W; x += 64) ctx.lineTo(x, 250 + Math.sin(x * 0.012) * 50 + rng.next() * 30);
          ctx.lineTo(BG_W, 250 + Math.sin(BG_W * 0.012) * 50);
          ctx.lineTo(BG_W, BG_H);
          ctx.fill();
          for (let i = 0; i < 4; i++) {
            const x = 60 + i * 260 + rng.next() * 60;
            wrapDraw(x, 80, (px) => {
              ctx.fillStyle = shade(w.far, -0.12);
              ctx.fillRect(px - 10, 200, 20, 340);
              ellipse(ctx, px, 190, 70, 50);
              ctx.fill();
            });
          }
        }),
        layer(scene, w, 1, (ctx, rng) => {
          for (let i = 0; i < 3; i++) {
            const x = 120 + i * 340 + rng.next() * 80;
            wrapDraw(x, 60, (px) => {
              // temple statue silhouette
              ctx.fillStyle = w.mid;
              ctx.fillRect(px - 40, 330, 80, 210);
              ctx.fillRect(px - 30, 270, 60, 70);
              ctx.fillStyle = shade(w.mid, -0.2);
              ctx.fillRect(px - 18, 290, 10, 8);
              ctx.fillRect(px + 8, 290, 10, 8);
              ctx.fillRect(px - 12, 312, 24, 5);
            });
          }
          ctx.strokeStyle = shade(w.mid, -0.1);
          ctx.lineWidth = 5;
          for (let i = 0; i < 7; i++) {
            const x = rng.next() * BG_W;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.quadraticCurveTo(x + 30, 80, x - 10, 120 + rng.next() * 120);
            ctx.stroke();
          }
        }),
        layer(scene, w, 2, (ctx, rng) => {
          ctx.fillStyle = w.near;
          for (let x = -40; x < BG_W + 40; x += 70) {
            ellipse(ctx, x + rng.next() * 30, 500 + rng.next() * 20, 60, 45);
            ctx.fill();
          }
        }),
      );
      break;
    case 'mine':
      keys.push(
        layer(scene, w, 0, (ctx, rng) => {
          ctx.fillStyle = w.far;
          for (let i = 0; i < 5; i++) {
            const x = rng.next() * BG_W;
            const r = 50 + rng.next() * 60;
            const y = 120 + rng.next() * 250;
            wrapDraw(x, r + 12, (px) => gear(ctx, px, y, r, w.far));
          }
        }),
        layer(scene, w, 1, (ctx, rng) => {
          ctx.fillStyle = w.mid;
          for (let i = 0; i < 5; i++) {
            const x = i * 210 + rng.next() * 40;
            wrapDraw(x, 20, (px) => {
              ctx.fillRect(px - 9, 0, 18, BG_H);
              ctx.fillRect(px - 60, 180 + (i % 2) * 90, 120, 12);
            });
          }
          ctx.strokeStyle = shade(w.mid, 0.15);
          ctx.lineWidth = 12;
          ctx.beginPath();
          ctx.moveTo(0, 420);
          ctx.lineTo(BG_W, 420);
          ctx.stroke();
        }),
        layer(scene, w, 2, (ctx, rng) => {
          ctx.fillStyle = w.near;
          for (let x = -30; x < BG_W + 30; x += 55) {
            ctx.beginPath();
            ctx.moveTo(x - 40, BG_H);
            ctx.lineTo(x, 440 + rng.next() * 50);
            ctx.lineTo(x + 45, BG_H);
            ctx.fill();
          }
          // lamps
          for (let i = 0; i < 3; i++) {
            const x = 150 + i * 340;
            const g = ctx.createRadialGradient(x, 120, 2, x, 120, 70);
            g.addColorStop(0, 'rgba(255,200,120,0.7)');
            g.addColorStop(1, 'rgba(255,200,120,0)');
            ctx.fillStyle = g;
            ctx.fillRect(x - 70, 50, 140, 140);
          }
        }),
      );
      break;
    case 'sky':
      keys.push(
        layer(scene, w, 0, (ctx, rng) => {
          ctx.fillStyle = w.far;
          for (let i = 0; i < 8; i++) {
            const x = rng.next() * BG_W;
            const y = 80 + rng.next() * 300;
            wrapDraw(x, 120, (px) => cloud(ctx, px, y, 60 + rng.next() * 50, 'rgba(255,255,255,0.8)'));
          }
        }),
        layer(scene, w, 1, (ctx, rng) => {
          for (let i = 0; i < 3; i++) {
            const x = 150 + i * 330 + rng.next() * 60;
            const y = 220 + rng.next() * 140;
            wrapDraw(x, 110, (px) => {
              ctx.fillStyle = '#9a7650';
              ctx.beginPath();
              ctx.moveTo(px - 90, y);
              ctx.lineTo(px + 90, y);
              ctx.lineTo(px + 20, y + 110);
              ctx.lineTo(px - 30, y + 80);
              ctx.closePath();
              ctx.fill();
              ctx.fillStyle = w.mid;
              ellipse(ctx, px, y, 95, 16);
              ctx.fill();
            });
          }
        }),
        layer(scene, w, 2, (ctx, rng) => {
          for (let x = -60; x < BG_W + 60; x += 120) cloud(ctx, x + rng.next() * 40, 520, 90, 'rgba(255,255,255,0.95)');
        }),
      );
      break;
    case 'neon':
      keys.push(
        layer(scene, w, 0, (ctx, rng) => {
          for (let x = 0; x < BG_W; x += 44) {
            const h = 140 + rng.next() * 240;
            ctx.fillStyle = w.far;
            ctx.fillRect(x, BG_H - h, 40, h);
            ctx.fillStyle = 'rgba(255,220,120,0.35)';
            for (let y = BG_H - h + 10; y < BG_H; y += 16) {
              for (let wx = x + 6; wx < x + 36; wx += 10) if (rng.next() < 0.35) ctx.fillRect(wx, y, 5, 7);
            }
          }
        }),
        layer(scene, w, 1, (ctx, rng) => {
          for (let i = 0; i < 6; i++) {
            const x = i * 175 + rng.next() * 30;
            const h = 220 + rng.next() * 160;
            ctx.fillStyle = w.mid;
            ctx.fillRect(x, BG_H - h, 110, h);
            const col = rng.pick(['#ff3fa6', '#35e0ff', '#ffd23f', '#9b5cff']);
            ctx.strokeStyle = col;
            ctx.shadowColor = col;
            ctx.shadowBlur = 14;
            ctx.lineWidth = 4;
            ctx.strokeRect(x + 18, BG_H - h + 30, 74, 36);
            ctx.shadowBlur = 0;
          }
        }),
        layer(scene, w, 2, (ctx) => {
          ctx.fillStyle = w.near;
          ctx.fillRect(0, 470, BG_W, 70);
          ctx.strokeStyle = '#35e0ff';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(0, 470);
          ctx.lineTo(BG_W, 470);
          ctx.stroke();
          for (let x = 20; x < BG_W; x += 90) ctx.fillRect(x, 470, 10, 70);
        }),
      );
      break;
  }
  return keys;
}

function gear(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  const teeth = Math.round(r / 7);
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i / (teeth * 2)) * Math.PI * 2;
    const rr = i % 2 ? r : r + 12;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = shade(color, -0.25);
  ellipse(ctx, x, y, r * 0.35, r * 0.35);
  ctx.fill();
}

function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  ctx.fillStyle = color;
  for (const [dx, dy, r] of [
    [0, 0, 0.5],
    [0.45, 0.1, 0.38],
    [-0.45, 0.12, 0.35],
    [0.2, -0.25, 0.35],
  ]) {
    ellipse(ctx, x + dx * s, y + dy * s, r * s, r * s * 0.8);
    ctx.fill();
  }
}

export { ART_RES };
