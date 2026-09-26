import { CRUSHER_HEAD_H, LANE_ROWS, ROWS, TILE } from '../constants';
import type { Rng } from '../rng';
import {
  Tile,
  type Cannon,
  type Crusher,
  type Laser,
  type Mover,
  type Pad,
  type Pickup,
  type Saw,
  type SawMotion,
  type Track,
  type WorldId,
  type Zone,
} from '../types';

export type Lane = 0 | 1 | 2;
export const TOP: Lane = 0;
export const MID: Lane = 1;
export const LOW: Lane = 2;
export type FloorKind = 'ledge' | 'solid' | 'mud' | 'conv' | 'convBack' | 'crumble' | 'none';

const MAX_COLS = 1400;

/** Row whose top is the floor of `lane`. */
export function floorRow(lane: Lane): number {
  return LANE_ROWS[lane];
}

/**
 * Writes tiles and level objects column by column. Every module (track piece) gets a column range
 * and uses these helpers; the builder turns it all into a `Track` at the end.
 */
export class TrackBuilder {
  readonly tiles = new Uint8Array(MAX_COLS * ROWS);
  cols = 0;
  saws: Saw[] = [];
  crushers: { col: number; row: number; phase: number }[] = [];
  pads: Pad[] = [];
  boxes: Pickup[] = [];
  coinList: Pickup[] = [];
  movers: Mover[] = [];
  zones: Zone[] = [];
  lasers: Laser[] = [];
  cannons: Cannon[] = [];
  parts: { name: string; col: number; width: number }[] = [];
  /** Height of the terrain in rows (negative = higher). Shifts all three storeys together. */
  dy = 0;

  constructor(
    readonly world: WorldId,
    readonly rng: Rng,
  ) {}

  // ---------------------------------------------------------------------------------------
  // raw tiles

  set(c: number, r: number, t: number) {
    if (c < 0 || c >= MAX_COLS || r < 0 || r >= ROWS) return;
    this.tiles[r * MAX_COLS + c] = t;
    if (c + 1 > this.cols) this.cols = c + 1;
  }

  get(c: number, r: number): number {
    if (c < 0 || c >= MAX_COLS || r < 0 || r >= ROWS) return Tile.Empty;
    return this.tiles[r * MAX_COLS + c];
  }

  /** Inclusive rectangle. */
  fill(c0: number, c1: number, r0: number, r1: number, t: number) {
    for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) this.set(c, r, t);
  }

  clear(c0: number, c1: number, r0: number, r1: number) {
    this.fill(c0, c1, r0, r1, Tile.Empty);
  }

  // ---------------------------------------------------------------------------------------
  // lanes

  /** Row whose top is the floor of `lane` at the current terrain height. */
  row(lane: Lane): number {
    return floorRow(lane) + this.dy;
  }

  /**
   * Moves the terrain to height `dy` with 45° ramps on all three storeys, starting at column c0.
   * Returns the width used (a flat column on each side plus one column per row of height).
   */
  shiftTerrain(c0: number, dy: number): number {
    const delta = dy - this.dy;
    const n = Math.abs(delta);
    this.standard(c0, c0);
    if (n === 0) return 1;
    for (const lane of [TOP, MID, LOW] as Lane[]) {
      const from = this.row(lane);
      const bottom = lane === LOW ? ROWS - 1 : -1;
      for (let i = 0; i < n; i++) {
        const c = c0 + 1 + i;
        const r = delta < 0 ? from - 1 - i : from + i;
        this.set(c, r, delta < 0 ? Tile.SlopeUp : Tile.SlopeDown);
        for (let rr = r + 1; rr <= bottom; rr++) this.set(c, rr, Tile.Solid);
      }
    }
    this.dy = dy;
    this.standard(c0 + 1 + n, c0 + 1 + n);
    return n + 2;
  }

  /** Floor of a lane from c0 to c1 (inclusive). The low lane is backed by solid ground to the bottom. */
  floor(lane: Lane, c0: number, c1: number, kind: FloorKind = lane === LOW ? 'solid' : 'ledge') {
    const r = this.row(lane);
    const bottom = lane === LOW ? ROWS - 1 : r;
    for (let c = c0; c <= c1; c++) {
      if (kind === 'none') {
        for (let rr = r; rr <= bottom; rr++) this.set(c, rr, Tile.Empty);
        continue;
      }
      const t =
        kind === 'ledge'
          ? Tile.Platform
          : kind === 'mud'
            ? Tile.Mud
            : kind === 'conv'
              ? Tile.ConveyorFwd
              : kind === 'convBack'
                ? Tile.ConveyorBack
                : kind === 'crumble'
                  ? Tile.Crumble
                  : Tile.Solid;
      this.set(c, r, t);
      for (let rr = r + 1; rr <= bottom; rr++) this.set(c, rr, Tile.Solid);
    }
  }

  /** The standard three-storey connector every module starts and ends with. */
  standard(c0: number, c1: number) {
    this.floor(TOP, c0, c1, 'ledge');
    this.floor(MID, c0, c1, 'ledge');
    this.floor(LOW, c0, c1, 'solid');
    // keep the corridors open
    for (const lane of [TOP, MID, LOW] as Lane[]) this.clear(c0, c1, this.row(lane) - 4, this.row(lane) - 1);
  }

  /** Remove a lane's floor: a hole to the lane below (or a deadly pit in the low lane). */
  gap(lane: Lane, c0: number, c1: number) {
    this.floor(lane, c0, c1, 'none');
  }

  /** Solid rectangle given in rows relative to a lane floor (0 = floor row, positive = upwards). */
  block(lane: Lane, c0: number, c1: number, fromUp: number, toUp: number, t: number = Tile.Solid) {
    const base = this.row(lane);
    this.fill(c0, c1, base - toUp, base - fromUp, t);
  }

  /** A hill made of 45° ramps rising `height` rows above the lane floor. */
  hill(lane: Lane, c0: number, top: number, height: number) {
    const base = this.row(lane);
    for (let i = 0; i < height; i++) {
      const row = base - 1 - i;
      this.set(c0 + i, row, Tile.SlopeUp);
      for (let rr = row + 1; rr < base; rr++) this.set(c0 + i, rr, Tile.Solid);
    }
    const plateau0 = c0 + height;
    const plateau1 = plateau0 + top - 1;
    this.fill(plateau0, plateau1, base - height, base - 1, Tile.Solid);
    for (let i = 0; i < height; i++) {
      const col = plateau1 + 1 + i;
      const row = base - height + i;
      this.set(col, row, Tile.SlopeDown);
      for (let rr = row + 1; rr < base; rr++) this.set(col, rr, Tile.Solid);
    }
    return plateau1 + height;
  }

  /** Ramp from a lane floor down to the lane below (replaces the lower part of the floor with slopes). */
  rampDown(lane: Lane, c0: number) {
    const from = this.row(lane);
    const to = this.row((lane + 1) as Lane);
    for (let i = 0; i < to - from; i++) {
      this.set(c0 + i, from + i, Tile.SlopeDown);
      for (let rr = from + i + 1; rr < to; rr++) this.set(c0 + i, rr, Tile.Solid);
    }
    return c0 + (to - from);
  }

  /** Ramp from a lane floor up to the lane above. Runners on the lane follow it upwards. */
  rampUp(lane: Lane, c0: number) {
    const from = this.row(lane);
    const to = this.row((lane - 1) as Lane);
    const n = from - to;
    for (let i = 0; i < n; i++) {
      const row = from - 1 - i;
      this.set(c0 + i, row, Tile.SlopeUp);
      for (let rr = row + 1; rr < from; rr++) this.set(c0 + i, rr, Tile.Solid);
    }
    return c0 + n;
  }

  /** Low ceiling so the corridor must be slid through (rows 2..4 above the floor become solid). */
  slideBeam(lane: Lane, c0: number, c1: number) {
    this.block(lane, c0, c1, 2, 4);
  }

  spikes(lane: Lane, c0: number, c1: number) {
    const r = this.row(lane) - 1;
    for (let c = c0; c <= c1; c++) this.set(c, r, Tile.Spikes);
  }

  // ---------------------------------------------------------------------------------------
  // objects

  private cx(col: number) {
    return col * TILE + TILE / 2;
  }

  private laneY(lane: Lane, up = 0) {
    return (this.row(lane) - up) * TILE;
  }

  saw(col: number, lane: Lane, up: number, motion: SawMotion = 'still', range = 0, phase = this.rng.next() * 6) {
    this.saws.push({ x: this.cx(col), y: this.laneY(lane, up) - TILE / 2, motion, range, phase });
  }

  /** Pendulum saw hanging from the floor of the lane above. */
  pendulum(col: number, lane: Lane, rope = 110) {
    const pivotY = (this.row(lane) - 5 + 1) * TILE;
    this.set(col, this.row(lane) - 5, Tile.Solid);
    this.saws.push({ x: this.cx(col), y: pivotY, motion: 'pendulum', range: rope, phase: this.rng.next() * 6 });
  }

  /** Crusher hanging from the lane above's floor (turned solid at that column). */
  crusher(col: number, lane: Lane, phase = this.rng.next()) {
    const row = this.row(lane) - 5;
    this.set(col, row, Tile.Solid);
    this.set(col - 1, row, Tile.Solid);
    this.set(col + 1, row, Tile.Solid);
    this.crushers.push({ col, row, phase });
  }

  pad(col: number, lane: Lane, kind: Pad['kind'] = 'jump') {
    this.pads.push({ kind, x: this.cx(col), y: this.laneY(lane) });
  }

  box(col: number, lane: Lane, up = 2) {
    this.boxes.push({ x: this.cx(col), y: this.laneY(lane, up) + TILE / 2 });
  }

  coins(c0: number, c1: number, lane: Lane, up = 2, arc = 0) {
    for (let c = c0; c <= c1; c++) {
      const t = c1 > c0 ? (c - c0) / (c1 - c0) : 0.5;
      const lift = arc ? Math.sin(t * Math.PI) * arc : 0;
      this.coinList.push({ x: this.cx(c), y: this.laneY(lane, up) + TILE / 2 - lift * TILE });
    }
  }

  /** Moving platform whose surface rests at `up` rows above the lane floor. */
  mover(col: number, lane: Lane, up: number, widthTiles: number, axis: 'x' | 'y', rangeTiles: number, period: number) {
    this.movers.push({
      x: col * TILE + (widthTiles * TILE) / 2,
      y: this.laneY(lane, up),
      w: widthTiles * TILE,
      axis,
      range: rangeTiles * TILE,
      period,
      phase: this.rng.next(),
    });
  }

  zone(kind: Zone['kind'], c0: number, c1: number, r0: number, r1: number, fx = 0, fy = 0) {
    this.zones.push({ kind, x0: c0 * TILE, y0: r0 * TILE, x1: (c1 + 1) * TILE, y1: (r1 + 1) * TILE, fx, fy });
  }

  /** Laser beam across a lane's corridor. */
  laser(col: number, lane: Lane, on = 1.1, off = 1.1, phase = this.rng.next()) {
    this.lasers.push({ x: this.cx(col), y0: this.laneY(lane, 5) + TILE, y1: this.laneY(lane), on, off, phase });
  }

  cannon(col: number, lane: Lane, up: number, dir: -1 | 1, period = 2.2, range = 14) {
    this.set(col, this.row(lane) - up, Tile.Solid);
    this.cannons.push({
      x: this.cx(col),
      y: this.laneY(lane, up) + TILE / 2,
      dir,
      period,
      phase: this.rng.next(),
      speed: 420,
      range: range * TILE,
    });
  }

  mark(name: string, col: number, width: number) {
    this.parts.push({ name, col, width });
  }

  // ---------------------------------------------------------------------------------------

  build(seed: number, startCol: number, finishCol: number): Track {
    const cols = this.cols;
    const tiles = new Uint8Array(cols * ROWS);
    for (let r = 0; r < ROWS; r++) tiles.set(this.tiles.subarray(r * MAX_COLS, r * MAX_COLS + cols), r * cols);
    const crushers: Crusher[] = this.crushers.map((c) => {
      const anchorY = (c.row + 1) * TILE;
      let floor = c.row + 1;
      while (floor < ROWS && tiles[floor * cols + c.col] === Tile.Empty) floor++;
      return { x: c.col * TILE + TILE / 2, anchorY, drop: Math.max(0, floor * TILE - anchorY - CRUSHER_HEAD_H), phase: c.phase };
    });
    const byX = (a: { x: number }, b: { x: number }) => a.x - b.x;
    return {
      seed,
      world: this.world,
      cols,
      rows: ROWS,
      tiles,
      saws: this.saws.sort(byX),
      crushers: crushers.sort(byX),
      pads: this.pads.sort(byX),
      boxes: this.boxes.sort(byX),
      coins: this.coinList.sort(byX),
      movers: this.movers,
      zones: this.zones,
      lasers: this.lasers,
      cannons: this.cannons,
      startX: startCol * TILE + TILE / 2,
      startY: floorRow(MID) * TILE,
      finishX: finishCol * TILE,
      chunks: this.parts,
    };
  }
}
