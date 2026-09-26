import { WORLD_IDS, type WorldId } from '../types';
import type { CourseDef } from './courses';
import { MODULES, type ModuleDef } from './modules';

/**
 * A track built in the editor: a row of pieces from any world, each at its own terrain height,
 * drawn in the art style of `world`.
 *
 * It travels as a short code (in links, lobby messages and course ids "custom:<code>"):
 *   "1" version · 1 char art world · 2 chars per piece (module index, height) · "~" · name
 * Module indices refer to the order of MODULES, so new pieces must only ever be appended there.
 */
export interface CustomTrack {
  name: string;
  world: WorldId;
  pieces: { world: WorldId; name: string; dy: number }[];
}

export const CUSTOM_PREFIX = 'custom:';
export const MIN_PIECES = 3;
export const MAX_PIECES = 24;
export const MIN_DY = -4;
export const MAX_DY = 3;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function encodeTrack(t: CustomTrack): string {
  let s = '1' + ALPHABET[WORLD_IDS.indexOf(t.world)];
  for (const p of t.pieces) {
    const i = MODULES.findIndex((m) => m.world === p.world && m.name === p.name);
    if (i < 0) throw new Error(`Unknown piece ${p.world}/${p.name}`);
    s += ALPHABET[i] + ALPHABET[clampDy(p.dy) - MIN_DY];
  }
  return `${s}~${encodeURIComponent(t.name.slice(0, 24))}`;
}

/** Returns null for codes that are broken or come from a newer app version. */
export function decodeTrack(code: string): CustomTrack | null {
  const [body, rawName = ''] = code.split('~');
  if (!body || body[0] !== '1' || body.length < 2 || body.length % 2 !== 0) return null;
  const world = WORLD_IDS[ALPHABET.indexOf(body[1])];
  if (!world) return null;
  const pieces: CustomTrack['pieces'] = [];
  for (let i = 2; i < body.length; i += 2) {
    const m: ModuleDef | undefined = MODULES[ALPHABET.indexOf(body[i])];
    const dy = ALPHABET.indexOf(body[i + 1]) + MIN_DY;
    if (!m || dy < MIN_DY || dy > MAX_DY) return null;
    pieces.push({ world: m.world, name: m.name, dy });
  }
  if (pieces.length < 1 || pieces.length > MAX_PIECES) return null;
  let name = 'Eigene Strecke';
  try {
    name = decodeURIComponent(rawName) || name;
  } catch {
    // keep the default name
  }
  return { name, world, pieces };
}

export function clampDy(dy: number): number {
  return Math.max(MIN_DY, Math.min(MAX_DY, Math.round(dy)));
}

export function isCustomId(id: string): boolean {
  return id.startsWith(CUSTOM_PREFIX);
}

export function customId(t: CustomTrack): string {
  return CUSTOM_PREFIX + encodeTrack(t);
}

/** Small stable number from the code, used as the detail seed of the track. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) % 100000;
}

/** A custom track as a course (null if the code is broken). */
export function customCourse(id: string): CourseDef | null {
  const t = decodeTrack(id.slice(CUSTOM_PREFIX.length));
  if (!t) return null;
  const difficulty = Math.round(t.pieces.reduce((a, p) => a + (MODULES.find((m) => m.world === p.world && m.name === p.name)?.difficulty ?? 1), 0) / t.pieces.length);
  return {
    id,
    name: t.name,
    world: t.world,
    difficulty: Math.max(1, Math.min(3, difficulty)) as 1 | 2 | 3,
    seed: hash(id),
    modules: t.pieces.map((p) => p.name),
    pieces: t.pieces,
  };
}
