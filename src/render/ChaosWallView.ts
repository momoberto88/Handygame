import Phaser from 'phaser';
import { LEVEL_BOTTOM } from '../sim/constants';
import type { WorldId } from '../sim/types';
import { canvasTexture, ellipse } from './art/canvas';
import { WORLDS } from './worlds';

const EDGE_W = 70;
const BODY_W = 900;

/** The storm that eats stragglers on the left side of the track. */
export class ChaosWallView {
  private body: Phaser.GameObjects.TileSprite;
  private edge: Phaser.GameObjects.TileSprite;
  private eyes: Phaser.GameObjects.Image[] = [];

  constructor(scene: Phaser.Scene, world: WorldId) {
    const w = WORLDS[world];
    canvasTexture(
      scene,
      `chaos-body-${world}`,
      128,
      256,
      (ctx) => {
        ctx.fillStyle = w.wall;
        ctx.fillRect(0, 0, 128, 256);
        for (let i = 0; i < 26; i++) {
          const x = (i * 53) % 128;
          const y = (i * 97) % 256;
          const r = 10 + (i % 5) * 7;
          ctx.fillStyle = i % 3 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.25)';
          for (const dy of [-256, 0, 256]) {
            ellipse(ctx, x, y + dy, r, r * 0.8);
            ctx.fill();
          }
        }
      },
      1,
    );
    canvasTexture(
      scene,
      `chaos-edge-${world}`,
      EDGE_W,
      256,
      (ctx) => {
        const g = ctx.createLinearGradient(0, 0, EDGE_W, 0);
        g.addColorStop(0, w.wall);
        g.addColorStop(0.55, w.wall);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        for (let y = 0; y <= 256; y += 16) {
          const bulge = 30 + Math.sin((y / 256) * Math.PI * 4) * 14 + ((y / 16) % 2) * 8;
          ctx.lineTo(bulge, y);
        }
        ctx.lineTo(0, 256);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = w.wallGlow;
        ctx.lineWidth = 4;
        ctx.shadowColor = w.wallGlow;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        for (let y = 0; y <= 256; y += 16) {
          const bulge = 30 + Math.sin((y / 256) * Math.PI * 4) * 14 + ((y / 16) % 2) * 8;
          if (y === 0) ctx.moveTo(bulge, y);
          else ctx.lineTo(bulge, y);
        }
        ctx.stroke();
      },
      1,
    );
    canvasTexture(scene, 'chaos-eye', 30, 18, (ctx) => {
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

    this.body = scene.add.tileSprite(0, 0, BODY_W, LEVEL_BOTTOM + 200, `chaos-body-${world}`).setOrigin(1, 0).setDepth(60);
    this.edge = scene.add.tileSprite(0, 0, EDGE_W, LEVEL_BOTTOM + 200, `chaos-edge-${world}`).setOrigin(0, 0).setDepth(60);
    for (let i = 0; i < 3; i++) {
      this.eyes.push(scene.add.image(0, 0, 'chaos-eye').setScale(0.5).setDepth(61));
    }
  }

  update(wallX: number, clock: number, viewLeft: number) {
    const visible = wallX > viewLeft - EDGE_W;
    this.body.setVisible(visible);
    this.edge.setVisible(visible);
    const wobble = Math.sin(clock * 3) * 6;
    this.body.x = wallX + wobble;
    this.edge.x = wallX + wobble;
    this.body.tilePositionY = -clock * 60;
    this.edge.tilePositionY = -clock * 110;
    this.eyes.forEach((eye, i) => {
      eye.setVisible(visible);
      const blink = Math.sin(clock * 1.3 + i * 2.1) > 0.93 ? 0.1 : 1;
      eye.setPosition(wallX - 70 - i * 130 + wobble, 140 + i * 150 + Math.sin(clock * 1.7 + i) * 20);
      eye.setScale(0.5, 0.5 * blink);
    });
  }
}
