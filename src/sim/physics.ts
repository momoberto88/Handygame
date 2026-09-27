import {
  AIR_ACCEL,
  AIR_JUMPS,
  AIR_OVERSPEED_DECAY,
  STUN_SPEED,
  BOOST_SPEED,
  CONVEYOR_SPEED,
  DOUBLE_JUMP_V,
  DT,
  MUD_JUMP,
  MUD_SPEED,
  WATER_GRAVITY,
  WATER_MAX_FALL,
  WATER_SPEED,
  WATER_SWIM_V,
  WIND_MAX_UP,
  COYOTE_TIME,
  DIVE_ACCEL,
  DIVE_MAX,
  GRAVITY,
  GROUND_ROW,
  JUMP_BUFFER_TIME,
  JUMP_CUT_V,
  JUMP_V,
  MAX_FALL,
  OVERSPEED_DECAY,
  RUN_ACCEL,
  RUN_MAX,
  RUN_MAX_DOWNHILL,
  RUN_MAX_UPHILL,
  RUNNER_H,
  RUNNER_SLIDE_H,
  RUNNER_W,
  SLIDE_FRICTION,
  SLIDE_MAX,
  SLIDE_MIN,
  SLIDE_SLOPE_ACCEL,
  STEP_UP,
  TILE,
  WALL_JUMP_V,
  WALL_SLIDE_MAX,
} from './constants';
import { Tile, isSolidTile, type Mover, type RunnerInput, type RunnerState, type Track } from './types';

export function tileAt(track: Track, col: number, row: number): number {
  if (row < 0) return Tile.Empty;
  if (row >= track.rows) row = track.rows - 1;
  if (col < 0 || col >= track.cols) return row >= GROUND_ROW ? Tile.Solid : Tile.Empty;
  return track.tiles[row * track.cols + col];
}

export function isSolid(track: Track, col: number, row: number): boolean {
  return isSolidTile(tileAt(track, col, row));
}

/** Any solid tile in the vertical strip [top, bottom] at pixel column x? */
export function solidInColumn(track: Track, x: number, top: number, bottom: number): boolean {
  const col = Math.floor(x / TILE);
  const r0 = Math.floor(top / TILE);
  const r1 = Math.floor(bottom / TILE);
  for (let r = r0; r <= r1; r++) if (isSolid(track, col, r)) return true;
  return false;
}

/** How far feet may sit below a hillside and still be lifted onto it instead of hitting it. */
const HILL_LIFT = 24;

/** Surface height of a 45° slope tile at pixel x (null when the tile is no slope). */
function slopeSurface(t: number, row: number, x: number, col: number): number | null {
  const fx = x - col * TILE;
  if (t === Tile.SlopeUp) return (row + 1) * TILE - fx;
  if (t === Tile.SlopeDown) return row * TILE + fx;
  return null;
}

/**
 * The hillside surface in column x near feet height y: the slope tile at the feet's row or the one
 * above or below it. Used so the ground under a slope isn't mistaken for a wall.
 */
function hillSurfaceAt(track: Track, x: number, y: number): number | null {
  const col = Math.floor(x / TILE);
  const row = Math.floor(y / TILE);
  for (let r = row - 1; r <= row + 1; r++) {
    const s = slopeSurface(tileAt(track, col, r), r, x, col);
    if (s !== null) return s;
  }
  return null;
}

/**
 * A wall in column x between top and bottom? The ground right under a hillside is no wall as long
 * as the feet are close enough to the hillside to be lifted onto it.
 */
function wallInColumn(track: Track, x: number, top: number, bottom: number, feetY: number): boolean {
  const col = Math.floor(x / TILE);
  const r0 = Math.floor(top / TILE);
  const r1 = Math.floor(bottom / TILE);
  for (let r = r0; r <= r1; r++) {
    if (!isSolid(track, col, r)) continue;
    const above = tileAt(track, col, r - 1);
    if (above === Tile.SlopeUp || above === Tile.SlopeDown) {
      const s = slopeSurface(above, r - 1, x, col)!;
      if (feetY - s <= HILL_LIFT) continue;
    }
    return true;
  }
  return false;
}

/** Any solid tile in the horizontal strip [left, right] at pixel row y? */
export function solidInRow(track: Track, left: number, right: number, y: number): boolean {
  const row = Math.floor(y / TILE);
  const c0 = Math.floor(left / TILE);
  const c1 = Math.floor(right / TILE);
  for (let c = c0; c <= c1; c++) if (isSolid(track, c, row)) return true;
  return false;
}

interface FloorHit {
  y: number;
  slope: number;
}

/**
 * Top-most walkable surface under point x between minY and maxY.
 * `fromAbove` is the previous feet height; one-way platforms only count when we came from above.
 */
function floorAtPoint(
  track: Track,
  x: number,
  minY: number,
  maxY: number,
  fromAbove: number,
  allowSlopes: boolean,
  ignoreLedges = false,
): FloorHit | null {
  const col = Math.floor(x / TILE);
  const fx = x - col * TILE;
  const r0 = Math.max(0, Math.floor(minY / TILE));
  const r1 = Math.floor(maxY / TILE);
  for (let r = r0; r <= r1; r++) {
    const t = tileAt(track, col, r);
    let surface: number;
    let slope = 0;
    switch (t) {
      case Tile.Solid:
      case Tile.ConveyorFwd:
      case Tile.ConveyorBack:
      case Tile.Mud:
      case Tile.Crumble:
        surface = r * TILE;
        break;
      case Tile.Platform:
        surface = r * TILE;
        if (ignoreLedges || fromAbove > surface + 1) continue;
        break;
      case Tile.SlopeUp:
        if (!allowSlopes) continue;
        surface = (r + 1) * TILE - fx;
        slope = -1;
        break;
      case Tile.SlopeDown:
        if (!allowSlopes) continue;
        surface = r * TILE + fx;
        slope = 1;
        break;
      default:
        continue;
    }
    if (surface >= minY && surface <= maxY) return { y: surface, slope };
  }
  return null;
}

/** Finds the floor for a body of half-width `halfW`. Slopes are sampled at the centre only. */
export function findFloor(
  track: Track,
  x: number,
  halfW: number,
  oldY: number,
  newY: number,
  wasGrounded: boolean,
  snapDown: number,
  ignoreLedges = false,
): FloorHit | null {
  const minY = oldY - (wasGrounded ? STEP_UP : 1);
  const maxY = newY + (wasGrounded ? snapDown : 0);
  const centre = floorAtPoint(track, x, minY, maxY, oldY, true, ignoreLedges);
  if (centre && centre.slope !== 0) return centre;
  let best = centre;
  const inset = halfW - 3;
  for (const px of [x - inset, x + inset]) {
    const hit = floorAtPoint(track, px, minY, maxY, oldY, false, ignoreLedges);
    if (hit && (!best || hit.y < best.y)) best = hit;
  }
  return best;
}

export function runnerHeight(r: RunnerState): number {
  return r.sliding ? RUNNER_SLIDE_H : RUNNER_H;
}

function hasHeadroom(track: Track, r: RunnerState): boolean {
  const half = RUNNER_W / 2 - 2;
  const top = r.y - RUNNER_H + 1;
  const bottom = r.y - RUNNER_SLIDE_H - 1;
  for (let row = Math.floor(top / TILE); row <= Math.floor(bottom / TILE); row++) {
    if (solidInRow(track, r.x - half, r.x + half, row * TILE)) return false;
  }
  return true;
}

export interface PhysicsResult {
  jumped: boolean;
  wallJumped: boolean;
  doubleJumped: boolean;
  landed: boolean;
  landSpeed: number;
  /** Landed while slamming down. */
  slammed: boolean;
}

export function moverPos(m: Mover, clock: number): { x: number; y: number } {
  const off = m.range * Math.sin((clock / m.period + m.phase) * Math.PI * 2);
  return m.axis === 'x' ? { x: m.x + off, y: m.y } : { x: m.x, y: m.y + off };
}

/** Surface under the feet of a grounded runner (for mud / conveyors). */
function surfaceTile(track: Track, r: RunnerState): number {
  if (!r.grounded || r.onMover >= 0) return Tile.Empty;
  return tileAt(track, Math.floor(r.x / TILE), Math.floor((r.y + 1) / TILE));
}

interface ZoneEffect {
  water: boolean;
  fx: number;
  fy: number;
}

function zonesAt(track: Track, x: number, y: number): ZoneEffect {
  const e: ZoneEffect = { water: false, fx: 0, fy: 0 };
  for (const z of track.zones) {
    if (x < z.x0 || x > z.x1 || y < z.y0 || y > z.y1) continue;
    if (z.kind === 'water') e.water = true;
    else {
      e.fx += z.fx;
      e.fy += z.fy;
    }
  }
  return e;
}

/** Landing on / riding a moving platform. */
function moverFloor(track: Track, r: RunnerState, oldY: number, newY: number, clock: number): { y: number; index: number } | null {
  let best: { y: number; index: number } | null = null;
  const half = RUNNER_W / 2 - 3;
  for (let i = 0; i < track.movers.length; i++) {
    const m = track.movers[i];
    const p1 = moverPos(m, clock);
    if (Math.abs(r.x - p1.x) > m.w / 2 + half) continue;
    const p0 = moverPos(m, clock - DT);
    const rel0 = oldY - p0.y;
    const rel1 = newY - p1.y;
    const riding = r.onMover === i && rel1 > -14 && rel1 < 16;
    if (riding || (rel0 <= 3 && rel1 >= 0)) {
      if (!best || p1.y < best.y) best = { y: p1.y, index: i };
    }
  }
  return best;
}

/**
 * Advances one runner by one tick. Pure function of (state, input, track, clock): used by the race,
 * by bots for look-ahead, and by network clients for prediction.
 * `clock` is the simulation time at the end of this tick (moving platforms depend on it).
 */
export function stepRunnerPhysics(r: RunnerState, input: RunnerInput, track: Track, dt: number, clock = 0): PhysicsResult {
  const res: PhysicsResult = { jumped: false, wallJumped: false, doubleJumped: false, landed: false, landSpeed: 0, slammed: false };
  const jumpPressed = input.jump && !r.prevJump;
  r.prevJump = input.jump;
  r.jumpBuffer = jumpPressed ? JUMP_BUFFER_TIME : Math.max(0, r.jumpBuffer - dt);
  r.coyote = r.grounded ? COYOTE_TIME : Math.max(0, r.coyote - dt);
  if (r.grounded || r.onWall) r.airJumps = AIR_JUMPS;

  const zone = zonesAt(track, r.x, r.y - 20);
  r.inWater = zone.water;
  const surface = surfaceTile(track, r);
  const mud = surface === Tile.Mud;

  // --- horizontal speed -------------------------------------------------------------
  if (r.grounded) {
    r.diving = false;
    if (input.slide) {
      r.sliding = true;
    } else if (r.sliding && hasHeadroom(track, r)) {
      r.sliding = false;
    }
    if (r.sliding) {
      if (r.slope > 0) r.vx = Math.min(SLIDE_MAX, r.vx + SLIDE_SLOPE_ACCEL * dt);
      else if (r.slope < 0) r.vx = Math.max(SLIDE_MIN * 0.7, r.vx - 500 * dt);
      else r.vx = Math.max(Math.min(r.vx, SLIDE_MIN), r.vx - SLIDE_FRICTION * dt);
      if (r.vx < SLIDE_MIN && r.slope >= 0) r.vx = Math.min(SLIDE_MIN, r.vx + RUN_ACCEL * dt);
      if (mud) r.vx = Math.min(r.vx, SLIDE_MIN * MUD_SPEED);
    }
  } else {
    r.sliding = false;
  }
  if (!r.sliding) {
    let max = (r.slope < 0 ? RUN_MAX_UPHILL : r.slope > 0 ? RUN_MAX_DOWNHILL : RUN_MAX) * r.pace;
    if (r.boost > 0) max = BOOST_SPEED;
    if (mud) max *= MUD_SPEED;
    if (r.inWater) max *= WATER_SPEED;
    if (r.stun > 0) max *= STUN_SPEED;
    const accel = r.grounded ? RUN_ACCEL : AIR_ACCEL;
    if (r.vx < max) r.vx = Math.min(max, r.vx + accel * dt);
    else if (r.grounded || r.inWater) r.vx = Math.max(max, r.vx - (mud || r.inWater ? 900 : OVERSPEED_DECAY) * dt);
    // extra speed fades in the air too, so bunny-hopping can't keep a boost forever
    else r.vx = Math.max(max, r.vx - OVERSPEED_DECAY * AIR_OVERSPEED_DECAY * dt);
  }

  // --- jumping ----------------------------------------------------------------------
  if (r.jumpBuffer > 0) {
    const canStand = !r.sliding || hasHeadroom(track, r);
    if (r.inWater && canStand) {
      // Swim stroke: works any time in water.
      r.vy = -WATER_SWIM_V;
      r.grounded = false;
      r.onMover = -1;
      r.jumpBuffer = 0;
      r.sliding = false;
      r.canCut = false;
      res.jumped = true;
    } else if ((r.grounded || r.coyote > 0) && canStand) {
      r.vy = -JUMP_V * (mud ? MUD_JUMP : 1);
      r.grounded = false;
      r.onMover = -1;
      r.coyote = 0;
      r.jumpBuffer = 0;
      r.sliding = false;
      r.canCut = true;
      res.jumped = true;
    } else if (!r.grounded && r.onWall) {
      r.vy = -WALL_JUMP_V;
      r.jumpBuffer = 0;
      r.canCut = true;
      res.jumped = true;
      res.wallJumped = true;
    } else if (!r.grounded && r.airJumps > 0 && jumpPressed) {
      r.vy = -DOUBLE_JUMP_V;
      r.airJumps--;
      r.jumpBuffer = 0;
      r.diving = false;
      r.canCut = false;
      res.jumped = true;
      res.doubleJumped = true;
    }
  }
  if (r.canCut && !input.jump && r.vy < -JUMP_CUT_V) {
    r.vy = -JUMP_CUT_V;
    r.canCut = false;
  }
  if (r.vy >= 0) r.canCut = false;

  // --- gravity, slam, wind, water ---------------------------------------------------
  const wasDiving = r.diving;
  if (!r.grounded) {
    r.vy += GRAVITY * (r.inWater ? WATER_GRAVITY : 1) * dt;
    if (input.slide && r.vy > -250 && !r.inWater) {
      r.diving = true;
      r.vy = Math.min(DIVE_MAX, r.vy + DIVE_ACCEL * dt);
    } else {
      r.diving = false;
    }
    if (r.onWall && r.vy > WALL_SLIDE_MAX && !r.diving) r.vy = WALL_SLIDE_MAX;
    r.vy = Math.min(r.vy, r.diving ? DIVE_MAX : r.inWater ? WATER_MAX_FALL : MAX_FALL);
  }
  if (zone.fy) {
    r.vy += zone.fy * dt;
    if (r.vy < -WIND_MAX_UP) r.vy = -WIND_MAX_UP;
    if (zone.fy < 0 && r.grounded && zone.fy * -1 > GRAVITY) {
      r.grounded = false;
      r.onMover = -1;
    }
  }
  if (zone.fx) r.vx = Math.max(60, r.vx + zone.fx * dt);

  // --- move horizontally ------------------------------------------------------------
  const h = runnerHeight(r);
  const half = RUNNER_W / 2;
  const bodyTop = r.y - h + 2;
  const bodyBottom = r.y - STEP_UP;
  let push = 0;
  if (surface === Tile.ConveyorFwd) push = CONVEYOR_SPEED;
  else if (surface === Tile.ConveyorBack) push = -CONVEYOR_SPEED;
  if (r.onMover >= 0 && r.onMover < track.movers.length) {
    const m = track.movers[r.onMover];
    push += (moverPos(m, clock).x - moverPos(m, clock - DT).x) / dt;
  }
  let nx = r.x + (r.vx + push) * dt;
  let hitWall = false;
  if (nx > r.x && bodyBottom >= bodyTop && wallInColumn(track, nx + half, bodyTop, bodyBottom, r.y)) {
    const col = Math.floor((nx + half) / TILE);
    nx = col * TILE - half - 0.01;
    if (nx < r.x) nx = r.x;
    hitWall = true;
    r.vx = 0;
  } else if (nx < r.x && bodyBottom >= bodyTop && wallInColumn(track, nx - half, bodyTop, bodyBottom, r.y)) {
    // Pushed backwards (conveyor) into a wall.
    nx = r.x;
  }
  r.x = nx;
  // ran or jumped into a hillside: step up onto it instead of stopping
  const hill = hillSurfaceAt(track, r.x, r.y);
  if (hill !== null && r.y > hill && r.y - hill <= HILL_LIFT) {
    r.y = hill;
    if (r.vy > 0) r.vy = 0;
  }

  // --- move vertically --------------------------------------------------------------
  const wasGrounded = r.grounded;
  const oldY = r.y;
  let ny = r.y + r.vy * dt;
  if (r.vy < 0) {
    const top = ny - h;
    if (top < 0) {
      ny = h;
      r.vy = 0;
    } else if (solidInRow(track, r.x - half + 2, r.x + half - 2, top)) {
      const row = Math.floor(top / TILE);
      ny = (row + 1) * TILE + h;
      r.vy = 0;
    }
    r.grounded = false;
    r.onMover = -1;
    r.y = ny;
  } else {
    const snap = wasGrounded && r.onMover < 0 ? 6 + Math.abs(r.vx) * dt * 1.2 : 0;
    // Slamming drops straight through one-way ledges and moving platforms.
    const slam = r.diving;
    const floor = findFloor(track, r.x, half, oldY, ny, wasGrounded && r.onMover < 0, snap, slam);
    const mover = track.movers.length && !slam ? moverFloor(track, r, oldY, ny, clock) : null;
    const useMover = mover && (!floor || mover.y < floor.y);
    if (floor || mover) {
      if (!wasGrounded) {
        res.landed = true;
        res.landSpeed = r.vy;
        res.slammed = wasDiving;
      }
      r.y = useMover ? mover!.y : floor!.y;
      r.vy = 0;
      r.grounded = true;
      r.diving = false;
      r.slope = useMover ? 0 : floor!.slope;
      r.onMover = useMover ? mover!.index : -1;
    } else {
      r.y = ny;
      r.grounded = false;
      r.onMover = -1;
      r.slope = 0;
    }
  }

  // --- wall contact -----------------------------------------------------------------
  const probeTop = r.y - runnerHeight(r) + 2;
  const touching = hitWall || wallInColumn(track, r.x + half + 1.5, probeTop, r.y - STEP_UP, r.y);
  r.onWall = touching && !r.grounded && !r.inWater;
  r.blocked = touching && r.grounded;
  if (r.onWall && r.vy > 0) r.canCut = false;
  return res;
}
