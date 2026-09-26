import { describe, expect, it } from 'vitest';
import { CHEST_COINS, chestReady, claimTask, countRace, openChest, refreshDaily, tasksFor } from '../src/meta/daily';

describe('daily chest and tasks', () => {
  it('the chest opens once a day and the streak grows on following days', () => {
    const s = refreshDaily(undefined, '2026-09-26');
    expect(openChest(s, '2026-09-26')).toBe(CHEST_COINS[0]);
    expect(openChest(s, '2026-09-26')).toBe(0);
    expect(chestReady(s, '2026-09-27')).toBe(true);
    expect(openChest(s, '2026-09-27')).toBe(CHEST_COINS[1]);
    // month change counts as the next day too
    s.chestDay = '2026-09-30';
    expect(openChest(s, '2026-10-01')).toBe(CHEST_COINS[2]);
    // a missed day starts over
    expect(openChest(s, '2026-10-03')).toBe(CHEST_COINS[0]);
  });

  it('three different tasks per day, the same for everyone', () => {
    const a = tasksFor('2026-09-26');
    expect(new Set(a.map((t) => t.id)).size).toBe(3);
    expect(tasksFor('2026-09-26')).toEqual(a);
    const s = refreshDaily({ chestDay: '', streak: 0, taskDay: '2026-09-25', tasks: [] }, '2026-09-26');
    expect(s.tasks.map((t) => t.id)).toEqual(a.map((t) => t.id));
  });

  it('races count towards the tasks and done tasks pay once', () => {
    const s = refreshDaily(undefined, '2026-09-26');
    s.tasks = [
      { id: 'win', progress: 0, claimed: false },
      { id: 'coins', progress: 0, claimed: false },
      { id: 'races', progress: 0, claimed: false },
    ];
    expect(countRace(s, { place: 2, coins: 40, deaths: 1, hits: 0, abilities: 1 })).toEqual([]);
    expect(claimTask(s, 'coins')).toBe(0);
    expect(countRace(s, { place: 1, coins: 30, deaths: 0, hits: 2, abilities: 0 })).toEqual(['win', 'coins']);
    expect(claimTask(s, 'coins')).toBe(40);
    expect(claimTask(s, 'coins')).toBe(0);
    countRace(s, { place: 3, coins: 0, deaths: 0, hits: 0, abilities: 0 });
    expect(s.tasks.find((t) => t.id === 'races')!.progress).toBe(3);
  });
});
