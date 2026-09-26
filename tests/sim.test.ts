import { describe, expect, it } from 'vitest';
import { BotBrain, botProfile } from '../src/sim/bot';
import { COUNTDOWN_TIME, LANE_ROWS, RUN_MAX, TICKS_PER_SEC, TILE } from '../src/sim/constants';
import { Race } from '../src/sim/race';
import { COURSES } from '../src/sim/track/courses';
import { generateTrack } from '../src/sim/track/generator';
import { MODULES } from '../src/sim/track/modules';
import { NO_INPUT, type RunnerInput, type SimEvent } from '../src/sim/types';

function runRace(race: Race, brains: (BotBrain | null)[], maxSeconds: number, log?: SimEvent[]) {
  const ticks = (maxSeconds + COUNTDOWN_TIME) * TICKS_PER_SEC;
  for (let i = 0; i < ticks && !race.over; i++) {
    const inputs: RunnerInput[] = race.runners.map((r) => brains[r.id]?.think(race, r.id) ?? NO_INPUT);
    const ev = race.step(inputs);
    log?.push(...ev);
  }
}

const MID_FLOOR = LANE_ROWS[1] * TILE;

describe('track generator', () => {
  it('builds the same course every time', () => {
    const a = generateTrack({ seed: 1, world: 'jungle', courseId: 'lianen-lauf' });
    const b = generateTrack({ seed: 2, world: 'mine', courseId: 'lianen-lauf' });
    expect(a.world).toBe('jungle');
    expect(Buffer.from(a.tiles).equals(Buffer.from(b.tiles))).toBe(true);
  });

  it('random tracks depend on the seed', () => {
    const a = generateTrack({ seed: 1234, world: 'mine' });
    const b = generateTrack({ seed: 1234, world: 'mine' });
    const c = generateTrack({ seed: 999, world: 'mine' });
    expect(a.chunks.map((x) => x.name)).toEqual(b.chunks.map((x) => x.name));
    expect(c.chunks.map((x) => x.name)).not.toEqual(a.chunks.map((x) => x.name));
  });

  it('every course is about a minute long', () => {
    for (const course of COURSES) {
      const t = generateTrack({ seed: 1, world: course.world, courseId: course.id });
      const seconds = (t.finishX - t.startX) / RUN_MAX;
      expect(seconds, course.id).toBeGreaterThan(50);
      expect(seconds, course.id).toBeLessThan(75);
    }
  });

  it('has 8 worlds with their own pieces', () => {
    const worlds = new Set(MODULES.map((m) => m.world));
    expect(worlds.size).toBe(8);
    expect(COURSES.length).toBe(12);
  });
});

describe('runner physics', () => {
  const flat = () => new Race({ seed: 1, world: 'jungle', runnerCount: 1, chunkNames: [] });

  it('starts on the middle storey and runs at top speed', () => {
    const race = flat();
    runRace(race, [null], 1.5);
    const r = race.runners[0];
    expect(r.vx).toBeCloseTo(RUN_MAX, 0);
    expect(r.grounded).toBe(true);
    expect(r.y).toBe(MID_FLOOR);
  });

  const peak = (inputs: (t: number) => RunnerInput) => {
    const race = flat();
    let minY = Infinity;
    for (let i = 0; i < (COUNTDOWN_TIME + 1.2) * TICKS_PER_SEC; i++) {
      race.step([inputs(race.time)]);
      if (race.time > 0.3) minY = Math.min(minY, race.runners[0].y);
    }
    return { height: MID_FLOOR - minY, race };
  };

  it('jumps about three tiles high', () => {
    const { height } = peak((t) => ({ jump: t > 0.3 && t < 0.8, slide: false, use: 0 }));
    expect(height).toBeGreaterThan(120);
    expect(height).toBeLessThan(140);
  });

  it('double jump reaches the storey above through the ledge', () => {
    const { race } = peak((t) => ({ jump: (t > 0.3 && t < 0.5) || (t > 0.62 && t < 0.9), slide: false, use: 0 }));
    // landed on the top storey
    expect(race.runners[0].y).toBe(LANE_ROWS[0] * TILE);
  });

  it('slamming drops through the ledge to the storey below', () => {
    const race = flat();
    for (let i = 0; i < (COUNTDOWN_TIME + 1.5) * TICKS_PER_SEC; i++) {
      const t = race.time;
      race.step([{ jump: t > 0.3 && t < 0.35, slide: t > 0.45, use: 0 }]);
    }
    expect(race.runners[0].y).toBe(LANE_ROWS[2] * TILE);
  });

  it('can only pass a low beam while sliding', () => {
    const passes = (slide: boolean) => {
      const race = new Race({ seed: 1, world: 'jungle', runnerCount: 1, chunkNames: ['waterfall'] });
      const beamStart = (race.track.chunks[1].col + 14) * TILE;
      const beamEnd = (race.track.chunks[1].col + 21) * TILE;
      for (let i = 0; i < (COUNTDOWN_TIME + 6) * TICKS_PER_SEC; i++) {
        const r = race.runners[0];
        race.step([{ jump: false, slide: slide && r.x > beamStart - 80 && r.x < beamEnd, use: 0 }]);
      }
      const r = race.runners[0];
      return r.x > beamEnd && r.y === MID_FLOOR;
    };
    expect(passes(false)).toBe(false);
    expect(passes(true)).toBe(true);
  });
});

describe('chaos wall', () => {
  it('teleports runners that fall too far behind', () => {
    const race = new Race({ seed: 3, world: 'jungle', runnerCount: 2 });
    const log: SimEvent[] = [];
    runRace(race, [null, null], 2, log);
    race.runners[1].x = race.wallX - 5;
    log.push(...race.step([NO_INPUT, NO_INPUT]));
    expect(log.some((e) => e.t === 'swallowed' && e.r === 1)).toBe(true);
    expect(race.runners[1].x).toBeGreaterThan(race.wallX);
  });
});

describe('bots', () => {
  for (const m of MODULES) {
    it(`a good bot clears ${m.world}/${m.name}`, () => {
      const race = new Race({ seed: 5, world: m.world, runnerCount: 1, chunkNames: [m.name, m.name] });
      const log: SimEvent[] = [];
      runRace(race, [new BotBrain(1, { skill: 1 })], 60, log);
      const deaths = log.filter((e) => e.t === 'death');
      expect(race.runners[0].place, `deaths: ${JSON.stringify(deaths)}`).toBe(1);
      expect(deaths.length, JSON.stringify(deaths)).toBeLessThanOrEqual(2);
    });
  }

  it('four bots finish every course and spread over the storeys', () => {
    for (const course of COURSES) {
      const race = new Race({ seed: 7, world: course.world, runnerCount: 4, courseId: course.id });
      const brains = [0, 1, 2, 3].map((i) => new BotBrain(40 + i, botProfile('hard', i)));
      const log: SimEvent[] = [];
      runRace(race, brains, 150, log);
      expect(race.over, course.id).toBe(true);
      const winner = race.standings()[0];
      expect(winner.finishTime, course.id).toBeGreaterThan(30);
      expect(winner.finishTime, course.id).toBeLessThan(110);
    }
  }, 240000);

  it('every route is fair: each personality finishes alone without the wall, close together', () => {
    for (const course of COURSES) {
      const times = [0, 1, 2, 3].map((who) => {
        const race = new Race({ seed: course.seed, world: course.world, runnerCount: 1, courseId: course.id, noWall: true });
        const brain = new BotBrain(course.seed + who * 7919, botProfile('hard', who));
        for (let t = 0; t < 150 * TICKS_PER_SEC && race.runners[0].mode !== 'finished'; t++) {
          race.step([{ ...brain.think(race, 0), use: 0 }]);
        }
        return race.runners[0].finishTime;
      });
      for (const t of times) expect(t, `${course.id}: ${times}`).toBeGreaterThan(0);
      expect(Math.max(...times) - Math.min(...times), `${course.id}: ${times}`).toBeLessThan(10);
    }
  }, 240000);
});
