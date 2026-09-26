import Phaser from 'phaser';

/** Placeholder art is drawn at this multiple of world size so it stays sharp on phone screens. */
export const ART_RES = 2;

export type Draw = (ctx: CanvasRenderingContext2D) => void;

export function canvasTexture(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  draw: Draw,
  res = ART_RES,
): string {
  if (scene.textures.exists(key)) return key;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * res);
  canvas.height = Math.ceil(h * res);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(res, res);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  draw(ctx);
  scene.textures.addCanvas(key, canvas);
  return key;
}

export function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export function fillStroke(ctx: CanvasRenderingContext2D, fill: string | CanvasGradient, stroke: string, width = 2.5) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.stroke();
}

export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
