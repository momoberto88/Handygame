import { describe, expect, it } from 'vitest';
import { DT, TILE } from '../src/sim/constants';
import { stepRunnerPhysics, tileAt } from '../src/sim/physics';
import { generateTrack } from '../src/sim/track/generator';
import { createRunner } from '../src/sim/race';
import { NO_INPUT, Tile, type Track } from '../src/sim/types';

/** Flat ground, a 45° hill up (and down again), flat ground. */
function hillTrack(height: number): Track {
  const cols = 80;
  const rows = 26;
  const tiles = new Uint8Array(cols * rows);
  const set = (c: number, r: number, t: number) => (tiles[r * cols + c] = t);
  const ground = 20;
  const up0 = 20;
  let top = ground;
  for (let c = 0; c < cols; c++) {
    let surface = ground; // first solid row
    if (c >= up0 && c < up0 + height) {
      // rising: slope tile one row above the previous surface
      surface = ground - (c - up0);
      set(c, surface - 1, Tile.SlopeUp);
    } else if (c >= up0 + height && c < up0 + height + 6) {
      surface = ground - height;
    } else if (c >= up0 + height + 6 && c < up0 + 2 * height + 6) {
      surface = ground - height + (c - up0 - height - 6) + 1;
      set(c, surface - 1, Tile.SlopeDown);
    }
    top = Math.min(top, surface);
    for (let r = surface; r < rows; r++) set(c, r, Tile.Solid);
  }
  return {
    seed: 1,
    world: 'jungle',
    cols,
    rows,
    tiles,
    saws: [],
    crushers: [],
    pads: [],
    boxes: [],
    coins: [],
    movers: [],
    zones: [],
    lasers: [],
    cannons: [],
    startX: 200,
    startY: ground * TILE,
    finishX: (cols - 4) * TILE,
    chunks: [],
  };
}

describe('hills', () => {
  it('runners walk up a hill without getting stuck, whatever their position on the tiles', () => {
    const track = hillTrack(8);
    for (const speed of [300, 390, 480, 580])
    for (let offset = 0; offset < TILE; offset += 0.5) {
      const r = createRunner(0, 300 + offset, track.startY);
      r.vx = speed;
      let stuck = 0;
      let worst = 0;
      for (let i = 0; i < 6 / DT; i++) {
        stepRunnerPhysics(r, NO_INPUT, track, DT);
        stuck = r.vx < 20 ? stuck + DT : 0;
        worst = Math.max(worst, stuck);
      }
      expect(worst, `speed ${speed}, offset ${offset}: stood still on the hill`).toBeLessThan(0.1);
      expect(r.x, `offset ${offset}`).toBeGreaterThan((20 + 8 * 2 + 6) * TILE);
    }
  });

  it('jumping around on the hills never stops a runner dead against a hillside', () => {
    const track = generateTrack({ seed: 1, world: 'jungle', courseId: 'testgelaende' });
    let stops = 0;
    for (let period = 17; period < 60; period += 3) {
      const r = createRunner(0, track.startX, track.startY);
      for (let i = 0; i < 90 / DT && r.x < track.finishX; i++) {
        const vx0 = r.vx;
        stepRunnerPhysics(r, { jump: i % period < 4, slide: false, use: 0, ability: false }, track, DT);
        if (r.y > track.rows * TILE) r.y = 0;
        if (vx0 > 120 && r.vx === 0) {
          // stopped: was the "wall" just the ground under a slope?
          const c = Math.floor((r.x + 13.1) / TILE);
          for (let row = 0; row < track.rows; row++) {
            const t = tileAt(track, c, row);
            if (t === Tile.SlopeUp || t === Tile.SlopeDown) stops++;
            if (t !== Tile.Empty) break;
          }
        }
        if (r.vx === 0 && r.grounded) r.x += 2; // past real walls (the tunnel, the cliff)
      }
    }
    expect(stops).toBe(0);
  });
});
