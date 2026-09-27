export const Tile = {
  Empty: 0,
  Solid: 1,
  /** 45° ramp rising to the right: surface goes from the bottom-left to the top-right corner. */
  SlopeUp: 2,
  /** 45° ramp falling to the right. */
  SlopeDown: 3,
  /** One-way platform: can be jumped through from below. */
  Platform: 4,
  Spikes: 5,
  /** Solid ground whose surface pushes runners forward / backward. */
  ConveyorFwd: 6,
  ConveyorBack: 7,
  /** Solid ground that slows runners down (mud, quicksand). */
  Mud: 8,
  /** Solid ground that breaks shortly after someone stands on it and grows back later. */
  Crumble: 9,
} as const;
export type TileId = (typeof Tile)[keyof typeof Tile];

/** Every tile type that behaves like solid ground for collisions. */
export function isSolidTile(t: number): boolean {
  return t === Tile.Solid || t === Tile.ConveyorFwd || t === Tile.ConveyorBack || t === Tile.Mud || t === Tile.Crumble;
}

export type WorldId = 'jungle' | 'mine' | 'sky' | 'neon' | 'water' | 'pirates' | 'desert' | 'shroom';
export const WORLD_IDS: WorldId[] = ['jungle', 'mine', 'sky', 'neon', 'water', 'pirates', 'desert', 'shroom'];

export type SawMotion = 'still' | 'vertical' | 'horizontal' | 'pendulum';

export interface Saw {
  x: number;
  y: number;
  motion: SawMotion;
  /** Swing range in px (vertical/horizontal) or rope length (pendulum). */
  range: number;
  phase: number;
}

/** Moving platform (elevator / hover plank). Its top surface is one-way like a ledge. */
export interface Mover {
  /** Centre x and top y at rest. */
  x: number;
  y: number;
  /** Width in px. */
  w: number;
  axis: 'x' | 'y';
  range: number;
  period: number;
  phase: number;
}

/** Areas with special physics: water (floaty swimming) or wind (updraft / headwind). */
export interface Zone {
  kind: 'water' | 'wind';
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Wind force in px/s² (ignored for water). */
  fx: number;
  fy: number;
}

/** Vertical laser beam that switches on and off in a rhythm. */
export interface Laser {
  x: number;
  y0: number;
  y1: number;
  on: number;
  off: number;
  phase: number;
}

/** Cannon that fires a ball horizontally every `period` seconds. */
export interface Cannon {
  x: number;
  y: number;
  dir: -1 | 1;
  period: number;
  phase: number;
  speed: number;
  range: number;
}

export interface Crusher {
  x: number;
  /** Bottom of the ceiling tile the crusher hangs from. */
  anchorY: number;
  /** How far the head travels down. */
  drop: number;
  phase: number;
}

export interface Pad {
  kind: 'jump' | 'boost' | 'mega';
  x: number;
  /** Floor height the pad sits on. */
  y: number;
}

export interface Pickup {
  x: number;
  y: number;
}

export interface Track {
  seed: number;
  world: WorldId;
  cols: number;
  rows: number;
  tiles: Uint8Array;
  saws: Saw[];
  crushers: Crusher[];
  pads: Pad[];
  boxes: Pickup[];
  coins: Pickup[];
  movers: Mover[];
  zones: Zone[];
  lasers: Laser[];
  cannons: Cannon[];
  startX: number;
  /** Feet height where runners line up. */
  startY: number;
  finishX: number;
  /** Names of the modules the track was built from, for debugging and tests. */
  chunks: { name: string; col: number; width: number }[];
}

export type DeathKind = 'squash' | 'slice' | 'zap' | 'trap' | 'boom' | 'spike' | 'fall';
export type ItemKind = 'saw' | 'trap' | 'lightning' | 'shield' | 'turbo' | 'rocket' | 'ink' | 'magnet';
export const ITEM_KINDS: ItemKind[] = ['saw', 'trap', 'lightning', 'shield', 'turbo', 'rocket', 'ink', 'magnet'];
export type RunnerMode = 'run' | 'dead' | 'finished';

/** Special ability of each character, charged by coins, boxes and time. */
export type AbilityKind = 'megajump' | 'sprint' | 'spores' | 'tongue' | 'steal' | 'quake' | 'mask' | 'bash' | 'fireworks';
export const ABILITY_KINDS: AbilityKind[] = ['megajump', 'sprint', 'spores', 'tongue', 'steal', 'quake', 'mask', 'bash', 'fireworks'];

/** Flat on purpose: it is cloned for bot look-ahead and copied into network snapshots. */
export interface RunnerState {
  id: number;
  x: number;
  /** Feet position. */
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  onWall: boolean;
  /** Pressing against a wall while on the ground. */
  blocked: boolean;
  sliding: boolean;
  /** Slamming down (slide pressed in the air). */
  diving: boolean;
  /** Mid-air jumps left (double jump). */
  airJumps: number;
  /** Index of the moving platform the runner stands on, or -1. */
  onMover: number;
  inWater: boolean;
  /** -1 uphill, 0 flat, 1 downhill. */
  slope: number;
  coyote: number;
  jumpBuffer: number;
  prevJump: boolean;
  canCut: boolean;
  mode: RunnerMode;
  deathKind: DeathKind | null;
  deathTimer: number;
  ghost: number;
  safeX: number;
  safeY: number;
  item: ItemKind | null;
  rolling: number;
  shield: number;
  boost: number;
  magnet: number;
  ink: number;
  /** Ability charge 0..1 (usable at 1). */
  charge: number;
  /** Seconds of being dazed (runs slowly) after spores or a shock wave. */
  stun: number;
  coins: number;
  finishTime: number;
  place: number;
  deaths: number;
  /** Running speed factor (easy bots run a little slower than people; 1 for everybody else). */
  pace: number;
}

export interface RunnerInput {
  jump: boolean;
  slide: boolean;
  /** 1 = use item forward, -1 = use item backward, 0 = nothing. */
  use: -1 | 0 | 1;
  /** Fire the character's special ability (when fully charged). */
  ability?: boolean;
}

export const NO_INPUT: RunnerInput = { jump: false, slide: false, use: 0 };

export type ProjectileKind = 'saw' | 'rocket' | 'trapThrow';

export interface Projectile {
  id: number;
  kind: ProjectileKind;
  owner: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  ownerSafe: number;
  target: number;
  grounded: boolean;
}

export interface Trap {
  id: number;
  owner: number;
  x: number;
  y: number;
  life: number;
  ownerSafe: number;
}

export type SimEvent =
  | { t: 'countdown'; n: number }
  | { t: 'go' }
  | { t: 'jump'; r: number; wall: boolean; double?: boolean }
  | { t: 'slam'; r: number; x: number; y: number }
  | { t: 'crumble'; tile: number; broken: boolean }
  | { t: 'land'; r: number; v: number }
  | { t: 'pad'; r: number; kind: 'jump' | 'boost' | 'mega' }
  | { t: 'death'; r: number; kind: DeathKind; x: number; y: number; /** Runner whose item did it. */ by?: number }
  | { t: 'respawn'; r: number }
  | { t: 'swallowed'; r: number; fromX: number; fromY: number }
  | { t: 'box'; r: number; box: number }
  | { t: 'item'; r: number; item: ItemKind }
  | { t: 'use'; r: number; item: ItemKind; dir: number }
  | { t: 'coin'; r: number; coin: number }
  | { t: 'shieldBlock'; r: number }
  | { t: 'lightning'; r: number }
  | { t: 'explode'; x: number; y: number }
  | { t: 'sawBreak'; x: number; y: number }
  | { t: 'trapSet'; x: number; y: number }
  | { t: 'ability'; r: number; kind: AbilityKind; x: number; y: number; target?: number }
  | { t: 'stunned'; r: number; by?: number }
  | { t: 'finish'; r: number; place: number }
  | { t: 'end' };
