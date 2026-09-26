import { describe, expect, it } from 'vitest';
import { assignTeams, cupTeamScores, teamScores } from '../src/meta/teams';
import { addRaceResult, newCup } from '../src/meta/cup';
import type { RacerInfo } from '../src/net/session';
import { BotBrain, botProfile } from '../src/sim/bot';
import { Race } from '../src/sim/race';
import { NO_INPUT, type RunnerInput } from '../src/sim/types';

const CAST = ['hase', 'katze', 'ratte', 'otter'];
const racer = (id: number, seat: number | undefined, isBot = false): RacerInfo => ({ id, seat, name: `R${id}`, character: CAST[id], isBot });

function teamRace() {
  // runners 0+1 are team blue, 2+3 team red
  const race = new Race({ seed: 3, world: 'jungle', runnerCount: 4, courseId: 'lianen-lauf', teams: [0, 0, 1, 1] });
  while (race.time < 0.2) race.step([NO_INPUT, NO_INPUT, NO_INPUT, NO_INPUT]);
  return race;
}

function useItem(race: Race) {
  const input: RunnerInput = { ...NO_INPUT, use: 1 };
  return race.step([input, NO_INPUT, NO_INPUT, NO_INPUT]);
}

describe('2 vs 2', () => {
  it('humans play for their seat, bots fill the free seats', () => {
    const racers = [racer(0, 0), racer(1, 1), racer(2, undefined, true), racer(3, undefined, true)];
    // pairing 1: seats 1+3 vs 2+4 → seat 0 and seat 2 (first bot) are blue
    expect(assignTeams(racers, 1).map((r) => r.team)).toEqual([0, 1, 0, 1]);
    expect(assignTeams(racers, 0).map((r) => r.team)).toEqual([0, 0, 1, 1]);
    // players on seats 0 and 3, pairing 2 (1+4 vs 2+3): both blue, the bots red
    const split = [racer(0, 0), racer(1, 3), racer(2, undefined, true), racer(3, undefined, true)];
    expect(assignTeams(split, 2).map((r) => r.team)).toEqual([0, 0, 1, 1]);
  });

  it('lightning spares the teammate', () => {
    const race = teamRace();
    race.runners[0].item = 'lightning';
    useItem(race);
    expect(race.runners[1].mode).toBe('run');
    expect(race.runners[2].mode).toBe('dead');
    expect(race.runners[3].mode).toBe('dead');
  });

  it('a saw flies through the teammate and hits the rival', () => {
    const race = teamRace();
    const [me, mate, rival, other] = race.runners;
    mate.x = me.x + 120;
    mate.y = me.y;
    rival.x = me.x + 320;
    rival.y = me.y;
    other.x = me.x - 400;
    me.item = 'saw';
    useItem(race);
    for (let i = 0; i < 40; i++) race.step([NO_INPUT, NO_INPUT, NO_INPUT, NO_INPUT]);
    expect(mate.deaths).toBe(0);
    expect(rival.deaths).toBe(1);
  });

  it('team points: places add up, the better single place breaks ties', () => {
    // blue 1st + 4th = 11, red 2nd + 3rd = 9
    expect(teamScores([{ team: 0 }, { team: 1 }, { team: 1 }, { team: 0 }])[0]).toMatchObject({ team: 0, points: 11 });
    // 10 + 1 vs 6 + 3 + ... equal points: 1st place wins
    const tie = teamScores([{ team: 1 }, { team: 0 }, { team: 0 }, { team: 1 }]);
    expect(tie[0].team).toBe(1);
  });

  it('a team cup adds the points of both members', () => {
    const racers = assignTeams([racer(0, 0), racer(1, undefined, true), racer(2, undefined, true), racer(3, undefined, true)]);
    const cup = newCup('custom', 'Test', ['a', 'b'], 1);
    cup.teams = true;
    addRaceResult(cup, [racers[2], racers[0], racers[3], racers[1]]);
    const [first, second] = cupTeamScores(cup);
    expect(first).toMatchObject({ team: 1, points: 13 });
    expect(second).toMatchObject({ team: 0, points: 7 });
  });

  it('bots finish a team race', () => {
    const race = new Race({ seed: 5, world: 'jungle', runnerCount: 4, courseId: 'lianen-lauf', teams: [0, 1, 0, 1] });
    const brains = [0, 1, 2, 3].map((i) => new BotBrain(70 + i, botProfile('hard', i)));
    for (let t = 0; t < 60 * 90 && !race.over; t++) race.step(race.runners.map((_, i) => brains[i].think(race, i)));
    expect(race.over).toBe(true);
  }, 60000);
});
