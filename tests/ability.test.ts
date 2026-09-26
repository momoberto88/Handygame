import { describe, expect, it } from 'vitest';
import { BotBrain, botProfile } from '../src/sim/bot';
import { STUN_TIME } from '../src/sim/constants';
import { Race } from '../src/sim/race';
import { ABILITY_KINDS, NO_INPUT, type AbilityKind, type RunnerInput, type SimEvent } from '../src/sim/types';

function raceWith(me: AbilityKind, others: AbilityKind = 'sprint') {
  const race = new Race({ seed: 3, world: 'jungle', runnerCount: 4, courseId: 'lianen-lauf', abilities: [me, others, others, others] });
  // skip the countdown
  while (race.time < 0.2) race.step([NO_INPUT, NO_INPUT, NO_INPUT, NO_INPUT]);
  return race;
}

function fire(race: Race): SimEvent[] {
  race.runners[0].charge = 1;
  const input: RunnerInput = { ...NO_INPUT, ability: true };
  return race.step([input, NO_INPUT, NO_INPUT, NO_INPUT]);
}

describe('character abilities', () => {
  it('charge over time and with coins, and only fire when full', () => {
    const race = raceWith('sprint');
    const r = race.runners[0];
    expect(r.charge).toBeGreaterThan(0);
    const before = r.charge;
    race.step([{ ...NO_INPUT, ability: true }, NO_INPUT, NO_INPUT, NO_INPUT]);
    expect(r.boost).toBe(0); // not charged yet: nothing happens
    expect(r.charge).toBeGreaterThan(before);
    const ev = fire(race);
    expect(ev.some((e) => e.t === 'ability' && e.kind === 'sprint')).toBe(true);
    expect(r.boost).toBeGreaterThan(1);
    expect(r.charge).toBe(0);
  });

  it('every kind does its thing', () => {
    const check: Record<AbilityKind, (race: Race) => void> = {
      megajump: (race) => expect(race.runners[0].vy).toBeLessThan(-1000),
      sprint: (race) => expect(race.runners[0].boost).toBeGreaterThan(1),
      spores: (race) => expect(race.runners.slice(1).some((o) => o.stun > 0)).toBe(true),
      tongue: (race) => expect(race.runners[0].rolling).toBeGreaterThan(0),
      steal: (race) => expect(race.runners[0].item).toBe('shield'),
      quake: (race) => expect(race.runners.slice(1).some((o) => o.stun > STUN_TIME * 0.5)).toBe(true),
      mask: (race) => expect(race.runners[0].ghost).toBeGreaterThan(2),
      bash: (race) => expect(race.runners[0].shield).toBeGreaterThan(3),
    };
    for (const kind of ABILITY_KINDS) {
      const race = raceWith(kind);
      const [me, a] = race.runners;
      // put a rival right behind (spores) or just ahead with an item (steal)
      a.x = kind === 'steal' ? me.x + 200 : me.x - 60;
      a.y = me.y;
      a.item = 'shield';
      a.grounded = true;
      fire(race);
      check[kind](race);
    }
  });

  it('bots use their abilities during a race', () => {
    const race = new Race({ seed: 9, world: 'jungle', runnerCount: 4, courseId: 'lianen-lauf', abilities: ['megajump', 'sprint', 'quake', 'mask'] });
    const brains = [0, 1, 2, 3].map((i) => new BotBrain(50 + i, botProfile('hard', i)));
    const used = new Set<string>();
    for (let t = 0; t < 60 * 90 && !race.over; t++) {
      for (const e of race.step(race.runners.map((_, i) => brains[i].think(race, i)))) if (e.t === 'ability') used.add(e.kind);
    }
    expect(used.size).toBeGreaterThanOrEqual(3);
    expect(race.over).toBe(true);
  }, 60000);
});
