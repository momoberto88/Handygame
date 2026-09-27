import { Tile } from '../types';
import type { TrackBuilder } from './builder';
import { GROUND, Land, free, island } from './freeform';

/**
 * Free-form landscapes for every world (the jungle ones live in freeform.ts). Each piece starts and
 * ends on the ground at row GROUND and has at least two ways through: one on the ground and one up
 * high or risky. The world's own tricks (conveyors, wind, water, lasers, cannons …) are placed in
 * the landscape instead of on three storeys.
 */

const G = GROUND;

/** Rock ceiling from the top of the level down to `row` (inclusive): caves, mines, tunnels. */
function roof(b: TrackBuilder, c0: number, c1: number, row: number) {
  b.fill(c0, c1, 0, row, Tile.Solid);
}

/** One-way plank (can be jumped through from below). */
function plank(b: TrackBuilder, c0: number, c1: number, row: number) {
  island(b, c0, c1, row, true);
}

/** The piece must end on the ground so the next one fits. */
function done(L: Land, x: number): number {
  if (L.g !== G) throw new Error(`landscape piece ends at row ${L.g}, not on the ground`);
  return L.c - x;
}

// =============================================================================================
// Zahnrad-Mine: underground. A rock roof, conveyor belts, crushers, lifts up to the galleries.

// Rails: conveyors speed you up, crushers stamp on them; a double jump reaches the plank gallery.
free('mine', 'mine-rails', 1, (b, x) => {
  const L = new Land(b, x);
  roof(b, x, x + 40, 8);
  L.flat(4).flat(9, Tile.ConveyorFwd);
  b.crusherAt(L.c - 3, G - 5);
  b.coinsAt(x + 5, x + 11, G, 1);
  L.flat(3);
  const g0 = L.c;
  plank(b, g0 + 1, g0 + 13, 17);
  b.coinsAt(g0 + 2, g0 + 12, 17, 2);
  b.boxAt(g0 + 8, 17);
  L.flat(6).pit(3).flat(8, Tile.ConveyorFwd);
  b.crusherAt(L.c - 4, G - 5);
  b.boxAt(g0 + 3, G);
  L.flat(4);
  return done(L, x);
});

// The lift hall: a lift goes up to a fast conveyor gallery, the ground runs against a back belt
// with a spike trap to jump.
free('mine', 'mine-lift', 2, (b, x) => {
  const L = new Land(b, x);
  roof(b, x, x + 42, 8);
  L.flat(5);
  b.moverAt(L.c, 17, 3, 'y', 3, 3.2);
  L.flat(4);
  const g0 = L.c;
  for (let c = g0; c <= g0 + 22; c++) b.set(c, 13, Tile.ConveyorFwd);
  b.coinsAt(g0 + 2, g0 + 20, 13, 2);
  b.boxAt(g0 + 12, 13);
  L.flat(7, Tile.ConveyorBack).flat(2);
  b.spikesAt(L.c - 1, L.c, G);
  L.flat(6).flat(8, Tile.ConveyorBack);
  b.coinsAt(g0 + 1, g0 + 6, G, 1);
  b.boxAt(g0 + 12, G);
  L.flat(9);
  return done(L, x);
});

// A big cavern with a rock hill in the middle: jump its low face and run over the top (saws hang
// from the roof), or slide through the tunnel underneath, where a belt pushes you along.
free('mine', 'mine-cavern', 2, (b, x) => {
  const L = new Land(b, x);
  roof(b, x, x + 40, 7);
  L.flat(5);
  const m0 = L.c;
  L.flat(22, Tile.ConveyorFwd);
  // the hill rests on row G-2 (80 px up, one jump); row G-1 below it is the slide tunnel
  const base = G - 2;
  for (let i = 0; i < 22; i++) {
    const c = m0 + i;
    let surface = base;
    if (i >= 1 && i <= 3) {
      surface = base - i;
      b.set(c, surface, Tile.SlopeUp);
    } else if (i >= 18 && i <= 20) {
      surface = base - (21 - i);
      b.set(c, surface, Tile.SlopeDown);
    } else {
      if (i > 3 && i < 18) surface = base - 3;
      b.set(c, surface, Tile.Solid);
    }
    for (let r = surface + 1; r <= base; r++) b.set(c, r, Tile.Solid);
  }
  const top = base - 3;
  b.sawAt(m0 + 8, top, 3, 'vertical', 40);
  b.sawAt(m0 + 14, top, 3, 'vertical', 40);
  b.coinsAt(m0 + 4, m0 + 17, top, 1);
  b.boxAt(m0 + 11, top);
  b.coinsAt(m0 + 2, m0 + 19, G, 0.4);
  L.flat(8);
  return done(L, x);
});

// Wooden trestles over a chasm: a crumbling bridge low, rope planks high up.
free('mine', 'mine-trestle', 2, (b, x) => {
  const L = new Land(b, x);
  roof(b, x, x + 42, 7);
  L.flat(6);
  const p0 = L.c;
  L.pit(26);
  // low bridge: solid posts with crumbling boards between them
  for (let c = p0; c < p0 + 26; c++) b.set(c, G, c % 6 < 2 ? Tile.Solid : Tile.Crumble);
  // rope planks up high (double jump), with gaps between them
  plank(b, p0 + 1, p0 + 7, 17);
  plank(b, p0 + 10, p0 + 16, 16);
  plank(b, p0 + 19, p0 + 25, 17);
  b.coinsAt(p0 + 1, p0 + 25, 16, 2, 0);
  b.boxAt(p0 + 13, 16);
  b.boxAt(p0 + 6, G);
  L.flat(8);
  return done(L, x);
});

// Down into the shaft and up the gear lifts; or stay up on the scaffold and jump its gaps.
free('mine', 'mine-shaft', 3, (b, x) => {
  const L = new Land(b, x);
  roof(b, x, x + 46, 6);
  L.flat(4).up(3).flat(4);
  const s0 = L.c;
  // the scaffold: planks at the old height over the shaft, with gaps
  plank(b, s0, s0 + 7, L.g);
  plank(b, s0 + 11, s0 + 18, L.g);
  plank(b, s0 + 22, s0 + 28, L.g);
  b.crusherAt(s0 + 14, L.g - 5);
  b.coinsAt(s0, s0 + 28, L.g, 2);
  // the shaft floor: down, a back belt, lifts to get out again
  L.step(G + 2).flat(24, Tile.ConveyorBack);
  b.moverAt(L.c - 5, G - 1, 3, 'y', 2, 2.6);
  b.boxAt(s0 + 10, G + 2);
  L.flat(5).step(G - 3).flat(4).down(3).flat(3);
  return done(L, x);
});

// Out of the mine: a long ramp up to daylight, conveyors on the top, a jump down.
free('mine', 'mine-exit', 1, (b, x) => {
  const L = new Land(b, x);
  roof(b, x, x + 12, 8);
  L.flat(4).up(5).flat(10, Tile.ConveyorFwd);
  b.coinsAt(x + 10, x + 19, G - 5, 2, 1);
  b.boxAt(x + 16, G - 5);
  L.flat(3).pit(3).flat(4).down(5).flat(6);
  b.spikesAt(L.c - 4, L.c - 3, G);
  L.flat(5);
  return done(L, x);
});

// =============================================================================================
// Himmelsinseln: the sky below is deadly. Island chains, updrafts, crumbling bridges, headwind.

// A chain of rock islands going up and down over the abyss; planks high above for double jumps.
free('sky', 'sky-hop', 1, (b, x) => {
  const L = new Land(b, x);
  L.flat(5);
  const p0 = L.c;
  L.pit(40);
  const rocks: [number, number, number][] = [[1, 6, G], [10, 14, G - 1], [18, 22, G - 2], [26, 30, G - 1], [34, 38, G]];
  for (const [a, e, row] of rocks) {
    island(b, p0 + a, p0 + e, row);
    b.coinsAt(p0 + a + 1, p0 + e - 1, row, 1);
  }
  plank(b, p0 + 8, p0 + 16, G - 5);
  plank(b, p0 + 20, p0 + 32, G - 6);
  b.coinsAt(p0 + 21, p0 + 31, G - 6, 2, 1);
  b.boxAt(p0 + 26, G - 6);
  b.boxAt(p0 + 20, G - 2);
  L.flat(6);
  return done(L, x);
});

// A canyon with an updraft: jump in and the wind carries you across. Ride it up high to reach the
// cloud island with the box, or stay low and go straight over.
free('sky', 'sky-updraft', 2, (b, x) => {
  const L = new Land(b, x);
  L.flat(5);
  const p0 = L.c;
  L.pit(18);
  b.zone('wind', p0 + 1, p0 + 17, 8, 25, 0, -3300);
  b.coinsAt(p0 + 6, p0 + 6, 12, 0);
  b.coinsAt(p0 + 6, p0 + 6, 14, 0);
  b.coinsAt(p0 + 6, p0 + 6, 16, 0);
  b.coinsAt(p0 + 3, p0 + 15, 10, 0, 1);
  island(b, p0 + 20, p0 + 25, 14);
  b.boxAt(p0 + 22, 14);
  b.coinsAt(p0 + 20, p0 + 25, 14, 1);
  L.flat(10);
  b.spikesAt(L.c - 5, L.c - 4, G);
  L.flat(4);
  return done(L, x);
});

// A long crumbling bridge over the abyss (keep running!), with an arch of islands above it.
free('sky', 'sky-bridge', 2, (b, x) => {
  const L = new Land(b, x);
  L.flat(6);
  const p0 = L.c;
  L.pit(28);
  for (let i = 0; i < 28; i++) b.set(p0 + i, G, i % 7 === 0 ? Tile.Solid : Tile.Crumble);
  b.coinsAt(p0 + 1, p0 + 26, G, 1);
  island(b, p0 + 2, p0 + 7, G - 4);
  island(b, p0 + 11, p0 + 16, G - 6);
  island(b, p0 + 20, p0 + 25, G - 4);
  b.coinsAt(p0 + 11, p0 + 16, G - 6, 2);
  b.boxAt(p0 + 13, G - 6);
  b.sawAt(p0 + 18, G, 3, 'vertical', 30);
  L.flat(6);
  return done(L, x);
});

// Cloud stairs: one-way clouds climb high over a gorge and down again; underneath, moving clouds
// carry the brave straight across.
free('sky', 'sky-stairs', 2, (b, x) => {
  const L = new Land(b, x);
  L.flat(5);
  const p0 = L.c;
  L.pit(30);
  const steps: [number, number, number][] = [[0, 3, G - 2], [4, 7, G - 4], [8, 11, G - 6], [13, 17, G - 7], [19, 22, G - 5], [23, 26, G - 3], [27, 29, G - 1]];
  for (const [a, e, row] of steps) plank(b, p0 + a, p0 + e, row);
  b.coinsAt(p0 + 8, p0 + 22, G - 7, 2, 1);
  b.boxAt(p0 + 15, G - 7);
  b.moverAt(p0 + 5, G, 3, 'x', 2.5, 3.0);
  b.moverAt(p0 + 17, G, 3, 'x', 2.5, 3.4);
  b.coinsAt(p0 + 2, p0 + 28, G, 1);
  L.flat(6);
  return done(L, x);
});

// Storm ridge: a mountain with headwind on the crest; the valley path next to it is faster but
// has a gap and spikes.
free('sky', 'sky-ridge', 3, (b, x) => {
  const L = new Land(b, x);
  L.flat(4);
  const r0 = L.c;
  L.up(4).flat(12);
  b.zone('wind', r0 + 4, r0 + 15, G - 10, G - 5, -520, 0);
  b.coinsAt(r0 + 4, r0 + 15, G - 4, 2);
  b.boxAt(r0 + 10, G - 4);
  L.down(4).flat(3);
  const v0 = L.c;
  L.down(3).flat(3);
  b.padAt(L.c - 2, G + 3, 'boost');
  L.pit(3).flat(4);
  b.spikesAt(L.c - 2, L.c - 1, G + 3);
  L.flat(3).up(3).flat(5);
  // the high path: a plank bridge from the ridge across the valley
  plank(b, v0 - 3, v0 + 15, G - 4);
  b.coinsAt(v0, v0 + 14, G - 4, 2, 1);
  return done(L, x);
});

// A mega mushroom-cloud throws you over the abyss onto a far island; or hop the small rocks.
free('sky', 'sky-launch', 1, (b, x) => {
  const L = new Land(b, x);
  L.flat(6);
  b.padAt(x + 3, G, 'mega');
  const p0 = L.c;
  L.pit(34);
  island(b, p0 + 4, p0 + 7, G);
  island(b, p0 + 12, p0 + 15, G - 1);
  island(b, p0 + 20, p0 + 23, G);
  island(b, p0 + 28, p0 + 31, G - 1);
  b.coinsAt(p0 + 8, p0 + 26, 10, 2, 2);
  b.boxAt(p0 + 13, G - 1);
  L.flat(8);
  return done(L, x);
});

// =============================================================================================
// Neon-Stadt: rooftops of different heights, an elevator tower, laser alleys, a boost highway.

// Rooftops: jump from roof to roof over the alleys, slide under or jump over the billboards.
free('neon', 'neon-roofs', 1, (b, x) => {
  const L = new Land(b, x);
  L.flat(7);
  b.padAt(x + 3, G, 'boost');
  L.pit(3).step(G - 2).flat(8);
  const r1 = L.c - 8;
  b.fill(r1 + 4, r1 + 5, G - 4, G - 4, Tile.Solid);
  b.coinsAt(r1 + 1, r1 + 7, G - 2, 0.4);
  L.pit(3).step(G - 4).flat(7);
  b.laserHigh(L.c - 3, G - 4);
  b.boxAt(L.c - 6, G - 4);
  L.pit(3).step(G - 1).flat(6).pit(2).step(G).flat(6);
  plank(b, r1 + 10, r1 + 26, G - 9);
  b.coinsAt(r1 + 11, r1 + 25, G - 9, 2, 1);
  return done(L, x);
});

// A tower block over the street: the elevator (or a wall jump) takes you onto its roof with boost
// pads; the street below has laser gates (jump the low ones, slide under the high ones).
free('neon', 'neon-tower', 2, (b, x) => {
  const L = new Land(b, x);
  L.flat(4);
  b.moverAt(L.c, 16, 3, 'y', 4.25, 4.2);
  L.flat(4);
  const b0 = L.c;
  L.flat(24);
  b.fill(b0, b0 + 18, G - 9, G - 5, Tile.Solid);
  b.padAt(b0 + 3, G - 9, 'boost');
  b.padAt(b0 + 12, G - 9, 'boost');
  b.coinsAt(b0 + 1, b0 + 17, G - 9, 1);
  b.boxAt(b0 + 8, G - 9);
  b.laserLow(b0 + 5, G);
  b.laserHigh(b0 + 11, G, 4);
  b.laserLow(b0 + 17, G);
  b.coinsAt(b0 + 1, b0 + 22, G, 0.4);
  b.boxAt(b0 + 14, G);
  return done(L, x);
});

// Laser alley: low and high gates by turns on the street (jump, slide, jump, slide); a catwalk
// above them has saws.
free('neon', 'neon-lasers', 2, (b, x) => {
  const L = new Land(b, x);
  L.flat(4);
  const a = L.c;
  L.flat(28);
  [4, 10, 16, 22].forEach((d, i) => (i % 2 === 0 ? b.laserLow(a + d, G) : b.laserHigh(a + d, G, 4)));
  plank(b, a + 2, a + 26, G - 5);
  b.sawAt(a + 9, G - 5, 1, 'horizontal', 70);
  b.sawAt(a + 19, G - 5, 1, 'horizontal', 70);
  b.coinsAt(a + 3, a + 25, G - 5, 2);
  b.boxAt(a + 13, G);
  L.flat(4);
  return done(L, x);
});

// The highway: up the ramp, race down with boost pads, jump the broken lanes; an overpass above.
free('neon', 'neon-highway', 3, (b, x) => {
  const L = new Land(b, x);
  L.flat(3).up(5).flat(3);
  b.padAt(L.c - 2, L.g, 'boost');
  L.down(5).flat(4);
  b.padAt(L.c - 2, G, 'boost');
  const o0 = L.c;
  L.pit(4).flat(5);
  b.laserHigh(L.c - 3, G, 4);
  L.pit(4).flat(5);
  b.padAt(L.c - 2, G, 'boost');
  plank(b, o0 - 2, o0 + 18, G - 6);
  b.coinsAt(o0, o0 + 16, G - 6, 2);
  b.boxAt(o0 + 8, G - 6);
  L.up(3).flat(4).down(3).flat(4);
  return done(L, x);
});

// Hover pads over a gap in the city floor; up on the neon signs a low laser to jump.
free('neon', 'neon-hover', 3, (b, x) => {
  const L = new Land(b, x);
  L.flat(5);
  const p0 = L.c;
  L.pit(24);
  [2, 8, 14, 20].forEach((d, i) => b.moverAt(p0 + d, G, 3, 'x', 1.5, 2.6 + i * 0.3));
  island(b, p0 + 3, p0 + 7, G - 5);
  island(b, p0 + 12, p0 + 16, G - 6);
  b.laserLow(p0 + 15, G - 6);
  b.coinsAt(p0 + 3, p0 + 16, G - 6, 2, 1);
  b.boxAt(p0 + 14, G - 6);
  b.coinsAt(p0 + 2, p0 + 22, G, 1);
  L.flat(6);
  return done(L, x);
});

// =============================================================================================
// Versunkener Tempel: flooded up to the surface row S (swim strokes any time below it). Rocks and
// temple walls stick out of the water, caves and arches lead through them under water.

const S = G - 6;

function flood(b: TrackBuilder, x: number, w: number) {
  b.zone('water', x, x + w - 1, S, 25);
}

// Reef: coral bumps with sea urchins, then a big rock: swim over the top at the surface (and run
// across it in the air) or dive through the cave at its foot.
free('water', 'water-reef', 1, (b, x) => {
  const L = new Land(b, x);
  L.flat(4).up(2).flat(2).down(2).flat(3);
  b.spikesAt(L.c - 2, L.c - 1, G);
  const r0 = L.c;
  L.flat(12);
  b.fill(r0 + 2, r0 + 10, S, G - 3, Tile.Solid);
  b.coinsAt(r0 + 2, r0 + 10, G, 0.4);
  b.boxAt(r0 + 6, S);
  b.coinsAt(r0 + 3, r0 + 9, S, 1);
  L.up(2).flat(3).down(2).flat(3);
  b.spikesAt(L.c - 2, L.c - 1, G);
  L.flat(4);
  flood(b, x, L.c - x);
  return done(L, x);
});

// A deep trench: dive in and the current on its floor shoots you along, or stay at the surface
// past the drifting saws.
free('water', 'water-trench', 2, (b, x) => {
  const L = new Land(b, x);
  L.flat(5);
  const t0 = L.c;
  L.down(4).flat(16);
  b.zone('wind', t0 + 4, t0 + 19, G + 1, G + 3, 900, 0);
  b.coinsAt(t0 + 5, t0 + 18, G + 4, 1);
  L.up(4).flat(5);
  b.sawAt(t0 + 8, G, 6, 'horizontal', 60);
  b.sawAt(t0 + 16, G, 6, 'horizontal', 60);
  b.coinsAt(t0 + 2, t0 + 22, S + 1, 0, 1);
  b.boxAt(t0 + 12, G - 2);
  flood(b, x, L.c - x);
  return done(L, x);
});

// Current channel: down low the water flows your way; above the ledge it flows against you, but
// the box and coins are up there.
free('water', 'water-current', 2, (b, x) => {
  const L = new Land(b, x);
  L.flat(4);
  const c0 = L.c;
  L.down(2).flat(24).up(2).flat(4);
  b.zone('wind', c0 + 2, c0 + 25, G - 1, G + 1, 700, 0);
  b.zone('wind', c0 + 2, c0 + 25, S - 2, G - 4, -350, 0);
  island(b, c0 + 4, c0 + 24, G - 3);
  b.coinsAt(c0 + 5, c0 + 23, G - 3, 1);
  b.boxAt(c0 + 14, G - 3);
  b.spikesAt(c0 + 12, c0 + 13, G + 2);
  flood(b, x, L.c - x);
  return done(L, x);
});

// Bubble lift: a temple wall rises out of the water; the bubble column in front of it carries you
// up, then down the stairs on the other side back into the water.
free('water', 'water-bubbles', 2, (b, x) => {
  const L = new Land(b, x);
  L.flat(7);
  b.zone('wind', L.c - 4, L.c - 1, 9, G - 1, 0, -2600);
  b.coinsAt(L.c - 3, L.c - 3, 12, 0);
  b.coinsAt(L.c - 3, L.c - 3, 16, 0);
  L.step(G - 8).flat(6);
  b.boxAt(L.c - 3, G - 8);
  b.coinsAt(L.c - 6, L.c - 1, G - 8, 1);
  L.down(2).flat(2).down(2).flat(2).down(4).flat(6);
  b.spikesAt(L.c - 3, L.c - 2, G);
  L.flat(3);
  flood(b, x, L.c - x);
  return done(L, x);
});

// Column hall: temple columns stick out of the water, dive through the arches at their feet;
// a saw drifts between them.
free('water', 'water-columns', 2, (b, x) => {
  const L = new Land(b, x);
  L.flat(4);
  const h0 = L.c;
  L.flat(30);
  for (const d of [4, 12, 20]) b.fill(h0 + d, h0 + d + 1, S - 3, G - 3, Tile.Solid);
  b.fill(h0 + 16, h0 + 17, G - 2, G - 1, Tile.Solid);
  b.sawAt(h0 + 8, G, 3, 'vertical', 50);
  b.coinsAt(h0 + 4, h0 + 21, G, 0.4);
  b.boxAt(h0 + 24, G);
  L.flat(4);
  flood(b, x, L.c - x);
  return done(L, x);
});

// =============================================================================================
// Luftpiraten: airships in the sky (the abyss between them is deadly), cannons, balloons, rigging.

// Two ships: across the rickety plank (it breaks!) or jump the gap; the second ship has a raised
// quarterdeck and a crow's nest above.
free('pirates', 'pirate-ships', 1, (b, x) => {
  const L = new Land(b, x);
  L.flat(14);
  plank(b, x + 5, x + 9, G - 5);
  b.coinsAt(x + 5, x + 9, G - 5, 1);
  b.boxAt(x + 7, G);
  const p0 = L.c;
  L.pit(5);
  for (let c = p0; c < p0 + 5; c++) b.set(c, G, Tile.Crumble);
  L.flat(6).step(G - 2).flat(8);
  b.coinsAt(L.c - 8, L.c - 1, G - 2, 1);
  L.step(G).flat(6);
  plank(b, p0 + 8, p0 + 16, G - 7);
  b.coinsAt(p0 + 9, p0 + 15, G - 7, 1);
  b.boxAt(p0 + 12, G - 7);
  return done(L, x);
});

// Broadside: an enemy cannon at the far end fires along the deck (jump the balls); the upper deck
// has its own cannon, and a hole in the main deck.
free('pirates', 'pirate-broadside', 2, (b, x) => {
  const L = new Land(b, x);
  L.flat(12).pit(3).flat(15);
  b.cannonAt(L.c - 2, G, 1, -1, 2.0, 26);
  plank(b, x + 6, x + 24, G - 5);
  b.cannonAt(x + 25, G - 4, 1, -1, 2.4, 20);
  b.padAt(x + 4, G, 'boost');
  b.coinsAt(x + 7, x + 23, G - 5, 1);
  b.boxAt(x + 15, G - 5);
  b.coinsAt(x + 16, x + 24, G, 0.4);
  L.flat(4);
  return done(L, x);
});

// Rigging: rope planks climb up the mast to the crow's nest and down again; the deck below has a
// hole and a cargo crate to jump.
free('pirates', 'pirate-mast', 2, (b, x) => {
  const L = new Land(b, x);
  L.flat(6);
  const d0 = L.c;
  L.flat(8).pit(3).flat(12);
  const steps: [number, number, number][] = [[0, 3, G - 3], [4, 7, G - 6], [9, 13, G - 8], [15, 18, G - 6], [19, 22, G - 3]];
  for (const [a, e, row] of steps) plank(b, d0 + a, d0 + e, row);
  b.coinsAt(d0 + 9, d0 + 13, G - 8, 2);
  b.boxAt(d0 + 11, G - 8);
  b.fill(d0 + 16, d0 + 17, G - 1, G - 1, Tile.Solid);
  b.sawAt(d0 + 5, G, 1, 'horizontal', 60);
  L.flat(4);
  return done(L, x);
});

// Balloons lift you from the low ship up to the high one; then down the gangway.
free('pirates', 'pirate-balloon', 1, (b, x) => {
  const L = new Land(b, x);
  L.flat(6);
  const p0 = L.c;
  L.pit(12);
  b.moverAt(p0 + 1, G - 1, 3, 'y', 2, 2.8);
  b.moverAt(p0 + 6, G - 3, 3, 'y', 2, 3.2);
  b.coinsAt(p0 + 2, p0 + 9, G - 6, 1, 1);
  L.step(G - 4).flat(10);
  b.boxAt(L.c - 5, G - 4);
  b.cannonAt(L.c - 1, G - 4, 1, -1, 2.6, 12);
  L.down(4).flat(6);
  return done(L, x);
});

// Pirate island: a floating rock with sandy hills, palm-leaf planks and a fort whose cannon fires
// at you.
free('pirates', 'pirate-island', 2, (b, x) => {
  const L = new Land(b, x);
  L.flat(4);
  L.pit(4);
  L.flat(3).up(2).flat(3).down(2).flat(4);
  b.coinsAt(L.c - 10, L.c - 6, G - 2, 2, 1);
  plank(b, L.c - 4, L.c + 1, G - 5);
  b.boxAt(L.c - 2, G - 5);
  L.flat(2).step(G - 3).flat(8);
  b.cannonAt(L.c - 1, G - 3, 1, -1, 2.2, 22);
  b.coinsAt(L.c - 7, L.c - 3, G - 3, 1);
  L.step(G).flat(4).pit(3).flat(5);
  return done(L, x);
});

// =============================================================================================
// Wüstenruinen: dunes, a stepped pyramid, quicksand valleys, an oasis, a canyon in the sandstorm.

// Rolling dunes with cacti in the dips; the last dip is quicksand.
free('desert', 'desert-dunes', 1, (b, x) => {
  const L = new Land(b, x);
  L.flat(4).up(2).flat(2).down(3).flat(3);
  b.spikesAt(L.c - 2, L.c - 2, G + 1);
  L.up(4).flat(3);
  b.coinsAt(L.c - 3, L.c - 1, G - 3, 2, 1);
  L.down(4).flat(5, Tile.Mud);
  L.up(3).flat(2).down(2).flat(4);
  b.spikesAt(L.c - 3, L.c - 3, G);
  b.boxAt(L.c - 1, G);
  L.flat(3);
  return done(L, x);
});

// A stepped pyramid: climb over the top, or run through the burial hall inside where crushers
// stamp down.
free('desert', 'desert-pyramid', 2, (b, x) => {
  const L = new Land(b, x);
  L.flat(5);
  const p0 = L.c;
  L.flat(30);
  // steps of the pyramid, 1 row up every 2 columns, top at G-9
  for (let i = 0; i < 30; i++) {
    const h = Math.min(Math.floor(i / 2) + 1, Math.floor((29 - i) / 2) + 1, 9);
    for (let r = G - h; r <= G - 5; r++) b.set(p0 + i, r, Tile.Solid);
  }
  // the hall inside (rows G-4..G-1) with its door on both sides
  b.crusherAt(p0 + 10, G - 5);
  b.crusherAt(p0 + 20, G - 5);
  b.coinsAt(p0 + 12, p0 + 18, G, 0.4);
  b.boxAt(p0 + 15, G);
  b.coinsAt(p0 + 9, p0 + 20, G - 9, 1);
  b.boxAt(p0 + 17, G - 9);
  L.flat(5);
  return done(L, x);
});

// Quicksand valley: the floor slows you right down; old column tops stick out of it as stepping
// stones, a boost pad waits at the far side.
free('desert', 'desert-quicksand', 2, (b, x) => {
  const L = new Land(b, x);
  L.flat(4).down(2).flat(22, Tile.Mud).up(2).flat(3);
  const v0 = x + 6;
  for (const d of [3, 9, 15]) b.fill(v0 + d, v0 + d + 2, G - 2, G + 1, Tile.Solid);
  b.coinsAt(v0 + 3, v0 + 17, G - 2, 2, 1);
  b.boxAt(v0 + 10, G - 2);
  b.coinsAt(v0 + 1, v0 + 20, G + 2, 1);
  b.padAt(L.c - 2, G, 'boost');
  L.flat(3);
  return done(L, x);
});

// An oasis: palm-leaf planks over a pond (swim across or hop the palms), dates as coins.
free('desert', 'desert-oasis', 1, (b, x) => {
  const L = new Land(b, x);
  L.flat(5);
  const o0 = L.c;
  L.down(3).flat(10).up(3).flat(5);
  b.zone('water', o0, o0 + 15, G, 25);
  plank(b, o0 + 1, o0 + 4, G - 3);
  plank(b, o0 + 7, o0 + 10, G - 4);
  plank(b, o0 + 13, o0 + 16, G - 3);
  b.coinsAt(o0 + 1, o0 + 16, G - 4, 2, 1);
  b.boxAt(o0 + 9, G + 3);
  b.coinsAt(o0 + 4, o0 + 12, G + 3, 1);
  return done(L, x);
});

// Canyon in the sandstorm: the rope bridge up top has headwind; the canyon floor has quicksand and
// cacti, but a boost pad.
free('desert', 'desert-canyon', 3, (b, x) => {
  const L = new Land(b, x);
  L.flat(4).up(4).flat(4);
  const c0 = L.c;
  L.down(4).flat(4, Tile.Mud).flat(4);
  b.spikesAt(L.c - 2, L.c - 1, G);
  b.padAt(L.c + 1, G, 'boost');
  L.flat(6).pit(3).flat(4, Tile.Mud).flat(4).up(4).flat(4);
  plank(b, c0, L.c - 5, G - 4);
  b.zone('wind', c0, L.c - 5, G - 9, G - 5, -480, 0);
  b.coinsAt(c0 + 2, L.c - 7, G - 4, 1);
  b.boxAt(c0 + 14, G - 4);
  L.down(4).flat(4);
  return done(L, x);
});

// =============================================================================================
// Pilz-Kristallhöhle: bouncy mushroom caps, crystal spikes, spore updrafts, a glowing maze.

// Bounce hills: mushroom pads in the dips throw you onto the caps up high.
free('shroom', 'shroom-bounce', 1, (b, x) => {
  const L = new Land(b, x);
  L.flat(4).down(2).flat(3);
  b.padAt(L.c - 2, L.g, 'jump');
  L.up(4).flat(3).down(2).flat(3);
  b.padAt(L.c - 2, L.g, 'jump');
  L.up(2).flat(2).down(2).flat(6);
  plank(b, x + 7, x + 12, G - 7);
  plank(b, x + 17, x + 24, G - 8);
  b.coinsAt(x + 7, x + 24, G - 8, 2, 1);
  b.boxAt(x + 20, G - 8);
  b.spikesAt(L.c - 3, L.c - 2, G);
  L.flat(3);
  return done(L, x);
});

// Crystal cave: crystal spikes on the floor, a crystal beam to slide under, and a crumbling crystal
// bridge over a crack.
free('shroom', 'shroom-crystal', 2, (b, x) => {
  const L = new Land(b, x);
  L.flat(8);
  b.spikesAt(x + 4, x + 5, G);
  b.fill(x + 7, x + 12, G - 3, G - 2, Tile.Solid);
  L.flat(6);
  const p0 = L.c;
  L.pit(8);
  for (let c = p0; c < p0 + 8; c++) b.set(c, G, Tile.Crumble);
  L.flat(4).up(2).flat(4).down(2).flat(4);
  b.spikesAt(L.c - 6, L.c - 5, G);
  b.coinsAt(x + 7, x + 12, G, 0.4);
  plank(b, p0 - 2, p0 + 10, G - 5);
  b.coinsAt(p0 - 1, p0 + 9, G - 5, 1);
  b.boxAt(p0 + 4, G - 5);
  return done(L, x);
});

// Spore lift: a crack in the floor blows spores upwards; ride them onto the high mushroom ledge and
// bounce down the other side.
free('shroom', 'shroom-spores', 2, (b, x) => {
  const L = new Land(b, x);
  L.flat(5);
  const p0 = L.c;
  L.pit(4);
  b.zone('wind', p0, p0 + 3, 9, 25, 0, -3000);
  b.coinsAt(p0 + 1, p0 + 2, 13, 0);
  b.coinsAt(p0 + 1, p0 + 2, 16, 0);
  L.step(G - 6).flat(8);
  b.boxAt(L.c - 4, G - 6);
  b.coinsAt(L.c - 7, L.c - 1, G - 6, 1);
  L.down(3).flat(2).down(3).flat(3);
  b.padAt(L.c - 2, G, 'jump');
  L.flat(4);
  return done(L, x);
});

// Cap platforms over a swampy floor: mushroom caps with pads on them, a mega mushroom at the start.
free('shroom', 'shroom-caps', 2, (b, x) => {
  const L = new Land(b, x);
  L.flat(5);
  b.padAt(x + 3, G, 'mega');
  L.flat(26, Tile.Mud);
  const c0 = x + 5;
  const caps: [number, number, number][] = [[2, 5, G - 3], [8, 11, G - 5], [14, 17, G - 4], [20, 23, G - 6]];
  for (const [a, e, row] of caps) {
    island(b, c0 + a, c0 + e, row);
    b.coinsAt(c0 + a, c0 + e, row, 1);
  }
  b.padAt(c0 + 15, G - 4, 'jump');
  b.boxAt(c0 + 21, G - 6);
  b.boxAt(c0 + 13, G);
  L.flat(5);
  return done(L, x);
});

// Glow maze: two levels of crystal passages, a slide gap, pendulum spores swinging through.
free('shroom', 'shroom-maze', 3, (b, x) => {
  const L = new Land(b, x);
  L.flat(4);
  const m0 = L.c;
  L.flat(28);
  b.fill(m0 + 2, m0 + 25, G - 5, G - 5, Tile.Solid);
  b.fill(m0 + 8, m0 + 11, G - 4, G - 2, Tile.Solid);
  b.fill(m0 + 17, m0 + 20, G - 4, G - 2, Tile.Solid);
  b.fill(m0 + 12, m0 + 13, G - 9, G - 6, Tile.Solid);
  b.pendulumAt(m0 + 22, G - 11, 120);
  b.coinsAt(m0 + 8, m0 + 11, G, 0.4);
  b.coinsAt(m0 + 17, m0 + 20, G, 0.4);
  b.coinsAt(m0 + 3, m0 + 24, G - 5, 1);
  b.boxAt(m0 + 15, G);
  b.boxAt(m0 + 18, G - 5);
  L.flat(4);
  return done(L, x);
});

// =============================================================================================
// Dschungeltempel (more pieces next to the ones in freeform.ts): temple stairs, a river gorge.

// Temple stairs: up the overgrown steps to the top where crushers stamp; vine planks above the
// stairs hold the coins.
free('jungle', 'jungle-stairs', 2, (b, x) => {
  const L = new Land(b, x);
  L.flat(4).up(3).flat(2).up(3);
  const t0 = L.c;
  L.flat(14);
  b.crusherAt(t0 + 4, G - 11);
  b.crusherAt(t0 + 10, G - 11);
  b.coinsAt(t0 + 1, t0 + 13, G - 6, 0.4);
  b.boxAt(t0 + 7, G - 6);
  L.down(3).flat(2).down(3).flat(4);
  plank(b, x + 3, x + 8, G - 5);
  b.coinsAt(x + 3, x + 8, G - 5, 1);
  b.spikesAt(L.c - 2, L.c - 1, G);
  L.flat(3);
  return done(L, x);
});

// River gorge: a vine bridge with crumbling boards and swinging saws, or drop into the river and
// let the current carry you to the far bank.
free('jungle', 'jungle-gorge', 2, (b, x) => {
  const L = new Land(b, x);
  L.flat(5);
  const g0 = L.c;
  L.step(G + 4).flat(16).up(4).flat(6);
  b.zone('water', g0, g0 + 19, G + 1, 25);
  b.zone('wind', g0, g0 + 15, G + 1, G + 3, 650, 0);
  for (let c = g0; c <= g0 + 15; c++) b.set(c, G, (c - g0) % 5 === 0 ? Tile.Solid : Tile.Crumble);
  b.pendulumAt(g0 + 5, G - 7, 110);
  b.pendulumAt(g0 + 11, G - 7, 110);
  b.coinsAt(g0 + 1, g0 + 14, G + 3, 1);
  b.boxAt(g0 + 8, G);
  b.coinsAt(g0 + 2, g0 + 13, G, 1);
  return done(L, x);
});
