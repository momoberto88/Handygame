import {
  CRUSHER_HALF_W,
  CRUSHER_HEAD_H,
  CRUSHER_PERIOD,
  JUMP_PAD_V,
  LEVEL_BOTTOM,
  PAD_BOOST_TIME,
  BOOST_SPEED,
  GROUND_ROW,
  RUNNER_W,
  SAW_RADIUS,
  TILE,
} from './constants';
import { runnerHeight, tileAt } from './physics';
import { Tile, type Crusher, type DeathKind, type RunnerState, type Saw, type Track } from './types';

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
  return { x: s.x, y: s.range ? s.y + s.range * Math.sin(clock * 2.2 + s.phase) : s.y };
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
  return null;
}

/** Launch / boost pads. Returns the kind of pad triggered, if any. */
export function applyPads(track: Track, r: RunnerState): 'jump' | 'boost' | null {
  if (!r.grounded) return null;
  for (let i = lowerBound(track.pads, r.x - 22); i < track.pads.length; i++) {
    const p = track.pads[i];
    if (p.x > r.x + 22) break;
    if (Math.abs(r.y - p.y) > 4) continue;
    if (p.kind === 'jump') {
      r.vy = -JUMP_PAD_V;
      r.grounded = false;
      r.sliding = false;
      r.canCut = false;
      r.coyote = 0;
      return 'jump';
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
  if (tileAt(track, col, row + 1) !== Tile.Solid) return false;
  for (let dc = -1; dc <= 1; dc++) {
    if (tileAt(track, col + dc, row) === Tile.Spikes) return false;
    if (tileAt(track, col + dc, row) === Tile.Solid) return false;
    if (tileAt(track, col + dc, row - 1) === Tile.Solid) return false;
  }
  for (let i = lowerBound(track.saws, x - 110); i < track.saws.length && track.saws[i].x < x + 110; i++) return false;
  for (let i = lowerBound(track.crushers, x - 90); i < track.crushers.length && track.crushers[i].x < x + 90; i++) return false;
  return true;
}

/** First safe standing spot at or after x, preferring surfaces close to the regular ground line. */
export function findSafeSpot(track: Track, x: number): { x: number; y: number } {
  const startCol = Math.max(1, Math.floor(x / TILE));
  for (let col = startCol; col < startCol + 80; col++) {
    let best: { x: number; y: number } | null = null;
    let bestDist = Infinity;
    for (let row = 3; row < track.rows; row++) {
      if (tileAt(track, col, row) !== Tile.Solid || tileAt(track, col, row - 1) === Tile.Solid) continue;
      const px = col * TILE + TILE / 2;
      const py = row * TILE;
      const dist = Math.abs(row - GROUND_ROW);
      if (dist < bestDist && isSafeSpot(track, px, py)) {
        best = { x: px, y: py };
        bestDist = dist;
      }
    }
    if (best) return best;
  }
  return { x, y: GROUND_ROW * TILE };
}
