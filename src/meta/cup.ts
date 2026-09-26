import type { RacerInfo } from '../net/session';
import { COURSES } from '../sim/track/courses';
import { Rng } from '../sim/rng';

/** Cup points per finishing place (like Mario Kart, scaled to four racers). */
export const CUP_POINTS = [10, 6, 3, 1];

export interface CupEntry {
  key: string;
  name: string;
  character: string;
  isBot: boolean;
  points: number;
  /** Points from the latest race (for the "+6" next to the table). */
  last: number;
}

/**
 * A running cup: a list of courses raced one after another with points per place.
 * Used offline (against bots) and by the host in multiplayer; clients get a copy in every start
 * message so they can show the same table.
 */
export interface CupState {
  /** Fixed cup id ('pilz', …) or 'custom' / 'random'. */
  id: string;
  name: string;
  courses: string[];
  /** Index of the race that is being driven or was driven last. */
  index: number;
  table: CupEntry[];
  /** Race index whose result is already in the table (guards against counting twice). */
  counted: number;
  /** Offline cups keep the same opponents for every race. */
  racers?: RacerInfo[];
  /** Picks the bots, so a cup keeps the same bot opponents in every race. */
  seed: number;
}

/**
 * Racers are matched between races by this key, so bots and players keep their points. Players are
 * told apart by their seat (two friends may both be called "Hoppel"), bots by their character.
 */
export function racerKey(r: Pick<RacerInfo, 'id' | 'name' | 'character' | 'isBot'>): string {
  return r.isBot ? `bot:${r.character}` : `p:${r.id}:${r.name}`;
}

export function newCup(id: string, name: string, courses: string[], seed: number): CupState {
  return { id, name, courses: [...courses], index: 0, table: [], counted: -1, seed };
}

/** Adds the result of race `cup.index`; `order` is the racers from first to last place. */
export function addRaceResult(cup: CupState, order: RacerInfo[]) {
  if (cup.counted >= cup.index) return;
  cup.counted = cup.index;
  for (const e of cup.table) e.last = 0;
  order.forEach((r, place) => {
    const key = racerKey(r);
    let e = cup.table.find((x) => x.key === key);
    if (!e) {
      e = { key, name: r.name, character: r.character, isBot: r.isBot, points: 0, last: 0 };
      cup.table.push(e);
    }
    const pts = CUP_POINTS[place] ?? 0;
    e.points += pts;
    e.last = pts;
  });
}

/** Table sorted by points; ties are broken by the latest race. */
export function cupRanking(cup: CupState): CupEntry[] {
  return [...cup.table].sort((a, b) => b.points - a.points || b.last - a.last);
}

export function isLastRace(cup: CupState): boolean {
  return cup.index >= cup.courses.length - 1;
}

/** `count` different courses in random order (repeats only when more races than courses). */
export function randomCourses(count: number, seed: number): string[] {
  const rng = new Rng(seed);
  const out: string[] = [];
  let pool: string[] = [];
  while (out.length < count) {
    if (!pool.length) pool = COURSES.map((c) => c.id).filter((id) => id !== out[out.length - 1]);
    out.push(pool.splice(rng.int(pool.length), 1)[0]);
  }
  return out;
}

// The cup currently being played on this phone (offline, or hosted/joined online).
let active: CupState | null = null;

export function activeCup(): CupState | null {
  return active;
}

export function setActiveCup(cup: CupState | null) {
  active = cup;
  // visible from the browser console / automated tests
  (globalThis as { chaosCup?: CupState | null }).chaosCup = cup;
}
