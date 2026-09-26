import Phaser from 'phaser';
import type { WorldId } from '../sim/types';
import { BG_H, BG_W, makeBackground } from './art/worldArt';

const FACTORS = [0.08, 0.22, 0.45];

/**
 * Parallax layers. They live in their own camera-independent space: we position them each frame
 * from the main camera so they always fill the screen regardless of zoom.
 */
export class BackgroundView {
  private sky: Phaser.GameObjects.Image;
  private layers: Phaser.GameObjects.TileSprite[] = [];

  constructor(scene: Phaser.Scene, world: WorldId) {
    const keys = makeBackground(scene, world);
    this.sky = scene.add.image(0, 0, keys[0]).setOrigin(0, 0).setDepth(-10).setScrollFactor(0);
    keys.slice(1).forEach((key, i) => {
      this.layers.push(scene.add.tileSprite(0, 0, BG_W, BG_H, key).setOrigin(0, 0).setDepth(-9 + i).setScrollFactor(0));
    });
  }

  update(cam: Phaser.Cameras.Scene2D.Camera) {
    // With scroll factor 0 the objects are placed in screen space before the camera zoom is applied
    // around the camera centre, so we compensate for that here.
    const view = cam.worldView;
    const z = cam.zoom;
    const offX = cam.originX * cam.width * (1 - 1 / z);
    const offY = cam.originY * cam.height * (1 - 1 / z);
    const w = view.width;
    const h = view.height;
    this.sky.setPosition(offX, offY).setDisplaySize(w, h);
    this.layers.forEach((layer, i) => {
      layer.setPosition(offX, offY);
      if (Math.abs(layer.width - w) > 0.5) layer.setSize(w, BG_H);
      layer.setScale(1, h / BG_H);
      layer.tilePositionX = view.x * FACTORS[i];
      const drift = (view.y - 100) * FACTORS[i] * 0.4;
      layer.y = offY - drift * 0.2;
    });
  }
}
