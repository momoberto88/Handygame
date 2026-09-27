import type { WorldId } from '../types';
import { customCourse, isCustomId } from './customTrack';

/** A fixed, named track: always the same pieces in the same order. */
export interface CourseDef {
  id: string;
  name: string;
  world: WorldId;
  difficulty: 1 | 2 | 3;
  /** Seed for small details (saw phases etc.) so the course looks the same every time. */
  seed: number;
  modules: string[];
  /** false: the pieces bring their own landscape (free-form pieces), no terrain steps between them. */
  terrain?: false;
  /** Editor tracks: pieces from any world, each with its own terrain height. */
  pieces?: { world: WorldId; name: string; dy: number }[];
}

export const COURSES: CourseDef[] = [
  {
    id: 'lianen-lauf',
    name: 'Lianen-Lauf',
    world: 'jungle',
    difficulty: 1,
    seed: 101,
    modules: ['canopy', 'pad-grove', 'ruins', 'vine-swing', 'canopy', 'waterfall', 'pad-grove', 'temple', 'ruins', 'vine-swing', 'canopy', 'pad-grove', 'waterfall', 'ruins', 'vine-swing', 'canopy'],
  },
  {
    id: 'stampfer-tempel',
    name: 'Tempel der Stampfer',
    world: 'jungle',
    difficulty: 2,
    seed: 102,
    modules: ['temple', 'vine-swing', 'chimney', 'ruins', 'temple', 'waterfall', 'canopy', 'chimney', 'vine-swing', 'temple', 'pad-grove', 'ruins', 'waterfall', 'chimney', 'temple', 'temple'],
  },
  {
    id: 'zahnrad-express',
    name: 'Zahnrad-Express',
    world: 'mine',
    difficulty: 1,
    seed: 201,
    terrain: false,
    modules: ['mine-rails', 'mine-exit', 'mine-cavern', 'mine-rails', 'mine-trestle', 'mine-lift', 'mine-rails', 'mine-cavern', 'mine-exit', 'mine-trestle', 'mine-rails', 'mine-lift'],
  },
  {
    id: 'tiefer-schacht',
    name: 'Tiefer Schacht',
    world: 'mine',
    difficulty: 3,
    seed: 202,
    terrain: false,
    modules: ['mine-shaft', 'mine-lift', 'mine-trestle', 'mine-cavern', 'mine-shaft', 'mine-rails', 'mine-lift', 'mine-shaft', 'mine-trestle', 'mine-cavern', 'mine-shaft', 'mine-lift'],
  },
  {
    id: 'wolkenhuepfer',
    name: 'Wolkenhüpfer',
    world: 'sky',
    difficulty: 1,
    seed: 301,
    modules: ['islands', 'mega-bounce', 'arches', 'islands', 'updraft', 'crumble-bridge', 'mega-bounce', 'islands', 'windy-ridge', 'arches', 'updraft', 'islands', 'crumble-bridge', 'arches', 'arches', 'islands'],
  },
  {
    id: 'sturm-inseln',
    name: 'Sturm über den Inseln',
    world: 'sky',
    difficulty: 3,
    seed: 302,
    modules: ['windy-ridge', 'cloud-hop', 'updraft', 'crumble-bridge', 'islands', 'cloud-hop', 'windy-ridge', 'arches', 'updraft', 'cloud-hop', 'crumble-bridge', 'islands', 'cloud-hop', 'updraft', 'cloud-hop', 'windy-ridge'],
  },
  {
    id: 'neon-naechte',
    name: 'Neon-Nächte',
    world: 'neon',
    difficulty: 2,
    seed: 401,
    modules: ['rooftops', 'billboard', 'laser-hall', 'elevators', 'rooftops', 'monorail', 'billboard', 'laser-hall', 'elevators', 'rooftops', 'monorail', 'boost-highway', 'monorail', 'laser-hall', 'rooftops', 'rooftops'],
  },
  {
    id: 'laser-highway',
    name: 'Laser-Highway',
    world: 'neon',
    difficulty: 3,
    seed: 402,
    modules: ['boost-highway', 'laser-hall', 'hover-pads', 'monorail', 'boost-highway', 'elevators', 'laser-hall', 'hover-pads', 'rooftops', 'boost-highway', 'laser-hall', 'hover-pads', 'elevators', 'hover-pads', 'boost-highway', 'boost-highway'],
  },
  {
    id: 'versunkener-tempel',
    name: 'Versunkener Tempel',
    world: 'water',
    difficulty: 2,
    seed: 501,
    modules: ['flooded-hall', 'bubble-lift', 'current', 'sunken-columns', 'air-pocket', 'reef', 'flooded-hall', 'current', 'bubble-lift', 'sunken-columns', 'air-pocket', 'reef', 'reef', 'current', 'sunken-columns', 'flooded-hall'],
  },
  {
    id: 'kanonen-kurs',
    name: 'Kanonen-Kurs',
    world: 'pirates',
    difficulty: 3,
    seed: 601,
    modules: ['decks', 'cannon-deck', 'rigging', 'balloon-lift', 'plank-walk', 'broadside', 'decks', 'rigging', 'cannon-deck', 'plank-walk', 'balloon-lift', 'broadside', 'broadside', 'rigging', 'plank-walk', 'decks'],
  },
  {
    id: 'pyramiden-rallye',
    name: 'Pyramiden-Rallye',
    world: 'desert',
    difficulty: 2,
    seed: 701,
    modules: ['dunes', 'cactus-field', 'pyramid', 'quicksand', 'sandstorm', 'dunes', 'obelisks', 'pyramid', 'cactus-field', 'sandstorm', 'quicksand', 'dunes', 'dunes', 'pyramid', 'sandstorm', 'dunes'],
  },
  {
    id: 'testgelaende',
    name: 'Testgelände',
    world: 'jungle',
    difficulty: 2,
    seed: 901,
    terrain: false,
    modules: ['free-valley', 'free-tunnel', 'free-islands', 'free-cliff', 'free-fork', 'free-slide', 'free-islands', 'free-valley', 'free-tunnel', 'free-fork'],
  },
  {
    id: 'pilz-trampolin',
    name: 'Pilz-Trampolin',
    world: 'shroom',
    difficulty: 1,
    seed: 801,
    modules: ['bounce-garden', 'pendulums', 'spore-lift', 'shroom-bridges', 'bounce-garden', 'crystal-cave', 'spore-lift', 'glow-maze', 'bounce-garden', 'pendulums', 'shroom-bridges', 'crystal-cave', 'crystal-cave', 'spore-lift', 'pendulums', 'bounce-garden'],
  },
];

export interface CupDef {
  id: string;
  name: string;
  difficulty: 1 | 2 | 3;
  courses: string[];
}

/** Single-player cups against the bots. */
export const CUPS: CupDef[] = [
  { id: 'pilz', name: 'Pilz-Cup', difficulty: 1, courses: ['lianen-lauf', 'wolkenhuepfer', 'pilz-trampolin', 'zahnrad-express'] },
  { id: 'zahnrad', name: 'Zahnrad-Cup', difficulty: 2, courses: ['stampfer-tempel', 'neon-naechte', 'versunkener-tempel', 'pyramiden-rallye'] },
  { id: 'blitz', name: 'Blitz-Cup', difficulty: 3, courses: ['kanonen-kurs', 'sturm-inseln', 'tiefer-schacht', 'laser-highway'] },
];

/** Display name of any course id (fixed or editor track); falls back to the id. */
export function courseName(id: string): string {
  try {
    return courseById(id).name;
  } catch {
    return id;
  }
}

export function courseById(id: string): CourseDef {
  const c = isCustomId(id) ? customCourse(id) : COURSES.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown course ${id}`);
  return c;
}
