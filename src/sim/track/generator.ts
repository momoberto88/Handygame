import { Rng } from '../rng';
import type { Track, WorldId } from '../types';
import { MID, TrackBuilder } from './builder';
import { courseById } from './courses';
import { modulesFor, moduleByName, type ModuleDef } from './modules';

export interface TrackOptions {
  seed: number;
  world: WorldId;
  /** Approximate length in tiles of the random part (ignored for courses). */
  lengthTiles?: number;
  /** Fixed module sequence (used by courses and tests). */
  chunkNames?: string[];
  /** Build one of the named courses. */
  courseId?: string;
  /** Let the terrain rise and fall between pieces (default: on, except for bare test sequences). */
  terrain?: boolean;
}

/**
 * How the landscape of each world rises and falls between pieces, in rows (negative = up).
 * The mine and the sunken temple lead down into the depths, sky islands and airships jump around.
 */
const TERRAIN: Record<WorldId, { min: number; max: number; step: number; drift: number }> = {
  jungle: { min: -3, max: 2, step: 2, drift: 0 },
  mine: { min: -1, max: 3, step: 2, drift: 0.5 },
  sky: { min: -4, max: 2, step: 3, drift: -0.2 },
  neon: { min: -3, max: 1, step: 2, drift: -0.3 },
  water: { min: -1, max: 3, step: 2, drift: 0.5 },
  pirates: { min: -4, max: 1, step: 3, drift: 0 },
  desert: { min: -3, max: 2, step: 2, drift: 0 },
  shroom: { min: -2, max: 3, step: 2, drift: 0.2 },
};

/** Terrain height for each piece: a deterministic random walk inside the world's limits. */
export function terrainProfile(world: WorldId, seed: number, count: number): number[] {
  const t = TERRAIN[world];
  const rng = new Rng(seed ^ 0x7e11a1);
  const out: number[] = [];
  let dy = 0;
  for (let i = 0; i < count; i++) {
    if (i > 0 && rng.next() < 0.75) {
      let step = rng.int(t.step * 2 + 1) - t.step;
      if (rng.next() < Math.abs(t.drift)) step += Math.sign(t.drift);
      if (step === 0) step = rng.next() < 0.5 ? -1 : 1;
      dy = Math.max(t.min, Math.min(t.max, dy + step));
    }
    out.push(dy);
  }
  return out;
}

const START_WIDTH = 14;
const FINISH_WIDTH = 30;
const START_COL = 4;
const FINISH_OFFSET = 4;

function pickSequence(rng: Rng, world: WorldId, lengthTiles: number): ModuleDef[] {
  const pool = modulesFor(world);
  const seq: ModuleDef[] = [];
  let len = 0;
  let last = '';
  while (len < lengthTiles) {
    const progress = len / lengthTiles;
    const maxDifficulty = progress < 0.2 ? 1 : progress < 0.45 ? 2 : 3;
    let candidates = pool.filter((m) => m.difficulty <= maxDifficulty && m.name !== last);
    if (!candidates.length) candidates = pool.filter((m) => m.name !== last);
    const m = rng.pick(candidates);
    seq.push(m);
    last = m.name;
    len += 32;
  }
  return seq;
}

export function generateTrack(opts: TrackOptions): Track {
  let world = opts.world;
  let names = opts.chunkNames;
  let detailSeed = opts.seed;
  if (opts.courseId) {
    const course = courseById(opts.courseId);
    world = course.world;
    names = course.modules;
    detailSeed = course.seed;
  }
  const rng = new Rng(detailSeed ^ 0x51f0a3);
  const b = new TrackBuilder(world, rng);
  b.standard(0, START_WIDTH - 1);
  b.mark('start', 0, START_WIDTH);
  const modules = names ? names.map((n) => moduleByName(world, n)) : pickSequence(rng, world, opts.lengthTiles ?? 380);
  const terrain = opts.terrain ?? (!opts.chunkNames || !!opts.courseId);
  const heights = terrain ? terrainProfile(world, detailSeed, modules.length) : modules.map(() => 0);
  let x = START_WIDTH;
  modules.forEach((m, i) => {
    if (heights[i] !== b.dy) x += b.shiftTerrain(x, heights[i]);
    // an item box at the entrance of every piece, on a varying storey
    b.box(x + 1, ([0, 1, 2] as const)[rng.int(3)]);
    x += m.build(b, x);
  });
  if (b.dy !== 0) x += b.shiftTerrain(x, 0);
  b.standard(x, x + FINISH_WIDTH - 1);
  b.mark('finish', x, FINISH_WIDTH);
  b.coins(x + 8, x + 14, MID);
  return b.build(opts.seed, START_COL, x + FINISH_OFFSET);
}
