import {
  ITEM_KINDS,
  type DeathKind,
  type ItemKind,
  type Projectile,
  type ProjectileKind,
  type RunnerMode,
  type RunnerState,
  type SimEvent,
  type Trap,
  type WorldId,
} from '../sim/types';
import type { CupState } from '../meta/cup';
import type { RacerInfo } from './session';

/** Bump when the messages change so old and new app versions don't try to play together. */
export const PROTOCOL_VERSION = 3;
export const MAX_PLAYERS = 4;
/** Host sends a world snapshot every this many ticks (60 / 3 = 20 per second). */
export const SNAPSHOT_EVERY = 3;

export interface LobbyPlayer {
  seat: number;
  name: string;
  character: string;
  cosmetics?: RacerInfo['cosmetics'];
}

/**
 * What the host picked in the lobby: an empty course list means a random course every race,
 * one course is a single race, several courses are a cup.
 */
export interface Playlist {
  name: string;
  courses: string[];
  /** Before every race the phones vote on three random courses. */
  vote?: boolean;
}

/** A running course vote: the options, who voted for what ([seat, option]) and seconds left. */
export interface VoteState {
  options: string[];
  votes: [number, number][];
  left: number;
}

export const VOTE_SECONDS = 8;

export type ClientMsg =
  | { t: 'hello'; v: number; name: string; character: string; cosmetics?: RacerInfo['cosmetics'] }
  | { t: 'in'; s: number; j: 0 | 1; d: 0 | 1 }
  | { t: 'use'; dir: -1 | 1 }
  | { t: 'ab' }
  | { t: 'vote'; i: number }
  | { t: 'profile'; name: string; character: string; cosmetics?: RacerInfo['cosmetics'] };

export interface SnapshotMsg {
  t: 'snap';
  /** Host tick. */
  k: number;
  /** Chaos wall position. */
  w: number;
  e: number;
  f: number;
  o: 0 | 1;
  r: number[][];
  p: number[][];
  tr: number[][];
  /** Item boxes that are currently cooling down: [index, seconds]. */
  b: number[][];
  /** Crumbling tiles: [tile index, seconds, broken 0/1]. */
  cr: number[][];
  /** Last input sequence number of the receiving client the host has applied. */
  a: number;
  ev: SimEvent[];
}

export type HostMsg =
  | { t: 'welcome'; seat: number }
  | { t: 'reject'; reason: string }
  | { t: 'lobby'; players: LobbyPlayer[]; playlist: Playlist; racing: boolean; vote?: VoteState }
  | { t: 'start'; seed: number; world: WorldId; courseId?: string; racers: RacerInfo[]; you: number; cup?: CupState }
  | SnapshotMsg;

// ---------------------------------------------------------------------------------------------
// Compact runner / projectile encoding (arrays of numbers keep the JSON small).

const MODES: RunnerMode[] = ['run', 'dead', 'finished'];
const DEATHS: (DeathKind | null)[] = [null, 'squash', 'slice', 'zap', 'trap', 'boom', 'spike', 'fall'];
const ITEMS: (ItemKind | null)[] = [null, ...ITEM_KINDS];
const PROJ_KINDS: ProjectileKind[] = ['saw', 'rocket', 'trapThrow'];

const r2 = (n: number) => Math.round(n * 100) / 100;
const b = (v: boolean) => (v ? 1 : 0);

export function packRunner(r: RunnerState): number[] {
  return [
    r2(r.x),
    r2(r.y),
    r2(r.vx),
    r2(r.vy),
    b(r.grounded),
    b(r.onWall),
    b(r.blocked),
    b(r.sliding),
    b(r.diving),
    r.airJumps,
    r.onMover,
    b(r.inWater),
    r.slope,
    r2(r.coyote),
    r2(r.jumpBuffer),
    b(r.prevJump),
    b(r.canCut),
    MODES.indexOf(r.mode),
    DEATHS.indexOf(r.deathKind),
    r2(r.deathTimer),
    r2(r.ghost),
    r2(r.safeX),
    r2(r.safeY),
    ITEMS.indexOf(r.item),
    r2(r.rolling),
    r2(r.shield),
    r2(r.boost),
    r2(r.magnet),
    r2(r.ink),
    r2(r.charge),
    r2(r.stun),
    r.coins,
    r2(r.finishTime),
    r.place,
    r.deaths,
  ];
}

export function unpackRunner(a: number[], into: RunnerState): RunnerState {
  let i = 0;
  into.x = a[i++];
  into.y = a[i++];
  into.vx = a[i++];
  into.vy = a[i++];
  into.grounded = a[i++] === 1;
  into.onWall = a[i++] === 1;
  into.blocked = a[i++] === 1;
  into.sliding = a[i++] === 1;
  into.diving = a[i++] === 1;
  into.airJumps = a[i++];
  into.onMover = a[i++];
  into.inWater = a[i++] === 1;
  into.slope = a[i++];
  into.coyote = a[i++];
  into.jumpBuffer = a[i++];
  into.prevJump = a[i++] === 1;
  into.canCut = a[i++] === 1;
  into.mode = MODES[a[i++]] ?? 'run';
  into.deathKind = DEATHS[a[i++]] ?? null;
  into.deathTimer = a[i++];
  into.ghost = a[i++];
  into.safeX = a[i++];
  into.safeY = a[i++];
  into.item = ITEMS[a[i++]] ?? null;
  into.rolling = a[i++];
  into.shield = a[i++];
  into.boost = a[i++];
  into.magnet = a[i++];
  into.ink = a[i++];
  into.charge = a[i++];
  into.stun = a[i++];
  into.coins = a[i++];
  into.finishTime = a[i++];
  into.place = a[i++];
  into.deaths = a[i++];
  return into;
}

export function packProjectile(p: Projectile): number[] {
  return [p.id, PROJ_KINDS.indexOf(p.kind), p.owner, r2(p.x), r2(p.y), r2(p.vx), r2(p.vy), r2(p.life), p.target, b(p.grounded), r2(p.ownerSafe)];
}

export function unpackProjectile(a: number[]): Projectile {
  return {
    id: a[0],
    kind: PROJ_KINDS[a[1]],
    owner: a[2],
    x: a[3],
    y: a[4],
    vx: a[5],
    vy: a[6],
    life: a[7],
    target: a[8],
    grounded: a[9] === 1,
    ownerSafe: a[10],
  };
}

export function packTrap(t: Trap): number[] {
  return [t.id, t.owner, r2(t.x), r2(t.y), r2(t.life), r2(t.ownerSafe)];
}

export function unpackTrap(a: number[]): Trap {
  return { id: a[0], owner: a[1], x: a[2], y: a[3], life: a[4], ownerSafe: a[5] };
}

export function randomRoomCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export function peerIdForCode(code: string): string {
  return `chaos-sprint-v${PROTOCOL_VERSION}-${code}`;
}
