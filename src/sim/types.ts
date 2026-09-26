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
} as const;
export type TileId = (typeof Tile)[keyof typeof Tile];

export type WorldId = 'mine' | 'jungle' | 'sky' | 'neon';

export interface Saw {
  x: number;
  y: number;
  /** Vertical swing range in px (0 = stationary). */
  range: number;
  phase: number;
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
  kind: 'jump' | 'boost';
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
  startX: number;
  finishX: number;
  /** Names of the chunks the track was built from, for debugging and tests. */
  chunks: { name: string; col: number; width: number }[];
}

export type DeathKind = 'squash' | 'slice' | 'zap' | 'trap' | 'boom' | 'spike' | 'fall';
export type ItemKind = 'saw' | 'trap' | 'lightning' | 'shield' | 'turbo' | 'rocket' | 'ink' | 'magnet';
export const ITEM_KINDS: ItemKind[] = ['saw', 'trap', 'lightning', 'shield', 'turbo', 'rocket', 'ink', 'magnet'];
export type RunnerMode = 'run' | 'dead' | 'finished';

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
  diving: boolean;
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
  coins: number;
  finishTime: number;
  place: number;
  deaths: number;
}

export interface RunnerInput {
  jump: boolean;
  slide: boolean;
  /** 1 = use item forward, -1 = use item backward, 0 = nothing. */
  use: -1 | 0 | 1;
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
  | { t: 'jump'; r: number; wall: boolean }
  | { t: 'land'; r: number; v: number }
  | { t: 'pad'; r: number; kind: 'jump' | 'boost' }
  | { t: 'death'; r: number; kind: DeathKind; x: number; y: number }
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
  | { t: 'finish'; r: number; place: number }
  | { t: 'end' };
