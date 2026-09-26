import { describe, expect, it } from 'vitest';
import { addRaceResult, cupRanking, isLastRace, newCup, randomCourses, racerKey } from '../src/meta/cup';
import type { RacerInfo } from '../src/net/session';
import { COURSES } from '../src/sim/track/courses';

const racer = (id: number, name: string, character: string, isBot = false): RacerInfo => ({ id, name, character, isBot });
const A = racer(0, 'Hoppel', 'hase');
const B = racer(1, 'Hoppel', 'hase'); // a friend with the same name
const C = racer(2, 'Pilzi', 'pilz', true);
const D = racer(3, 'Flinki', 'fuchs', true);

describe('cup', () => {
  it('gives 10/6/3/1 points and counts every race only once', () => {
    const cup = newCup('custom', 'Test', ['a', 'b'], 1);
    addRaceResult(cup, [C, A, D, B]);
    addRaceResult(cup, [C, A, D, B]); // same race again (e.g. screen shown twice)
    expect(cupRanking(cup).map((e) => [e.name, e.points])).toEqual([
      ['Pilzi', 10],
      ['Hoppel', 6],
      ['Flinki', 3],
      ['Hoppel', 1],
    ]);
    cup.index = 1;
    expect(isLastRace(cup)).toBe(true);
    addRaceResult(cup, [B, D, A, C]);
    const t = Object.fromEntries(cup.table.map((e) => [e.key, e.points]));
    expect(t[racerKey(A)]).toBe(9);
    expect(t[racerKey(B)]).toBe(11);
    expect(t[racerKey(C)]).toBe(11);
    // tie on points: the better latest race wins
    expect(cupRanking(cup)[0].key).toBe(racerKey(B));
  });

  it('keeps two players with the same name apart', () => {
    expect(racerKey(A)).not.toBe(racerKey(B));
  });

  it('random cups use different courses', () => {
    const list = randomCourses(8, 42);
    expect(list).toHaveLength(8);
    expect(new Set(list).size).toBe(8);
    for (const id of list) expect(COURSES.some((c) => c.id === id)).toBe(true);
    expect(randomCourses(8, 42)).toEqual(list);
  });
});

import { GhostRecorder, ghostAt, GHOST_EVERY } from '../src/meta/ghost';
import { createRunner } from '../src/sim/race';
import { DT } from '../src/sim/constants';

describe('ghost of the best run', () => {
  it('records every few ticks and replays smoothly in between', () => {
    const rec = new GhostRecorder();
    const r = createRunner(0, 0, 400);
    for (let tick = 0; tick <= 60; tick++) {
      r.x = tick * 5;
      r.grounded = tick < 30;
      rec.sample(tick, tick * DT, r);
    }
    expect(rec.frames.length / 3).toBe(Math.floor(60 / GHOST_EVERY) + 1);
    // slow frame rate: only every 7th tick is sampled, the timeline must still line up
    const slow = new GhostRecorder();
    for (let tick = 0; tick <= 60; tick += 7) {
      r.x = tick * 5;
      slow.sample(tick, tick * DT, r);
    }
    expect(slow.frames.length / 3).toBe(Math.floor(56 / GHOST_EVERY) + 1);
    const g = { courseId: 'x', time: 1, character: 'hase', frames: rec.frames };
    const s = createRunner(1, 0, 0);
    expect(ghostAt(g, 10 * DT, s)).toBe(true);
    expect(s.x).toBeCloseTo(50, 5);
    expect(s.grounded).toBe(true);
    expect(ghostAt(g, 45 * DT, s)).toBe(true);
    expect(s.grounded).toBe(false);
    expect(ghostAt(g, 5, s)).toBe(false); // finished
  });
});
