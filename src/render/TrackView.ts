import Phaser from 'phaser';
import { CRUSHER_HEAD_H, ROWS, TILE } from '../sim/constants';
import { crusherOffset, sawPosition } from '../sim/hazards';
import { tileAt } from '../sim/physics';
import { Tile, type Track } from '../sim/types';
import { ART_RES } from './art/canvas';
import {
  EDGE_BOTTOM,
  EDGE_LEFT,
  EDGE_RIGHT,
  EDGE_TOP,
  makeTileset,
  TILE_PLATFORM,
  TILE_SPIKES,
  slopeIndex,
  solidIndex,
  TILE_PAD,
} from './art/worldArt';

function covers(t: number): boolean {
  return t === Tile.Solid || t === Tile.SlopeUp || t === Tile.SlopeDown;
}

export function tileIndexFor(track: Track, col: number, row: number): number {
  const t = tileAt(track, col, row);
  const vx = ((col % 4) + 4) % 4;
  const vy = ((row % 2) + 2) % 2;
  switch (t) {
    case Tile.Solid: {
      let mask = 0;
      if (!covers(tileAt(track, col, row - 1)) && row > 0) mask |= EDGE_TOP;
      const right = tileAt(track, col + 1, row);
      if (right !== Tile.Solid && right !== Tile.SlopeDown) mask |= EDGE_RIGHT;
      if (row < ROWS - 1 && tileAt(track, col, row + 1) !== Tile.Solid) mask |= EDGE_BOTTOM;
      const left = tileAt(track, col - 1, row);
      if (left !== Tile.Solid && left !== Tile.SlopeUp) mask |= EDGE_LEFT;
      return solidIndex(mask, vx, vy);
    }
    case Tile.SlopeUp:
      return slopeIndex(true, vx, vy);
    case Tile.SlopeDown:
      return slopeIndex(false, vx, vy);
    case Tile.Platform:
      return TILE_PLATFORM + (vx % 2);
    case Tile.Spikes:
      return TILE_SPIKES;
    default:
      return -1;
  }
}

interface Culled {
  obj: Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible;
  x: number;
}

/** Static level geometry plus the animated level objects (saws, crushers, pads, boxes, coins). */
export class TrackView {
  private coins: Phaser.GameObjects.Image[] = [];
  private boxes: Phaser.GameObjects.Image[] = [];
  private boxWasReady: boolean[] = [];
  private saws: Phaser.GameObjects.Image[] = [];
  private crusherHeads: Phaser.GameObjects.Image[] = [];
  private crusherRods: Phaser.GameObjects.TileSprite[] = [];
  private pads: Phaser.GameObjects.Image[] = [];
  private padBounce: number[] = [];
  private culled: Culled[] = [];

  constructor(
    private scene: Phaser.Scene,
    readonly track: Track,
  ) {
    this.buildTiles();
    this.buildObjects();
  }

  private buildTiles() {
    const { track, scene } = this;
    const key = makeTileset(scene, track.world);
    // Tilemaps get big; split them into strips so each layer stays a reasonable size.
    // We also draw some ground before the start and after the end of the track.
    const stripCols = 128;
    const first = -48;
    const last = track.cols + 64;
    for (let start = first; start < last; start += stripCols) {
      const width = Math.min(stripCols, last - start);
      const data: number[][] = [];
      for (let r = 0; r < track.rows; r++) {
        const row: number[] = [];
        for (let c = 0; c < width; c++) row.push(tileIndexFor(track, start + c, r));
        data.push(row);
      }
      const map = scene.make.tilemap({ data, tileWidth: TILE * ART_RES, tileHeight: TILE * ART_RES });
      const tileset = map.addTilesetImage(key, key, TILE * ART_RES, TILE * ART_RES, TILE_PAD, TILE_PAD * 2)!;
      const layer = map.createLayer(0, tileset, start * TILE, 0)!;
      layer.setScale(1 / ART_RES).setDepth(10);
    }
  }

  private cull<T extends Culled['obj']>(obj: T, x: number): T {
    this.culled.push({ obj, x });
    return obj;
  }

  private buildObjects() {
    const { track, scene } = this;
    const s = 1 / ART_RES;

    // finish line
    const fx = track.finishX;
    scene.add.tileSprite(fx, 0, 20 * ART_RES, ROWS * TILE * ART_RES, 'finish-strip').setOrigin(0.5, 0).setScale(s).setDepth(5).setAlpha(0.9);
    scene.add.image(fx, 12 * TILE - 150, 'finish-banner').setScale(s).setDepth(6);
    scene.add.image(fx - 26, 12 * TILE + 2, 'finish-flag').setOrigin(0.5, 1).setScale(s * 1.2).setDepth(6);
    scene.add.image(fx + 30, 12 * TILE + 2, 'finish-flag').setOrigin(0.5, 1).setScale(s * 1.2).setDepth(6);
    // start line
    scene.add.rectangle(track.startX + 16, 12 * TILE - 60, 6, 60, 0xffffff, 0.8).setOrigin(0.5, 0).setDepth(5);

    for (const c of track.coins) this.coins.push(this.cull(scene.add.image(c.x, c.y, 'coin').setScale(s).setDepth(20), c.x));
    for (const b of track.boxes) {
      this.boxes.push(this.cull(scene.add.image(b.x, b.y, 'itembox').setScale(s).setDepth(20), b.x));
      this.boxWasReady.push(true);
    }
    for (const saw of track.saws) {
      if (saw.range) {
        const chain = scene.add
          .rectangle(saw.x, saw.y - saw.range - 30, 3, saw.range * 2 + 30, 0x3a3030)
          .setOrigin(0.5, 0)
          .setDepth(14);
        this.cull(chain, saw.x);
      }
      this.saws.push(this.cull(scene.add.image(saw.x, saw.y, 'saw').setScale(s).setDepth(21), saw.x));
    }
    for (const c of track.crushers) {
      const rod = scene.add.tileSprite(c.x, c.anchorY, 14 * ART_RES, 10, 'crusher-rod').setOrigin(0.5, 0).setScale(s).setDepth(15);
      this.crusherRods.push(this.cull(rod, c.x));
      this.crusherHeads.push(this.cull(scene.add.image(c.x, c.anchorY, 'crusher-head').setOrigin(0.5, 0).setScale(s).setDepth(22), c.x));
    }
    for (const p of track.pads) {
      const img = scene.add.image(p.x, p.y + 2, p.kind === 'jump' ? 'pad-jump' : 'pad-boost').setOrigin(0.5, 1).setScale(s).setDepth(19);
      this.pads.push(this.cull(img, p.x));
      this.padBounce.push(0);
    }
  }

  bouncePadNear(x: number) {
    let best = -1;
    let dist = 60;
    this.track.pads.forEach((p, i) => {
      if (Math.abs(p.x - x) < dist) {
        dist = Math.abs(p.x - x);
        best = i;
      }
    });
    if (best >= 0) this.padBounce[best] = 1;
  }

  update(clock: number, dt: number, viewLeft: number, viewRight: number, coinTaken: Uint8Array, boxCooldown: number[]) {
    for (const c of this.culled) c.obj.setVisible(c.x > viewLeft - 120 && c.x < viewRight + 120);
    const s = 1 / ART_RES;

    const spin = Math.cos(clock * 5);
    this.coins.forEach((img, i) => {
      if (coinTaken[i]) img.setVisible(false);
      else if (img.visible) img.setScale(s * Math.max(0.15, Math.abs(spin)), s);
    });

    this.boxes.forEach((img, i) => {
      const ready = boxCooldown[i] <= 0;
      if (!ready) img.setVisible(false);
      else if (img.visible) {
        const bob = Math.sin(clock * 3 + i) * 3;
        img.y = this.track.boxes[i].y + bob;
        img.rotation = Math.sin(clock * 2 + i) * 0.08;
        if (!this.boxWasReady[i]) {
          img.setScale(0);
          this.scene.tweens.add({ targets: img, scale: s, duration: 300, ease: 'Back.Out' });
        }
      }
      this.boxWasReady[i] = ready;
    });

    this.track.saws.forEach((saw, i) => {
      const img = this.saws[i];
      if (!img.visible) return;
      const p = sawPosition(saw, clock);
      img.setPosition(p.x, p.y).setRotation(clock * 14);
    });

    this.track.crushers.forEach((c, i) => {
      const head = this.crusherHeads[i];
      if (!head.visible) return;
      const off = crusherOffset(c, clock);
      head.y = c.anchorY + off;
      this.crusherRods[i].height = Math.max(1, off + 4) * ART_RES;
    });

    this.pads.forEach((img, i) => {
      if (this.padBounce[i] > 0) {
        this.padBounce[i] = Math.max(0, this.padBounce[i] - dt * 4);
        const k = Math.sin(this.padBounce[i] * Math.PI);
        img.setScale(s * (1 + k * 0.3), s * (1 - k * 0.4));
      }
    });
  }
}

export { CRUSHER_HEAD_H };
