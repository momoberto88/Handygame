import type Phaser from 'phaser';
import { Tile, type Track } from '../sim/types';
import { WORLDS } from './worlds';

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Draws a squeezed side view of a whole track into a canvas texture (replacing an old one). */
export function drawTrackThumb(scene: Phaser.Scene, key: string, track: Track, w: number, h: number): string {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const theme = WORLDS[track.world];
  const tex = scene.textures.createCanvas(key, w, h)!;
  const ctx = tex.getContext();
  const img = ctx.createImageData(w, h);
  const sky0 = hex(theme.skyTop);
  const sky1 = hex(theme.skyBottom);
  const ground = hex(theme.ground);
  const top = hex(theme.groundTop);
  const plank = hex(theme.platform);
  const danger: [number, number, number] = [220, 40, 40];
  for (let py = 0; py < h; py++) {
    const row = Math.floor((py / h) * track.rows);
    for (let px = 0; px < w; px++) {
      const col = Math.floor((px / w) * track.cols);
      const t = track.tiles[row * track.cols + col];
      const above = row > 0 ? track.tiles[(row - 1) * track.cols + col] : Tile.Empty;
      let c: [number, number, number];
      if (t === Tile.Spikes) c = danger;
      else if (t === Tile.Platform || ((t === Tile.SlopeUp || t === Tile.SlopeDown) && row + 1 < track.rows && track.tiles[(row + 1) * track.cols + col] === Tile.Empty)) c = plank;
      else if (t !== Tile.Empty) c = above === Tile.Empty ? top : ground;
      else {
        const k = py / h;
        c = [sky0[0] + (sky1[0] - sky0[0]) * k, sky0[1] + (sky1[1] - sky0[1]) * k, sky0[2] + (sky1[2] - sky0[2]) * k];
      }
      const i = (py * w + px) * 4;
      img.data[i] = c[0];
      img.data[i + 1] = c[1];
      img.data[i + 2] = c[2];
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  tex.refresh();
  return key;
}
