import { ROWS } from '../constants';
import { Tile, type WorldId } from '../types';
import type { TrackBuilder } from './builder';
import type { ModuleDef } from './modules';

/**
 * Free-form pieces: real landscape instead of the three storeys. Hills and valleys, a tunnel
 * through a mountain, a cliff, islands over a chasm, a far-apart fork, a long slide. Every piece
 * starts and ends on the ground at the low storey's floor row, so they chain with each other and
 * with the start and finish areas.
 */
const GROUND = 21;

/** Draws the ground column by column, like a pen moving to the right. */
class Land {
  /** Top row of the ground at the pen. */
  g = GROUND;

  constructor(
    private b: TrackBuilder,
    public c: number,
  ) {}

  private column(c: number, top: number, t: number) {
    this.b.set(c, top, t);
    for (let r = top + 1; r < ROWS; r++) this.b.set(c, r, Tile.Solid);
  }

  flat(n: number, t: number = Tile.Solid) {
    for (let i = 0; i < n; i++) this.column(this.c + i, this.g, t);
    this.c += n;
    return this;
  }

  /** 45° ramp up by n rows. */
  up(n: number) {
    for (let i = 0; i < n; i++) this.column(this.c + i, this.g - 1 - i, Tile.SlopeUp);
    this.c += n;
    this.g -= n;
    return this;
  }

  /** 45° ramp down by n rows. */
  down(n: number) {
    for (let i = 0; i < n; i++) this.column(this.c + i, this.g + i, Tile.SlopeDown);
    this.c += n;
    this.g += n;
    return this;
  }

  /** Straight wall up or down to row `g` (a cliff or a drop). */
  step(g: number) {
    this.g = g;
    return this;
  }

  /** Nothing below: a deadly chasm. */
  pit(n: number) {
    this.c += n;
    return this;
  }
}

/** A floating chunk of rock (2 rows thick) or a one-way plank. */
function island(b: TrackBuilder, c0: number, c1: number, row: number, plank = false) {
  for (let c = c0; c <= c1; c++) {
    b.set(c, row, plank ? Tile.Platform : Tile.Solid);
    if (!plank) b.set(c, row + 1, Tile.Solid);
  }
}

export const FREE: ModuleDef[] = [];

function free(world: WorldId, name: string, difficulty: 1 | 2 | 3, body: (b: TrackBuilder, x: number) => number) {
  FREE.push({
    name,
    world,
    difficulty,
    free: true,
    build(b, x) {
      const w = body(b, x);
      b.mark(name, x, w);
      return w;
    },
  });
}

// Valley and hills: slide down into the valley, over spikes, up a big hill, jump for the coins.
free('jungle', 'free-valley', 1, (b, x) => {
  const L = new Land(b, x);
  L.flat(4).down(2).flat(3).up(5);
  b.coinsAt(L.c, L.c + 4, L.g, 2);
  L.flat(5).down(5);
  const bottom = L.c;
  L.flat(7);
  b.set(bottom + 3, L.g - 1, Tile.Spikes);
  b.set(bottom + 4, L.g - 1, Tile.Spikes);
  b.coinsAt(bottom + 2, bottom + 5, L.g, 2, 2);
  L.up(10);
  const top = L.c;
  L.flat(5);
  b.boxAt(top + 2, L.g);
  // a plank high above the hilltop, for a double jump
  island(b, top + 1, top + 5, L.g - 5, true);
  b.coinsAt(top + 1, top + 5, L.g - 5, 2);
  L.down(8).flat(4);
  return L.c - x;
});

// A mountain with a slide tunnel at the bottom; a jump pad throws you over the top instead.
free('jungle', 'free-tunnel', 2, (b, x) => {
  const L = new Land(b, x);
  L.flat(8);
  // close enough to the mountain that the pad's arc clears its top
  b.padAt(x + 4, L.g, 'jump');
  const m0 = L.c;
  const m1 = m0 + 16;
  const topRow = L.g - 6;
  L.flat(17);
  // the mountain: solid from its top down to the tunnel, the tunnel is one row high (slide!)
  for (let c = m0; c <= m1; c++) for (let r = topRow; r <= L.g - 2; r++) b.set(c, r, Tile.Solid);
  b.coinsAt(m0 + 2, m1 - 2, L.g, 1);
  b.coinsAt(m0 + 1, m1 - 1, topRow, 2);
  b.boxAt(m0 + 8, topRow);
  b.sawAt(m0 + 12, topRow, 1, 'vertical', 40);
  L.flat(8);
  return L.c - x;
});

// Floating islands over a chasm: rocks low, planks high (double jump up through them).
free('jungle', 'free-islands', 2, (b, x) => {
  const L = new Land(b, x);
  L.flat(4);
  const p0 = L.c;
  L.pit(46);
  const low = GROUND - 1;
  const rocks: [number, number][] = [[2, 6], [10, 14], [18, 22], [26, 30], [34, 38], [42, 45]];
  rocks.forEach(([a, e], i) => {
    const row = low + (i % 2 === 0 ? 0 : -1);
    island(b, p0 + a, p0 + e, row);
    b.coinsAt(p0 + a + 1, p0 + e - 1, row, 2);
  });
  b.padAt(p0 + 4, low, 'jump');
  const planks: [number, number, number][] = [[6, 10, 15], [14, 18, 13], [22, 26, 11], [30, 34, 13], [38, 42, 14]];
  for (const [a, e, row] of planks) {
    island(b, p0 + a, p0 + e, row, true);
    b.coinsAt(p0 + a, p0 + e, row, 2, 1);
  }
  b.boxAt(p0 + 24, 11);
  b.boxAt(p0 + 28, low - 1);
  L.flat(6);
  return L.c - x;
});

// A cliff: climb the planks, jump off the pad or wall-jump up; then race down the long slope.
free('jungle', 'free-cliff', 2, (b, x) => {
  const L = new Land(b, x);
  L.flat(11);
  b.padAt(x + 8, L.g, 'mega');
  island(b, x + 2, x + 4, 18, true);
  island(b, x + 6, x + 8, 15, true);
  b.coinsAt(x + 2, x + 4, 18, 2);
  L.step(13);
  const plateau = L.c;
  L.flat(12);
  b.sawAt(plateau + 6, 13, 1, 'vertical', 30);
  b.boxAt(plateau + 2, 13);
  b.coinsAt(plateau + 8, plateau + 11, 13, 2);
  L.down(3).flat(1).down(3).flat(1).down(2);
  b.coinsAt(plateau + 12, plateau + 21, 17, 1);
  L.flat(6);
  return L.c - x;
});

// A fork far apart: a mega pad throws you onto a high bridge with gaps and saws, the ground
// route dips into a muddy valley.
free('jungle', 'free-fork', 3, (b, x) => {
  const L = new Land(b, x);
  L.flat(5);
  b.padAt(x + 2, L.g, 'mega');
  const v0 = L.c;
  L.down(2).flat(14, Tile.Mud).up(2);
  b.coinsAt(v0 + 3, v0 + 15, L.g + 2, 2);
  b.boxAt(v0 + 9, L.g + 2);
  L.flat(10);
  // the bridge, 12 rows above the ground, with three gaps
  const bridge = 11;
  const parts: [number, number][] = [[5, 12], [16, 22], [26, 31], [35, 40]];
  for (const [a, e] of parts) island(b, x + a, x + e, bridge, true);
  b.sawAt(x + 19, bridge, 1, 'vertical', 40);
  b.coinsAt(x + 12, x + 16, bridge, 2, 2);
  b.coinsAt(x + 31, x + 35, bridge, 2, 2);
  b.boxAt(x + 38, bridge);
  L.flat(4);
  return L.c - x;
});

// Up a steep hill with a boost, then one long bumpy slide down and a jump over the gap.
free('jungle', 'free-slide', 1, (b, x) => {
  const L = new Land(b, x);
  L.flat(4);
  b.padAt(x + 1, L.g, 'boost');
  L.up(9).flat(3);
  const peak = L.c;
  b.boxAt(peak - 2, L.g);
  L.down(3).flat(1).down(3).flat(1).down(3);
  // coins following the slope down
  [12, 13, 14, 15, 15, 16, 17, 18, 18, 19, 20].forEach((row, i) => b.coinsAt(peak + i, peak + i, row, 2));
  L.flat(3).pit(4).flat(6);
  b.coinsAt(L.c - 11, L.c - 7, L.g, 2, 2);
  return L.c - x;
});
