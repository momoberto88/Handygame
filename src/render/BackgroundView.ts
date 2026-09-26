import Phaser from 'phaser';
import type { WorldId } from '../sim/types';
import { BG_H, BG_W, makeBackground, worldAssetKey } from './art/worldArt';

const FACTORS = [0.08, 0.22, 0.45];
const PAINTED_FACTOR = 0.12;

/**
 * Parallax layers. They use scroll factor 0 and are placed from the main camera every frame so
 * they always fill the screen regardless of zoom. Worlds with a painted backdrop use that image
 * as one slowly scrolling layer; others use the procedural layers.
 */
export class BackgroundView {
  private sky: Phaser.GameObjects.Image | null = null;
  private layers: Phaser.GameObjects.TileSprite[] = [];
  private painted: Phaser.GameObjects.TileSprite | null = null;
  private paintedH = 1;

  constructor(scene: Phaser.Scene, world: WorldId) {
    const paintedKey = worldAssetKey(world, 'bg');
    if (scene.textures.exists(paintedKey)) {
      const frame = scene.textures.getFrame(paintedKey);
      this.paintedH = frame.height;
      this.painted = scene.add.tileSprite(0, 0, frame.width, frame.height, paintedKey).setOrigin(0, 0).setDepth(-10).setScrollFactor(0);
      return;
    }
    const keys = makeBackground(scene, world);
    this.sky = scene.add.image(0, 0, keys[0]).setOrigin(0, 0).setDepth(-10).setScrollFactor(0);
    keys.slice(1).forEach((key, i) => {
      this.layers.push(scene.add.tileSprite(0, 0, BG_W, BG_H, key).setOrigin(0, 0).setDepth(-9 + i).setScrollFactor(0));
    });
  }

  update(cam: Phaser.Cameras.Scene2D.Camera) {
    // With scroll factor 0 the objects are placed in screen space before the camera zoom is applied
    // around the camera origin, so we compensate for that here.
    const view = cam.worldView;
    const z = cam.zoom;
    const offX = cam.originX * cam.width * (1 - 1 / z);
    const offY = cam.originY * cam.height * (1 - 1 / z);
    // a little bleed on every side so rounding at any zoom never shows an uncovered strip
    const bleed = view.width * 0.04;
    const w = view.width + bleed * 2;
    const h = view.height + bleed * 2;
    const x0 = offX - bleed;
    const y0 = offY - bleed;
    if (this.painted) {
      // Slightly taller than the view so a little vertical parallax is possible.
      const scale = (h * 1.12) / this.paintedH;
      const drift = Phaser.Math.Clamp((view.y - 100) * 0.05, -h * 0.06, h * 0.06);
      const width = w / scale + 2;
      if (Math.abs(this.painted.width - width) > 0.5) this.painted.setSize(width, this.paintedH);
      this.painted.setScale(scale).setPosition(x0, y0 - h * 0.06 - drift);
      this.painted.tilePositionX = (view.x * PAINTED_FACTOR) / scale;
      return;
    }
    this.sky?.setPosition(x0, y0).setDisplaySize(w, h);
    this.layers.forEach((layer, i) => {
      layer.setPosition(x0, y0);
      if (Math.abs(layer.width - w) > 0.5) layer.setSize(w, BG_H);
      layer.setScale(1, h / BG_H);
      layer.tilePositionX = view.x * FACTORS[i];
      const drift = (view.y - 100) * FACTORS[i] * 0.4;
      layer.y = y0 - drift * 0.2;
    });
  }
}
