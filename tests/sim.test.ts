import { describe, expect, it } from 'vitest';
import { BotBrain } from '../src/sim/bot';
import { COUNTDOWN_TIME, GROUND_ROW, RUN_MAX, TICKS_PER_SEC, TILE } from '../src/sim/constants';
import { Race } from '../src/sim/race';
import { CHUNKS } from '../src/sim/track/chunks';
import { generateTrack } from '../src/sim/track/generator';
import { NO_INPUT, type RunnerInput, type SimEvent } from '../src/sim/types';

function runRace(race: Race, brains: (BotBrain | null)[], maxSeconds: number, log?: SimEvent[]) {
  const ticks = (maxSeconds + COUNTDOWN_TIME) * TICKS_PER_SEC;
  for (let i = 0; i < ticks && !race.over; i++) {
    const inputs: RunnerInput[] = race.runners.map((r) => brains[r.id]?.think(race, r.id) ?? NO_INPUT);
    const ev = race.step(inputs);
    log?.push(...ev);
  }
}

describe('track generator', () => {
  it('is deterministic for a seed', () => {
    const a = generateTrack({ seed: 1234, world: 'mine' });
    const b = generateTrack({ seed: 1234, world: 'mine' });
    const c = generateTrack({ seed: 999, world: 'mine' });
    expect(a.cols).toBe(b.cols);
    expect(Buffer.from(a.tiles).equals(Buffer.from(b.tiles))).toBe(true);
    expect(a.chunks.map((x) => x.name)).toEqual(b.chunks.map((x) => x.name));
    expect(c.chunks.map((x) => x.name)).not.toEqual(a.chunks.map((x) => x.name));
  });

  it('builds a track of about a minute', () => {
    const t = generateTrack({ seed: 7, world: 'jungle' });
    const seconds = (t.finishX - t.startX) / RUN_MAX;
    expect(seconds).toBeGreaterThan(40);
    expect(seconds).toBeLessThan(60);
  });
});

describe('runner physics', () => {
  it('runs forward and accelerates to top speed', () => {
    const race = new Race({ seed: 1, world: 'mine', runnerCount: 1, chunkNames: [] });
    runRace(race, [null], 1.5);
    const r = race.runners[0];
    expect(r.vx).toBeCloseTo(RUN_MAX, 0);
    expect(r.grounded).toBe(true);
    expect(r.y).toBe(GROUND_ROW * TILE);
  });

  it('jumps about three tiles high', () => {
    const race = new Race({ seed: 1, world: 'mine', runnerCount: 1, chunkNames: [] });
    let minY = Infinity;
    for (let i = 0; i < (COUNTDOWN_TIME + 1) * TICKS_PER_SEC; i++) {
      race.step([{ jump: race.time > 0.3, slide: false, use: 0 }]);
      minY = Math.min(minY, race.runners[0].y);
    }
    const height = GROUND_ROW * TILE - minY;
    expect(height).toBeGreaterThan(120);
    expect(height).toBeLessThan(140);
  });

  it('can only pass the slide tunnel while sliding', () => {
    const runner = (slide: boolean) => {
      const race = new Race({ seed: 1, world: 'mine', runnerCount: 1, chunkNames: ['slide-tunnel'] });
      const tunnelStart = (race.track.chunks[1].col + 12) * TILE;
      const tunnelEnd = (race.track.chunks[1].col + 20) * TILE;
      for (let i = 0; i < (COUNTDOWN_TIME + 6) * TICKS_PER_SEC; i++) {
        const nearTunnel = race.runners[0].x > tunnelStart - 80;
        race.step([{ jump: false, slide: slide && nearTunnel, use: 0 }]);
      }
      return race.runners[0].x > tunnelEnd;
    };
    expect(runner(false)).toBe(false);
    expect(runner(true)).toBe(true);
  });

  it('sliding down a ramp is faster than running', () => {
    const topSpeed = (slide: boolean) => {
      const race = new Race({ seed: 1, world: 'mine', runnerCount: 1, chunkNames: ['pad-plateau-slope'] });
      let best = 0;
      for (let i = 0; i < (COUNTDOWN_TIME + 5) * TICKS_PER_SEC; i++) {
        const r = race.runners[0];
        race.step([{ jump: false, slide: slide && r.slope > 0, use: 0 }]);
        best = Math.max(best, race.runners[0].vx);
      }
      return best;
    };
    expect(topSpeed(true)).toBeGreaterThan(topSpeed(false) + 50);
  });
});

describe('chaos wall', () => {
  it('teleports runners that fall too far behind', () => {
    const race = new Race({ seed: 3, world: 'mine', runnerCount: 2 });
    const log: SimEvent[] = [];
    runRace(race, [null, null], 2, log);
    race.runners[1].x = race.wallX - 5;
    log.push(...race.step([NO_INPUT, NO_INPUT]));
    expect(log.some((e) => e.t === 'swallowed' && e.r === 1)).toBe(true);
    expect(race.runners[1].x).toBeGreaterThan(race.wallX);
  });
});

describe('bots', () => {
  for (const chunk of CHUNKS) {
    it(`a good bot clears "${chunk.name}"`, () => {
      const race = new Race({ seed: 5, world: 'mine', runnerCount: 1, chunkNames: [chunk.name, chunk.name] });
      const log: SimEvent[] = [];
      runRace(race, [new BotBrain(1, { skill: 1 })], 40, log);
      const deaths = log.filter((e) => e.t === 'death');
      expect(race.runners[0].place, `deaths: ${JSON.stringify(deaths)}`).toBe(1);
      expect(deaths.length).toBeLessThanOrEqual(1);
    });
  }

  it('four bots finish a full race with items in reasonable time', () => {
    for (const seed of [11, 22, 33]) {
      const race = new Race({ seed, world: 'mine', runnerCount: 4 });
      const brains = [0, 1, 2, 3].map((i) => new BotBrain(seed + i, { skill: 0.3 + i * 0.2 }));
      const log: SimEvent[] = [];
      runRace(race, brains, 140, log);
      expect(race.over).toBe(true);
      const winner = race.standings()[0];
      expect(winner.finishTime).toBeGreaterThan(30);
      expect(winner.finishTime).toBeLessThan(100);
      expect(log.some((e) => e.t === 'use')).toBe(true);
    }
  });
});
