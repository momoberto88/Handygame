import { DT } from '../sim/constants';
import type { RunnerState } from '../sim/types';

/** Recorded best run on one course: positions every few ticks, replayed as a see-through runner. */
export interface Ghost {
  courseId: string;
  time: number;
  character: string;
  /** Flat list: x, y, flags (1 grounded, 2 sliding, 4 dead) per sample. */
  frames: number[];
}

const KEY = 'chaos-sprint-ghosts-v1';
/** One sample every this many ticks (60 / 3 = 20 per second). */
export const GHOST_EVERY = 3;
const MAX_GHOSTS = 40;

function loadAll(): Record<string, Ghost> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Ghost>;
  } catch {
    return {};
  }
}

export function loadGhost(courseId: string): Ghost | null {
  return loadAll()[courseId] ?? null;
}

/** Keeps the ghost if it is the fastest run on that course so far. Returns true if saved. */
export function offerGhost(g: Ghost): boolean {
  const all = loadAll();
  const old = all[g.courseId];
  if (old && old.time <= g.time) return false;
  all[g.courseId] = g;
  const ids = Object.keys(all);
  if (ids.length > MAX_GHOSTS) delete all[ids[0]];
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
    return true;
  } catch {
    return false; // storage full or blocked: no ghost, no problem
  }
}

/** Records the local runner during a race. */
export class GhostRecorder {
  readonly frames: number[] = [];

  /**
   * Call as often as convenient (e.g. once per drawn frame). Sample i always belongs to race time
   * i * GHOST_EVERY ticks, so slow frames just repeat the current position for the skipped slots.
   */
  sample(_tick: number, raceTime: number, r: RunnerState) {
    if (raceTime < 0 || r.mode === 'finished') return;
    const idx = Math.floor(raceTime / (GHOST_EVERY * DT) + 1e-6);
    const flags = (r.grounded ? 1 : 0) | (r.sliding ? 2 : 0) | (r.mode === 'dead' ? 4 : 0);
    while (this.frames.length / 3 <= idx) this.frames.push(Math.round(r.x), Math.round(r.y), flags);
  }
}

/** Where the ghost is at race time t (seconds after the start), smoothly interpolated. */
export function ghostAt(g: Ghost, t: number, into: RunnerState): boolean {
  const step = GHOST_EVERY * DT;
  const n = g.frames.length / 3;
  if (t < 0 || n < 2) return false;
  const f = t / step;
  const i = Math.floor(f);
  if (i >= n - 1) return false; // the ghost has finished
  const k = f - i;
  const a = i * 3;
  const b = a + 3;
  const x = g.frames[a] + (g.frames[b] - g.frames[a]) * k;
  into.vx = (g.frames[b] - g.frames[a]) / step;
  into.vy = (g.frames[b + 1] - g.frames[a + 1]) / step;
  into.x = x;
  into.y = g.frames[a + 1] + (g.frames[b + 1] - g.frames[a + 1]) * k;
  const flags = g.frames[a + 2];
  into.grounded = (flags & 1) !== 0;
  into.sliding = (flags & 2) !== 0;
  into.mode = 'run';
  return (flags & 4) === 0;
}
