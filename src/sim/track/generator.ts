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
  let x = START_WIDTH;
  for (const m of modules) {
    // an item box at the entrance of every piece, on a varying storey
    b.box(x + 1, ([0, 1, 2] as const)[rng.int(3)]);
    x += m.build(b, x);
  }
  b.standard(x, x + FINISH_WIDTH - 1);
  b.mark('finish', x, FINISH_WIDTH);
  b.coins(x + 8, x + 14, MID);
  return b.build(opts.seed, START_COL, x + FINISH_OFFSET);
}
