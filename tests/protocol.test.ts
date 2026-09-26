import { describe, expect, it } from 'vitest';
import { packRunner, unpackRunner, packProjectile, unpackProjectile } from '../src/net/protocol';
import { createRunner } from '../src/sim/race';
import type { Projectile } from '../src/sim/types';

describe('network encoding', () => {
  it('round-trips runner state', () => {
    const r = createRunner(2, 123.456, 480);
    Object.assign(r, { vx: 340.12, vy: -780, sliding: true, mode: 'dead', deathKind: 'zap', item: 'rocket', coins: 7, place: 2, slope: -1 });
    const copy = unpackRunner(JSON.parse(JSON.stringify(packRunner(r))), createRunner(2, 0, 0));
    expect(copy).toEqual({ ...r, x: 123.46, safeX: 123.46, vx: 340.12 });
  });

  it('round-trips projectiles', () => {
    const p: Projectile = { id: 5, kind: 'rocket', owner: 1, x: 10, y: 20, vx: 700, vy: -3, life: 2.5, ownerSafe: 0.1, target: 3, grounded: false };
    expect(unpackProjectile(packProjectile(p))).toEqual(p);
  });
});
