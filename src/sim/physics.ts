import {
  AIR_ACCEL,
  BOOST_SPEED,
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
import { Tile, type RunnerInput, type RunnerState, type Track } from './types';

export function tileAt(track: Track, col: number, row: number): number {
  if (row < 0) return Tile.Empty;
  if (row >= track.rows) row = track.rows - 1;
  if (col < 0 || col >= track.cols) return row >= GROUND_ROW ? Tile.Solid : Tile.Empty;
  return track.tiles[row * track.cols + col];
}

export function isSolid(track: Track, col: number, row: number): boolean {
  return tileAt(track, col, row) === Tile.Solid;
}

/** Any solid tile in the vertical strip [top, bottom] at pixel column x? */
export function solidInColumn(track: Track, x: number, top: number, bottom: number): boolean {
  const col = Math.floor(x / TILE);
  const r0 = Math.floor(top / TILE);
  const r1 = Math.floor(bottom / TILE);
  for (let r = r0; r <= r1; r++) if (isSolid(track, col, r)) return true;
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
        surface = r * TILE;
        break;
      case Tile.Platform:
        surface = r * TILE;
        if (fromAbove > surface + 1) continue;
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
): FloorHit | null {
  const minY = oldY - (wasGrounded ? STEP_UP : 1);
  const maxY = newY + (wasGrounded ? snapDown : 0);
  const centre = floorAtPoint(track, x, minY, maxY, oldY, true);
  if (centre && centre.slope !== 0) return centre;
  let best = centre;
  const inset = halfW - 3;
  for (const px of [x - inset, x + inset]) {
    const hit = floorAtPoint(track, px, minY, maxY, oldY, false);
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
  landed: boolean;
  landSpeed: number;
}

/**
 * Advances one runner by one tick. Pure function of (state, input, track): used by the race,
 * by bots for look-ahead, and by network clients for prediction.
 */
export function stepRunnerPhysics(r: RunnerState, input: RunnerInput, track: Track, dt: number): PhysicsResult {
  const res: PhysicsResult = { jumped: false, wallJumped: false, landed: false, landSpeed: 0 };
  const jumpPressed = input.jump && !r.prevJump;
  r.prevJump = input.jump;
  r.jumpBuffer = jumpPressed ? JUMP_BUFFER_TIME : Math.max(0, r.jumpBuffer - dt);
  r.coyote = r.grounded ? COYOTE_TIME : Math.max(0, r.coyote - dt);

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
    }
  } else {
    r.sliding = false;
  }
  if (!r.sliding) {
    let max = r.slope < 0 ? RUN_MAX_UPHILL : r.slope > 0 ? RUN_MAX_DOWNHILL : RUN_MAX;
    if (r.boost > 0) max = BOOST_SPEED;
    const accel = r.grounded ? RUN_ACCEL : AIR_ACCEL;
    if (r.vx < max) r.vx = Math.min(max, r.vx + accel * dt);
    else if (r.grounded) r.vx = Math.max(max, r.vx - OVERSPEED_DECAY * dt);
  }

  // --- jumping ----------------------------------------------------------------------
  if (r.jumpBuffer > 0) {
    const canStand = !r.sliding || hasHeadroom(track, r);
    if ((r.grounded || r.coyote > 0) && canStand) {
      r.vy = -JUMP_V;
      r.grounded = false;
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
    }
  }
  if (r.canCut && !input.jump && r.vy < -JUMP_CUT_V) {
    r.vy = -JUMP_CUT_V;
    r.canCut = false;
  }
  if (r.vy >= 0) r.canCut = false;

  // --- gravity & diving -------------------------------------------------------------
  if (!r.grounded) {
    r.vy += GRAVITY * dt;
    if (input.slide && r.vy > -250) {
      r.diving = true;
      r.vy = Math.min(DIVE_MAX, r.vy + DIVE_ACCEL * dt);
    } else {
      r.diving = false;
    }
    if (r.onWall && r.vy > WALL_SLIDE_MAX && !r.diving) r.vy = WALL_SLIDE_MAX;
    r.vy = Math.min(r.vy, r.diving ? DIVE_MAX : MAX_FALL);
  }

  // --- move horizontally ------------------------------------------------------------
  const h = runnerHeight(r);
  const half = RUNNER_W / 2;
  const bodyTop = r.y - h + 2;
  const bodyBottom = r.y - STEP_UP;
  let nx = r.x + r.vx * dt;
  let hitWall = false;
  if (bodyBottom >= bodyTop && solidInColumn(track, nx + half, bodyTop, bodyBottom)) {
    const col = Math.floor((nx + half) / TILE);
    nx = col * TILE - half - 0.01;
    if (nx < r.x) nx = r.x;
    hitWall = true;
    r.vx = 0;
  }
  r.x = nx;

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
    r.y = ny;
  } else {
    const snap = wasGrounded ? 6 + Math.abs(r.vx) * dt * 1.2 : 0;
    const floor = findFloor(track, r.x, half, oldY, ny, wasGrounded, snap);
    if (floor) {
      if (!wasGrounded) {
        res.landed = true;
        res.landSpeed = r.vy;
      }
      r.y = floor.y;
      r.vy = 0;
      r.grounded = true;
      r.slope = floor.slope;
    } else {
      r.y = ny;
      r.grounded = false;
      r.slope = 0;
    }
  }

  // --- wall contact -----------------------------------------------------------------
  const probeTop = r.y - runnerHeight(r) + 2;
  const touching = hitWall || solidInColumn(track, r.x + half + 1.5, probeTop, r.y - STEP_UP);
  r.onWall = touching && !r.grounded;
  r.blocked = touching && r.grounded;
  if (r.onWall && r.vy > 0) r.canCut = false;
  return res;
}
