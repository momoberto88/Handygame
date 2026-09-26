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
