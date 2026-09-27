import { describe, expect, it } from 'vitest';
import { BOT_CATCH_PACE, BOT_EASE_PACE, DRAFT_BONUS } from '../src/sim/constants';
import { rollItem } from '../src/sim/items';
import { Race } from '../src/sim/race';
import { Rng } from '../src/sim/rng';
import { NO_INPUT } from '../src/sim/types';

/** Person (0) against two easy bots; the race is stepped with the runners frozen in place. */
function race(positions: number[]) {
  const r = new Race({ seed: 5, world: 'jungle', runnerCount: 3, courseId: 'testgelaende', humans: [true, false, false], pace: [1, 0.88, 0.88] });
  while (r.time < 3) {
    r.runners.forEach((x, i) => {
      x.x = r.track.startX + positions[i];
      x.vx = 0;
    });
    r.step([NO_INPUT, NO_INPUT, NO_INPUT]);
  }
  return r;
}

describe('races stay open', () => {
  it('bots far behind the person catch up, bots far ahead ease off', () => {
    const r = race([2000, 0, 4000]);
    expect(r.runners[1].pace).toBeCloseTo(BOT_CATCH_PACE, 2);
    expect(r.runners[2].pace).toBeCloseTo(BOT_EASE_PACE, 2);
    expect(r.touch[1]).toBe(1);
    expect(r.touch[2]).toBe(-1);
  });

  it('bots near the person keep their level', () => {
    const r = race([2000, 1950, 2050]);
    expect(r.runners[1].pace).toBeCloseTo(0.88, 2);
    expect(r.runners[2].pace).toBeCloseTo(0.88, 2);
  });

  it('a person gets slipstream close behind someone', () => {
    const r = race([2000, 2150, 1000]);
    expect(r.runners[0].pace).toBeCloseTo(1 + DRAFT_BONUS, 2);
  });

  it('far behind the leader counts like last place for the item odds', () => {
    const strong = new Set(['turbo', 'rocket', 'lightning', 'ink']);
    const rng = new Rng(9);
    let hits = 0;
    for (let i = 0; i < 400; i++) if (strong.has(rollItem(rng, 2, 4, 2000))) hits++;
    expect(hits / 400).toBeGreaterThan(0.75);
  });
});
