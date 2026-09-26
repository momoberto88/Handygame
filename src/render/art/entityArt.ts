import type Phaser from 'phaser';
import type { ItemKind } from '../../sim/types';
import { canvasTexture, ellipse, fillStroke, roundRect } from './canvas';

const O = '#241810';

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r1: number, r2: number, n = 5) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    const r = i % 2 ? r2 : r1;
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
}

export function drawSaw(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  const teeth = 12;
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const a2 = ((i + 0.6) / teeth) * Math.PI * 2;
    ctx.lineTo(cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78);
    ctx.lineTo(cx + Math.cos(a2) * r, cy + Math.sin(a2) * r);
  }
  ctx.closePath();
  fillStroke(ctx, '#cfd5de', O, 2.2);
  ellipse(ctx, cx, cy, r * 0.55, r * 0.55);
  ctx.fillStyle = '#9aa3b0';
  ctx.fill();
  ellipse(ctx, cx, cy, r * 0.2, r * 0.2);
  fillStroke(ctx, '#e0b84a', O, 1.8);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.42, -2.6, -1.4);
  ctx.stroke();
}

function drawMushroom(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  roundRect(ctx, x - 5 * s, y - 2 * s, 10 * s, 12 * s, 3 * s);
  fillStroke(ctx, '#f3dfbf', O, 2);
  ctx.beginPath();
  ctx.moveTo(x - 14 * s, y + 1 * s);
  ctx.bezierCurveTo(x - 14 * s, y - 16 * s, x + 14 * s, y - 16 * s, x + 14 * s, y + 1 * s);
  ctx.closePath();
  fillStroke(ctx, '#e0402f', O, 2.2);
  ctx.fillStyle = '#fff';
  for (const [dx, dy, r] of [
    [-6, -6, 3],
    [4, -9, 3.5],
    [9, -2, 2],
  ]) {
    ellipse(ctx, x + dx * s, y + dy * s, r * s, r * s * 0.8);
    ctx.fill();
  }
}

function drawBolt(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(x + 3 * s, y - 16 * s);
  ctx.lineTo(x - 8 * s, y + 2 * s);
  ctx.lineTo(x - 1 * s, y + 2 * s);
  ctx.lineTo(x - 4 * s, y + 16 * s);
  ctx.lineTo(x + 9 * s, y - 3 * s);
  ctx.lineTo(x + 2 * s, y - 3 * s);
  ctx.closePath();
  fillStroke(ctx, '#ffe14a', O, 2.2);
}

function drawShieldIcon(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - 15 * s);
  ctx.quadraticCurveTo(x + 13 * s, y - 11 * s, x + 13 * s, y - 9 * s);
  ctx.quadraticCurveTo(x + 13 * s, y + 8 * s, x, y + 15 * s);
  ctx.quadraticCurveTo(x - 13 * s, y + 8 * s, x - 13 * s, y - 9 * s);
  ctx.quadraticCurveTo(x - 13 * s, y - 11 * s, x, y - 15 * s);
  fillStroke(ctx, '#4aa3ff', O, 2.2);
  ctx.beginPath();
  ctx.moveTo(x, y - 10 * s);
  ctx.lineTo(x, y + 10 * s);
  ctx.moveTo(x - 8 * s, y - 3 * s);
  ctx.lineTo(x + 8 * s, y - 3 * s);
  ctx.strokeStyle = '#ffd84a';
  ctx.lineWidth = 3 * s;
  ctx.stroke();
}

function drawRocket(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(x + 16 * s, y);
  ctx.quadraticCurveTo(x + 8 * s, y - 7 * s, x - 10 * s, y - 6 * s);
  ctx.lineTo(x - 10 * s, y + 6 * s);
  ctx.quadraticCurveTo(x + 8 * s, y + 7 * s, x + 16 * s, y);
  fillStroke(ctx, '#e8e8f0', O, 2);
  ctx.beginPath();
  ctx.moveTo(x + 16 * s, y);
  ctx.quadraticCurveTo(x + 12 * s, y - 5 * s, x + 7 * s, y - 5.5 * s);
  ctx.lineTo(x + 7 * s, y + 5.5 * s);
  ctx.quadraticCurveTo(x + 12 * s, y + 5 * s, x + 16 * s, y);
  fillStroke(ctx, '#e0402f', O, 2);
  ctx.beginPath();
  ctx.moveTo(x - 8 * s, y - 6 * s);
  ctx.lineTo(x - 15 * s, y - 11 * s);
  ctx.lineTo(x - 13 * s, y - 4 * s);
  ctx.closePath();
  fillStroke(ctx, '#e0402f', O, 1.8);
  ctx.beginPath();
  ctx.moveTo(x - 8 * s, y + 6 * s);
  ctx.lineTo(x - 15 * s, y + 11 * s);
  ctx.lineTo(x - 13 * s, y + 4 * s);
  ctx.closePath();
  fillStroke(ctx, '#e0402f', O, 1.8);
  ellipse(ctx, x + 2 * s, y, 2.6 * s, 2.6 * s);
  fillStroke(ctx, '#7fd0ff', O, 1.4);
}

function drawTrap(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, closed: boolean) {
  ctx.strokeStyle = O;
  ctx.lineWidth = 2;
  ctx.fillStyle = '#8a8f99';
  roundRect(ctx, x - 13 * s, y - 3 * s, 26 * s, 5 * s, 2);
  ctx.fill();
  ctx.stroke();
  const jaw = (dir: number) => {
    ctx.beginPath();
    if (closed) {
      ctx.moveTo(x - 11 * s * dir, y - 2 * s);
      ctx.quadraticCurveTo(x - 6 * s * dir, y - 16 * s, x, y - 15 * s);
    } else {
      ctx.moveTo(x - 1 * s * dir, y - 2 * s);
      ctx.quadraticCurveTo(x - 10 * s * dir, y - 10 * s, x - 15 * s * dir, y - 3 * s);
    }
    ctx.strokeStyle = O;
    ctx.lineWidth = 4.5 * s;
    ctx.stroke();
    ctx.strokeStyle = '#c9ced8';
    ctx.lineWidth = 2.5 * s;
    ctx.stroke();
  };
  jaw(1);
  jaw(-1);
  ctx.fillStyle = '#c9ced8';
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    const tx = x + i * 4 * s;
    ctx.moveTo(tx - 1.5 * s, y - (closed ? 12 : 4) * s);
    ctx.lineTo(tx, y - (closed ? 8 : 9) * s);
    ctx.lineTo(tx + 1.5 * s, y - (closed ? 12 : 4) * s);
    ctx.fill();
  }
}

function drawInk(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - 15 * s);
  ctx.quadraticCurveTo(x + 12 * s, y + 2 * s, x + 9 * s, y + 8 * s);
  ctx.quadraticCurveTo(x, y + 18 * s, x - 9 * s, y + 8 * s);
  ctx.quadraticCurveTo(x - 12 * s, y + 2 * s, x, y - 15 * s);
  fillStroke(ctx, '#3b2b6e', O, 2.2);
  ellipse(ctx, x - 4 * s, y + 3 * s, 2.5 * s, 3.5 * s);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fill();
}

function drawMagnet(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath();
  ctx.arc(x, y - 2 * s, 11 * s, Math.PI, 0);
  ctx.lineWidth = 9 * s;
  ctx.strokeStyle = O;
  ctx.lineCap = 'butt';
  ctx.stroke();
  ctx.lineWidth = 6 * s;
  ctx.strokeStyle = '#e0402f';
  ctx.stroke();
  for (const dx of [-11, 11]) {
    roundRect(ctx, x + dx * s - 4.5 * s, y - 3 * s, 9 * s, 14 * s, 1.5);
    fillStroke(ctx, '#e0402f', O, 2);
    ctx.fillStyle = '#e8e8f0';
    ctx.fillRect(x + dx * s - 3.3 * s, y + 5 * s, 6.6 * s, 4.8 * s);
  }
  ctx.lineCap = 'round';
}

export function itemIconKey(kind: ItemKind): string {
  return `item-${kind}`;
}

export function makeEntityArt(scene: Phaser.Scene) {
  canvasTexture(scene, 'itembox', 42, 42, (ctx) => {
    const g = ctx.createRadialGradient(21, 21, 4, 21, 21, 22);
    g.addColorStop(0, '#b6ff7a');
    g.addColorStop(1, '#2fa33a');
    roundRect(ctx, 3, 3, 36, 36, 7);
    fillStroke(ctx, g, O, 2.6);
    ctx.strokeStyle = '#7a5230';
    ctx.lineWidth = 3;
    roundRect(ctx, 6, 6, 30, 30, 5);
    ctx.stroke();
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.strokeStyle = O;
    ctx.strokeText('?', 21, 23);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('?', 21, 23);
  });

  canvasTexture(scene, 'coin', 26, 26, (ctx) => {
    ellipse(ctx, 13, 13, 10.5, 10.5);
    fillStroke(ctx, '#ffcf3a', '#7a4a10', 2.4);
    ellipse(ctx, 13, 13, 6.5, 6.5);
    ctx.strokeStyle = '#e09a1a';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    star(ctx, 13, 13, 4.2, 1.9);
    ctx.fillStyle = '#fff3b0';
    ctx.fill();
  });

  canvasTexture(scene, 'saw', 50, 50, (ctx) => drawSaw(ctx, 25, 25, 23));
  canvasTexture(scene, 'saw-small', 40, 40, (ctx) => drawSaw(ctx, 20, 20, 18.5));

  canvasTexture(scene, 'crusher-head', 68, 40, (ctx) => {
    roundRect(ctx, 3, 2, 62, 28, 4);
    fillStroke(ctx, '#7c8594', O, 2.6);
    ctx.fillStyle = '#5b6371';
    ctx.fillRect(6, 22, 56, 7);
    ctx.fillStyle = '#c9ced8';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(6 + i * 9.5, 30);
      ctx.lineTo(10.75 + i * 9.5, 38);
      ctx.lineTo(15.5 + i * 9.5, 30);
      ctx.closePath();
      fillStroke(ctx, '#c9ced8', O, 1.6);
    }
    ctx.fillStyle = '#ffd84a';
    for (const x of [10, 58]) {
      ellipse(ctx, x, 9, 2.5, 2.5);
      ctx.fill();
    }
    // angry eyes
    ctx.fillStyle = O;
    ctx.beginPath();
    ctx.moveTo(22, 10);
    ctx.lineTo(31, 14);
    ctx.lineTo(22, 17);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(46, 10);
    ctx.lineTo(37, 14);
    ctx.lineTo(46, 17);
    ctx.fill();
  });
  canvasTexture(scene, 'crusher-rod', 14, 40, (ctx) => {
    ctx.fillStyle = '#5b6371';
    ctx.fillRect(3, 0, 8, 40);
    ctx.strokeStyle = O;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(3, 0);
    ctx.lineTo(3, 40);
    ctx.moveTo(11, 0);
    ctx.lineTo(11, 40);
    ctx.stroke();
    ctx.fillStyle = '#8a93a2';
    ctx.fillRect(5, 0, 2, 40);
  });

  canvasTexture(scene, 'pad-jump', 44, 22, (ctx) => drawMushroom(ctx, 22, 12, 1.4));
  canvasTexture(scene, 'pad-boost', 44, 10, (ctx) => {
    roundRect(ctx, 2, 2, 40, 7, 3);
    fillStroke(ctx, '#ffcf3a', O, 2);
    ctx.fillStyle = '#ff6a2a';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(8 + i * 11, 3);
      ctx.lineTo(14 + i * 11, 5.5);
      ctx.lineTo(8 + i * 11, 8);
      ctx.fill();
    }
  });

  canvasTexture(scene, 'trap-open', 34, 18, (ctx) => drawTrap(ctx, 17, 15, 1, false));
  canvasTexture(scene, 'trap-closed', 34, 22, (ctx) => drawTrap(ctx, 17, 19, 1, true));
  canvasTexture(scene, 'rocket', 36, 26, (ctx) => drawRocket(ctx, 19, 13, 1));

  canvasTexture(scene, 'shield-bubble', 74, 74, (ctx) => {
    const g = ctx.createRadialGradient(37, 37, 20, 37, 37, 36);
    g.addColorStop(0, 'rgba(120,200,255,0.05)');
    g.addColorStop(0.85, 'rgba(120,200,255,0.35)');
    g.addColorStop(1, 'rgba(200,240,255,0.8)');
    ellipse(ctx, 37, 37, 34, 34);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(37, 37, 27, -2.5, -1.7);
    ctx.stroke();
  });

  canvasTexture(scene, 'finish-strip', 20, 40, (ctx) => {
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 2; x++) {
        ctx.fillStyle = (x + y) % 2 ? '#1a1a1a' : '#ffffff';
        ctx.fillRect(x * 10, y * 10, 10, 10);
      }
    }
  });
  canvasTexture(scene, 'finish-banner', 160, 44, (ctx) => {
    roundRect(ctx, 3, 3, 154, 38, 8);
    fillStroke(ctx, '#e0402f', O, 3);
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText('ZIEL', 80, 23);
  });

  // particles
  canvasTexture(scene, 'p-dust', 16, 16, (ctx) => {
    const g = ctx.createRadialGradient(8, 8, 1, 8, 8, 8);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 16, 16);
  });
  canvasTexture(scene, 'p-star', 18, 18, (ctx) => {
    star(ctx, 9, 9, 8, 3.5);
    fillStroke(ctx, '#ffe14a', O, 1.5);
  });
  canvasTexture(scene, 'p-spark', 10, 10, (ctx) => {
    ctx.beginPath();
    ctx.moveTo(5, 0);
    ctx.lineTo(7, 5);
    ctx.lineTo(5, 10);
    ctx.lineTo(3, 5);
    ctx.closePath();
    ctx.fillStyle = '#fff6b0';
    ctx.fill();
  });
  canvasTexture(scene, 'p-smoke', 28, 28, (ctx) => {
    const g = ctx.createRadialGradient(14, 14, 2, 14, 14, 14);
    g.addColorStop(0, 'rgba(90,85,95,0.85)');
    g.addColorStop(1, 'rgba(90,85,95,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 28, 28);
  });
  canvasTexture(scene, 'p-confetti', 6, 10, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 6, 10);
  });
  canvasTexture(scene, 'ink-splat', 220, 180, (ctx) => {
    ctx.fillStyle = '#1d1440';
    ellipse(ctx, 110, 90, 80, 62);
    ctx.fill();
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const d = 70 + (i % 3) * 18;
      ellipse(ctx, 110 + Math.cos(a) * d, 90 + Math.sin(a) * d * 0.75, 10 + (i % 4) * 5, 8 + (i % 3) * 4);
      ctx.fill();
    }
    ellipse(ctx, 85, 70, 16, 9, -0.5);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fill();
  });

  // item icons (HUD + roulette)
  const icon = (kind: ItemKind, draw: (ctx: CanvasRenderingContext2D) => void) =>
    canvasTexture(scene, itemIconKey(kind), 44, 44, draw);
  icon('saw', (ctx) => drawSaw(ctx, 22, 22, 16));
  icon('trap', (ctx) => drawTrap(ctx, 22, 30, 1.2, false));
  icon('lightning', (ctx) => drawBolt(ctx, 22, 22, 1.2));
  icon('shield', (ctx) => drawShieldIcon(ctx, 22, 22, 1.1));
  icon('turbo', (ctx) => drawMushroom(ctx, 22, 25, 1.2));
  icon('rocket', (ctx) => drawRocket(ctx, 22, 22, 1.05));
  icon('ink', (ctx) => drawInk(ctx, 22, 22, 1.1));
  icon('magnet', (ctx) => drawMagnet(ctx, 22, 22, 1.1));

  // on-screen button glyphs
  canvasTexture(scene, 'ui-jump', 40, 40, (ctx) => {
    ctx.beginPath();
    ctx.moveTo(20, 6);
    ctx.lineTo(34, 22);
    ctx.lineTo(25, 22);
    ctx.lineTo(25, 34);
    ctx.lineTo(15, 34);
    ctx.lineTo(15, 22);
    ctx.lineTo(6, 22);
    ctx.closePath();
    fillStroke(ctx, '#ffffff', O, 2.5);
  });
  canvasTexture(scene, 'ui-slide', 40, 40, (ctx) => {
    ctx.beginPath();
    ctx.moveTo(20, 34);
    ctx.lineTo(34, 18);
    ctx.lineTo(25, 18);
    ctx.lineTo(25, 6);
    ctx.lineTo(15, 6);
    ctx.lineTo(15, 18);
    ctx.lineTo(6, 18);
    ctx.closePath();
    fillStroke(ctx, '#ffffff', O, 2.5);
  });
}
