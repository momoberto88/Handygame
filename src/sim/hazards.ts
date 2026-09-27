import {
  CRUSHER_HALF_W,
  RESPAWN_BACK,
  CRUSHER_HEAD_H,
  CRUSHER_PERIOD,
  CANNONBALL_RADIUS,
  JUMP_PAD_V,
  LEVEL_BOTTOM,
  MEGA_PAD_V,
  PAD_BOOST_TIME,
  BOOST_SPEED,
  GROUND_ROW,
  RUNNER_W,
  SAW_RADIUS,
  TILE,
} from './constants';
import { runnerHeight, tileAt } from './physics';
import { Tile, isSolidTile, type Cannon, type Crusher, type DeathKind, type Laser, type RunnerState, type Saw, type Track } from './types';

/** Index of the first element with x >= value in an x-sorted list. */
export function lowerBound(list: { x: number }[], value: number): number {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].x < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function sawPosition(s: Saw, clock: number): { x: number; y: number } {
  switch (s.motion) {
    case 'vertical':
      return { x: s.x, y: s.y + s.range * Math.sin(clock * 2.2 + s.phase) };
    case 'horizontal':
      return { x: s.x + s.range * Math.sin(clock * 1.8 + s.phase), y: s.y };
    case 'pendulum': {
      // (x, y) is the pivot; the blade swings on a rope of length `range`.
      const a = Math.sin(clock * 2.1 + s.phase) * 1.05;
      return { x: s.x + Math.sin(a) * s.range, y: s.y + Math.cos(a) * s.range };
    }
    default:
      return { x: s.x, y: s.y };
  }
}

/** Is the laser beam on right now? */
export function laserOn(l: Laser, clock: number): boolean {
  const period = l.on + l.off;
  let t = (clock + l.phase * period) % period;
  if (t < 0) t += period;
  return t < l.on;
}

/** Position of the cannon's current ball, or null between shots. */
export function cannonBall(c: Cannon, clock: number): { x: number; y: number } | null {
  let p = (clock / c.period + c.phase) % 1;
  if (p < 0) p += 1;
  const dist = p * c.period * c.speed;
  if (dist > c.range || dist < 20) return null;
  return { x: c.x + c.dir * dist, y: c.y };
}

/** Current distance the crusher head has moved down (0 = fully up). */
export function crusherOffset(c: Crusher, clock: number): number {
  let p = (clock / CRUSHER_PERIOD + c.phase) % 1;
  if (p < 0) p += 1;
  if (p < 0.42) return 0; // waiting at the top
  if (p < 0.5) {
    const k = (p - 0.42) / 0.08;
    return c.drop * k * k; // slam
  }
  if (p < 0.7) return c.drop; // resting on the floor
  const k = (p - 0.7) / 0.3;
  return c.drop * (1 - k); // slowly rising
}

export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function runnerBox(r: RunnerState, inset = 3): Box {
  const half = RUNNER_W / 2 - inset;
  return { left: r.x - half, right: r.x + half, top: r.y - runnerHeight(r) + inset + 1, bottom: r.y - 2 };
}

export function circleHitsBox(cx: number, cy: number, radius: number, b: Box): boolean {
  const nx = Math.max(b.left, Math.min(cx, b.right));
  const ny = Math.max(b.top, Math.min(cy, b.bottom));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < radius * radius;
}

function boxesOverlap(a: Box, b: Box): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/** Level hazards (spikes, saws, crushers, pits). Items are handled by the race. */
export function levelHazard(track: Track, r: RunnerState, clock: number): DeathKind | null {
  if (r.y > LEVEL_BOTTOM + 40) return 'fall';
  const b = runnerBox(r);

  // Spikes: lower half of the tile.
  const c0 = Math.floor(b.left / TILE);
  const c1 = Math.floor(b.right / TILE);
  const r0 = Math.floor(b.top / TILE);
  const r1 = Math.floor(b.bottom / TILE);
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      if (tileAt(track, col, row) !== Tile.Spikes) continue;
      const spike: Box = { left: col * TILE + 6, right: (col + 1) * TILE - 6, top: row * TILE + TILE * 0.55, bottom: (row + 1) * TILE };
      if (boxesOverlap(b, spike)) return 'spike';
    }
  }

  for (let i = lowerBound(track.saws, b.left - SAW_RADIUS); i < track.saws.length; i++) {
    const s = track.saws[i];
    if (s.x > b.right + SAW_RADIUS) break;
    const p = sawPosition(s, clock);
    if (circleHitsBox(p.x, p.y, SAW_RADIUS - 2, b)) return 'slice';
  }

  for (let i = lowerBound(track.crushers, b.left - CRUSHER_HALF_W); i < track.crushers.length; i++) {
    const c = track.crushers[i];
    if (c.x > b.right + CRUSHER_HALF_W) break;
    const top = c.anchorY + crusherOffset(c, clock);
    const head: Box = { left: c.x - CRUSHER_HALF_W, right: c.x + CRUSHER_HALF_W, top, bottom: top + CRUSHER_HEAD_H };
    if (boxesOverlap(b, head)) return 'squash';
  }

  for (const l of track.lasers) {
    if (Math.abs(l.x - r.x) > 30) continue;
    if (!laserOn(l, clock)) continue;
    const beam: Box = { left: l.x - 5, right: l.x + 5, top: l.y0, bottom: l.y1 };
    if (boxesOverlap(b, beam)) return 'zap';
  }

  for (const c of track.cannons) {
    if (Math.abs(c.x - r.x) > c.range + 40) continue;
    const ball = cannonBall(c, clock);
    if (ball && circleHitsBox(ball.x, ball.y, CANNONBALL_RADIUS - 2, b)) return 'boom';
  }
  return null;
}

/** Launch / boost pads. Returns the kind of pad triggered, if any. */
export function applyPads(track: Track, r: RunnerState): 'jump' | 'boost' | 'mega' | null {
  if (!r.grounded) return null;
  for (let i = lowerBound(track.pads, r.x - 22); i < track.pads.length; i++) {
    const p = track.pads[i];
    if (p.x > r.x + 22) break;
    if (Math.abs(r.y - p.y) > 4) continue;
    if (p.kind === 'jump' || p.kind === 'mega') {
      r.vy = -(p.kind === 'mega' ? MEGA_PAD_V : JUMP_PAD_V);
      r.grounded = false;
      r.onMover = -1;
      r.sliding = false;
      r.diving = false;
      r.canCut = false;
      r.coyote = 0;
      return p.kind;
    }
    if (r.boost < PAD_BOOST_TIME * 0.5) {
      r.boost = PAD_BOOST_TIME;
      r.vx = Math.max(r.vx, BOOST_SPEED);
      return 'boost';
    }
  }
  return null;
}

/** Is standing at (x, feetY) away from level dangers? Used for respawn points. */
export function isSafeSpot(track: Track, x: number, feetY: number): boolean {
  const col = Math.floor(x / TILE);
  const row = Math.floor((feetY - 1) / TILE);
  const ground = tileAt(track, col, row + 1);
  if (!isSolidTile(ground) || ground === Tile.Crumble) return false;
  for (let dc = -1; dc <= 1; dc++) {
    if (tileAt(track, col + dc, row) === Tile.Spikes) return false;
    if (isSolidTile(tileAt(track, col + dc, row))) return false;
    if (isSolidTile(tileAt(track, col + dc, row - 1))) return false;
  }
  for (let i = lowerBound(track.saws, x - 150); i < track.saws.length && track.saws[i].x < x + 150; i++) return false;
  for (let i = lowerBound(track.crushers, x - 90); i < track.crushers.length && track.crushers[i].x < x + 90; i++) return false;
  for (const l of track.lasers) if (Math.abs(l.x - x) < 70) return false;
  for (const z of track.zones) if (x > z.x0 - 20 && x < z.x1 + 20 && feetY > z.y0 && feetY - 40 < z.y1 && z.kind === 'wind') return false;
  return true;
}

/**
 * Where to come back after a death: standing ground (planks count) just before the spot where you
 * died, never past it, so a failed jump isn't skipped. Hazards nearby are fine: a respawned runner
 * blinks and can't be hurt for a moment. `runUp` moves it further back (a run-up after falling
 * into a pit). Null when there's nothing to stand on close by.
 */
export function respawnSpotNear(track: Track, x: number, preferFeetY: number, runUp = 0): { x: number; y: number } | null {
  x -= runUp;
  const c0 = Math.max(1, Math.floor((x - RESPAWN_BACK) / TILE));
  const c1 = Math.floor((x + 20) / TILE);
  let best: { x: number; y: number } | null = null;
  let bestScore = Infinity;
  for (let col = c1; col >= c0; col--) {
    for (let row = 3; row < track.rows; row++) {
      const ground = tileAt(track, col, row);
      if (!(isSolidTile(ground) || ground === Tile.Platform) || ground === Tile.Crumble) continue;
      // room to stand: two free rows above, no spikes around
      const a1 = tileAt(track, col, row - 1);
      const a2 = tileAt(track, col, row - 2);
      if (isSolidTile(a1) || isSolidTile(a2) || a1 === Tile.Spikes) continue;
      if (tileAt(track, col - 1, row - 1) === Tile.Spikes || tileAt(track, col + 1, row - 1) === Tile.Spikes) continue;
      const px = col * TILE + TILE / 2;
      const py = row * TILE;
      // close to where you died, a bit behind is fine, the same height is best
      const score = Math.abs(py - preferFeetY) * 1.5 + Math.max(0, x - px) * 0.5;
      if (score < bestScore) {
        best = { x: px, y: py };
        bestScore = score;
      }
    }
  }
  return best;
}

/** First safe standing spot at or after x, preferring surfaces close to `preferRow`. */
export function findSafeSpot(track: Track, x: number, preferRow: number = GROUND_ROW): { x: number; y: number } {
  const startCol = Math.max(1, Math.floor(x / TILE));
  for (let col = startCol; col < startCol + 80; col++) {
    let best: { x: number; y: number } | null = null;
    let bestDist = Infinity;
    for (let row = 3; row < track.rows; row++) {
      if (!isSolidTile(tileAt(track, col, row)) || isSolidTile(tileAt(track, col, row - 1))) continue;
      const px = col * TILE + TILE / 2;
      const py = row * TILE;
      const dist = Math.abs(row - preferRow);
      if (dist < bestDist && isSafeSpot(track, px, py)) {
        best = { x: px, y: py };
        bestDist = dist;
      }
    }
    if (best) return best;
  }
  return { x, y: GROUND_ROW * TILE };
}
