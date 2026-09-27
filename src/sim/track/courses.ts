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
    terrain: false,
    modules: ['sky-hop', 'sky-launch', 'sky-updraft', 'sky-hop', 'sky-bridge', 'sky-stairs', 'sky-launch', 'sky-hop', 'sky-updraft', 'sky-bridge'],
  },
  {
    id: 'sturm-inseln',
    name: 'Sturm über den Inseln',
    world: 'sky',
    difficulty: 3,
    seed: 302,
    terrain: false,
    modules: ['sky-ridge', 'sky-stairs', 'sky-updraft', 'sky-bridge', 'sky-ridge', 'sky-hop', 'sky-stairs', 'sky-updraft', 'sky-ridge', 'sky-bridge'],
  },
  {
    id: 'neon-naechte',
    name: 'Neon-Nächte',
    world: 'neon',
    difficulty: 2,
    seed: 401,
    terrain: false,
    modules: ['neon-roofs', 'neon-lasers', 'neon-tower', 'neon-roofs', 'neon-highway', 'neon-lasers', 'neon-tower', 'neon-roofs', 'neon-hover', 'neon-roofs', 'neon-lasers', 'neon-highway'],
  },
  {
    id: 'laser-highway',
    name: 'Laser-Highway',
    world: 'neon',
    difficulty: 3,
    seed: 402,
    terrain: false,
    modules: ['neon-highway', 'neon-lasers', 'neon-hover', 'neon-tower', 'neon-highway', 'neon-lasers', 'neon-hover', 'neon-highway', 'neon-tower', 'neon-lasers', 'neon-roofs', 'neon-hover'],
  },
  {
    id: 'versunkener-tempel',
    name: 'Versunkener Tempel',
    world: 'water',
    difficulty: 2,
    seed: 501,
    terrain: false,
    modules: ['water-reef', 'water-current', 'water-bubbles', 'water-columns', 'water-trench', 'water-reef', 'water-current', 'water-columns', 'water-bubbles', 'water-trench', 'water-reef', 'water-columns'],
  },
  {
    id: 'kanonen-kurs',
    name: 'Kanonen-Kurs',
    world: 'pirates',
    difficulty: 3,
    seed: 601,
    terrain: false,
    modules: ['pirate-ships', 'pirate-broadside', 'pirate-mast', 'pirate-balloon', 'pirate-island', 'pirate-broadside', 'pirate-ships', 'pirate-mast', 'pirate-island', 'pirate-balloon', 'pirate-broadside', 'pirate-mast', 'pirate-ships'],
  },
  {
    id: 'pyramiden-rallye',
    name: 'Pyramiden-Rallye',
    world: 'desert',
    difficulty: 2,
    seed: 701,
    terrain: false,
    modules: ['desert-dunes', 'desert-pyramid', 'desert-quicksand', 'desert-oasis', 'desert-canyon', 'desert-dunes', 'desert-pyramid', 'desert-oasis', 'desert-quicksand', 'desert-canyon', 'desert-dunes', 'desert-pyramid'],
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
