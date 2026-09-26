import type Phaser from 'phaser';
import type { CharacterDef } from '../../meta/characters';
import { canvasTexture, ellipse, fillStroke, roundRect, shade } from './canvas';

export type Expression = 'normal' | 'strain' | 'scared' | 'dead' | 'happy' | 'blink';

/** Where the eyes overlay and the hat anchor sit relative to the head centre, per head style. */
export interface HeadLayout {
  w: number;
  h: number;
  eyeX: number;
  eyeY: number;
  hatX: number;
  hatY: number;
}

export function headLayout(c: CharacterDef): HeadLayout {
  switch (c.head) {
    case 'cap':
      return { w: 46, h: 40, eyeX: 7, eyeY: 8, hatX: 0, hatY: -14 };
    case 'gnome':
      return { w: 40, h: 56, eyeX: 7, eyeY: 6, hatX: 0, hatY: -8 };
    case 'mask':
      return { w: 38, h: 40, eyeX: 6, eyeY: -2, hatX: 0, hatY: -18 };
    case 'wide':
      return { w: 42, h: 32, eyeX: 4, eyeY: -12, hatX: 0, hatY: -16 };
    default:
      return { w: 36, h: 34, eyeX: 6, eyeY: -2, hatX: 0, hatY: -15 };
  }
}

export function partKey(c: CharacterDef, part: string): string {
  return `ch-${c.id}-${part}`;
}

/** Generates the placeholder body parts for one character (Rayman style: floating hands and feet). */
export function makeCharacterArt(scene: Phaser.Scene, c: CharacterDef) {
  const o = c.colors.outline;
  const lw = 2.4;

  canvasTexture(scene, partKey(c, 'body'), 30, 32, (ctx) => {
    ellipse(ctx, 15, 16, 12.5, 14);
    fillStroke(ctx, c.head === 'gnome' || c.ears === 'ponytail' ? c.colors.belly : c.colors.fur, o, lw);
    if (c.head === 'gnome') {
      ctx.fillStyle = '#5a3a22';
      ctx.fillRect(3.5, 19, 23, 4);
      ctx.fillStyle = '#e8c547';
      ctx.fillRect(13, 18.5, 5, 5);
    } else if (c.ears === 'ponytail') {
      ctx.strokeStyle = '#3a2412';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(6, 6);
      ctx.lineTo(24, 26);
      ctx.stroke();
    } else {
      ellipse(ctx, 18, 19, 7, 9);
      ctx.fillStyle = c.colors.belly;
      ctx.fill();
    }
    ellipse(ctx, 11, 9, 5, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fill();
  });

  const hl = headLayout(c);
  canvasTexture(scene, partKey(c, 'head'), hl.w, hl.h, (ctx) => {
    const cx = hl.w / 2;
    const cy = hl.h / 2;
    switch (c.head) {
      case 'cap': {
        ellipse(ctx, cx + 1, cy + 7, 13, 12);
        fillStroke(ctx, c.colors.fur, o, lw);
        ctx.beginPath();
        ctx.moveTo(3, cy + 2);
        ctx.bezierCurveTo(2, -4, hl.w - 2, -4, hl.w - 3, cy + 2);
        ctx.quadraticCurveTo(cx, cy + 7, 3, cy + 2);
        fillStroke(ctx, c.colors.accent, o, lw);
        ctx.fillStyle = '#fff6ea';
        for (const [x, y, r] of [
          [cx - 9, 8, 4],
          [cx + 5, 5, 5],
          [cx + 13, 13, 3],
          [cx - 2, 15, 3],
        ]) {
          ellipse(ctx, x, y, r, r * 0.8);
          ctx.fill();
        }
        break;
      }
      case 'gnome': {
        ellipse(ctx, cx, cy + 12, 13, 12);
        fillStroke(ctx, c.colors.fur, o, lw);
        // beard
        ctx.beginPath();
        ctx.moveTo(cx - 12, cy + 12);
        ctx.quadraticCurveTo(cx - 6, hl.h + 2, cx + 4, hl.h - 1);
        ctx.quadraticCurveTo(cx + 14, cy + 20, cx + 13, cy + 12);
        ctx.quadraticCurveTo(cx, cy + 18, cx - 12, cy + 12);
        fillStroke(ctx, '#f4f1ea', o, lw);
        // nose
        ellipse(ctx, cx + 11, cy + 13, 4, 3.5);
        fillStroke(ctx, '#f09a8a', o, 1.6);
        // hat
        ctx.beginPath();
        ctx.moveTo(cx - 15, cy + 5);
        ctx.quadraticCurveTo(cx - 6, 4, cx - 10, 1);
        ctx.quadraticCurveTo(cx + 4, 2, cx + 15, cy + 5);
        ctx.closePath();
        fillStroke(ctx, c.colors.accent, o, lw);
        break;
      }
      case 'mask': {
        ellipse(ctx, cx, cy + 2, 15, 17);
        fillStroke(ctx, '#b0773c', o, lw);
        ctx.strokeStyle = c.colors.accent;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(cx - 10, cy + 10);
        ctx.lineTo(cx + 10, cy + 10);
        ctx.moveTo(cx - 8, cy - 10);
        ctx.lineTo(cx + 8, cy - 10);
        ctx.stroke();
        ctx.fillStyle = '#e8d8b0';
        roundRect(ctx, cx - 6, cy + 5, 12, 4, 1);
        ctx.fill();
        break;
      }
      case 'wide': {
        ellipse(ctx, cx - 7, 9, 7, 7);
        fillStroke(ctx, c.colors.fur, o, lw);
        ellipse(ctx, cx + 7, 9, 7, 7);
        fillStroke(ctx, c.colors.fur, o, lw);
        ellipse(ctx, cx, cy + 4, 19, 11);
        fillStroke(ctx, c.colors.fur, o, lw);
        ctx.strokeStyle = o;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(cx + 5, cy + 3, 9, 0.2, 1.2);
        ctx.stroke();
        ellipse(ctx, cx + 3, cy + 9, 4, 2);
        ctx.fillStyle = c.colors.accent;
        ctx.fill();
        break;
      }
      default: {
        ellipse(ctx, cx, cy, 15, 14);
        fillStroke(ctx, c.colors.fur, o, lw);
        if (c.ears === 'ponytail') {
          // hair cap
          ctx.beginPath();
          ctx.arc(cx, cy, 15, Math.PI * 1.05, Math.PI * 1.95);
          ctx.quadraticCurveTo(cx + 4, cy - 6, cx - 14, cy + 2);
          ctx.closePath();
          fillStroke(ctx, '#5a2e1a', o, lw);
        } else {
          // muzzle
          ellipse(ctx, cx + 8, cy + 5, 8, 6);
          ctx.fillStyle = c.colors.belly;
          ctx.fill();
          ellipse(ctx, cx + 14, cy + 2, 3, 2.5);
          ctx.fillStyle = c.id === 'waschbaer' || c.id === 'fuchs' ? '#1b1b1b' : c.colors.accent;
          ctx.fill();
          if (c.id === 'waschbaer') {
            ellipse(ctx, cx + 5, cy - 2, 9, 4.5, -0.1);
            ctx.fillStyle = '#2c2c36';
            ctx.fill();
          }
        }
        ellipse(ctx, cx - 4, cy - 7, 5, 3);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fill();
      }
    }
  });

  canvasTexture(scene, partKey(c, 'hand'), 13, 13, (ctx) => {
    ellipse(ctx, 6.5, 6.5, 5, 5);
    fillStroke(ctx, c.colors.hands, o, 2);
  });

  canvasTexture(scene, partKey(c, 'foot'), 20, 13, (ctx) => {
    ctx.beginPath();
    ctx.moveTo(3, 10);
    ctx.quadraticCurveTo(2, 2, 9, 2.5);
    ctx.quadraticCurveTo(18, 3, 18, 10);
    ctx.closePath();
    fillStroke(ctx, c.colors.feet, o, 2);
  });

  switch (c.ears) {
    case 'long':
      canvasTexture(scene, partKey(c, 'ear'), 14, 30, (ctx) => {
        ellipse(ctx, 7, 15, 5.5, 13.5);
        fillStroke(ctx, c.colors.fur, o, lw);
        ellipse(ctx, 7, 15, 2.5, 9);
        ctx.fillStyle = c.colors.accent;
        ctx.fill();
      });
      break;
    case 'pointy':
      canvasTexture(scene, partKey(c, 'ear'), 16, 18, (ctx) => {
        ctx.beginPath();
        ctx.moveTo(2, 16);
        ctx.lineTo(8, 2);
        ctx.lineTo(14, 16);
        ctx.closePath();
        fillStroke(ctx, c.colors.fur, o, lw);
        ctx.beginPath();
        ctx.moveTo(6, 7);
        ctx.lineTo(8, 2.5);
        ctx.lineTo(10, 7);
        ctx.closePath();
        ctx.fillStyle = c.colors.accent;
        ctx.fill();
      });
      break;
    case 'round':
      canvasTexture(scene, partKey(c, 'ear'), 14, 14, (ctx) => {
        ellipse(ctx, 7, 7, 5.5, 5.5);
        fillStroke(ctx, c.colors.fur, o, lw);
        ellipse(ctx, 7, 7.5, 2.5, 2.5);
        ctx.fillStyle = c.colors.accent;
        ctx.fill();
      });
      break;
    case 'feathers':
      canvasTexture(scene, partKey(c, 'ear'), 24, 28, (ctx) => {
        const cols = ['#e04a3a', '#f2c230', '#2fb7c4'];
        [-0.45, 0, 0.45].forEach((a, i) => {
          ctx.save();
          ctx.translate(12, 27);
          ctx.rotate(a);
          ellipse(ctx, 0, -13, 4, 12);
          fillStroke(ctx, cols[i], o, 1.8);
          ctx.restore();
        });
      });
      break;
    case 'ponytail':
      canvasTexture(scene, partKey(c, 'ear'), 18, 26, (ctx) => {
        ctx.beginPath();
        ctx.moveTo(9, 2);
        ctx.quadraticCurveTo(17, 10, 11, 24);
        ctx.quadraticCurveTo(2, 14, 9, 2);
        fillStroke(ctx, '#5a2e1a', o, lw);
      });
      break;
    default:
      break;
  }

  switch (c.tail) {
    case 'puff':
      canvasTexture(scene, partKey(c, 'tail'), 14, 14, (ctx) => {
        ellipse(ctx, 7, 7, 5.5, 5.5);
        fillStroke(ctx, '#fff6ea', o, 2);
      });
      break;
    case 'bushy':
      canvasTexture(scene, partKey(c, 'tail'), 30, 18, (ctx) => {
        ctx.beginPath();
        ctx.moveTo(28, 9);
        ctx.quadraticCurveTo(18, -2, 3, 5);
        ctx.quadraticCurveTo(8, 17, 28, 11);
        fillStroke(ctx, c.colors.fur, o, lw);
        ctx.beginPath();
        ctx.moveTo(9, 3.5);
        ctx.quadraticCurveTo(2, 5, 4.5, 8);
        ctx.quadraticCurveTo(6, 12, 10, 12);
        ctx.fillStyle = '#fff6ea';
        ctx.fill();
      });
      break;
    case 'ringed':
      canvasTexture(scene, partKey(c, 'tail'), 30, 14, (ctx) => {
        ellipse(ctx, 15, 7, 13, 5);
        fillStroke(ctx, c.colors.fur, o, lw);
        ctx.fillStyle = '#2c2c36';
        for (const x of [6, 13, 20]) ctx.fillRect(x, 2.5, 3, 9);
      });
      break;
    default:
      break;
  }
}

/** Shared eye overlays. They look to the right (running direction). */
export function makeEyes(scene: Phaser.Scene) {
  const o = '#1a1210';
  const eye = (ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, px: number, pr: number) => {
    ellipse(ctx, x, y, rx, ry);
    fillStroke(ctx, '#ffffff', o, 1.5);
    ellipse(ctx, x + px, y, pr, pr * 1.15);
    ctx.fillStyle = o;
    ctx.fill();
    ellipse(ctx, x + px + 0.8, y - 1, pr * 0.35, pr * 0.35);
    ctx.fillStyle = '#fff';
    ctx.fill();
  };
  canvasTexture(scene, 'eyes-normal', 22, 16, (ctx) => {
    eye(ctx, 7, 8, 4, 5, 1.2, 2.2);
    eye(ctx, 15, 8, 4, 5, 1.2, 2.2);
  });
  canvasTexture(scene, 'eyes-scared', 22, 16, (ctx) => {
    eye(ctx, 7, 8, 5, 6.5, 0.5, 1.3);
    eye(ctx, 16, 8, 5, 6.5, 0.5, 1.3);
  });
  const lines = (key: string, draw: (ctx: CanvasRenderingContext2D) => void) =>
    canvasTexture(scene, key, 22, 16, (ctx) => {
      ctx.strokeStyle = o;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      draw(ctx);
      ctx.stroke();
    });
  lines('eyes-strain', (ctx) => {
    ctx.moveTo(4, 5);
    ctx.lineTo(9, 8);
    ctx.lineTo(4, 11);
    ctx.moveTo(18, 5);
    ctx.lineTo(13, 8);
    ctx.lineTo(18, 11);
  });
  lines('eyes-dead', (ctx) => {
    for (const x of [7, 16]) {
      ctx.moveTo(x - 3, 5);
      ctx.lineTo(x + 3, 11);
      ctx.moveTo(x + 3, 5);
      ctx.lineTo(x - 3, 11);
    }
  });
  lines('eyes-happy', (ctx) => {
    ctx.arc(7, 10, 3.5, Math.PI * 1.1, Math.PI * 1.9);
    ctx.moveTo(19.5, 10);
    ctx.arc(16, 10, 3.5, Math.PI * 1.1, Math.PI * 1.9);
  });
  lines('eyes-blink', (ctx) => {
    ctx.moveTo(4, 9);
    ctx.lineTo(10, 9);
    ctx.moveTo(13, 9);
    ctx.lineTo(19, 9);
  });
}

export function darkerTint(): number {
  return 0xb8b0b0;
}

export { shade };
