import { BOOST_SPEED, DT, TURBO_TIME } from './constants';
import { applyPads, levelHazard, lowerBound } from './hazards';
import { stepRunnerPhysics } from './physics';
import type { Race } from './race';
import { Rng } from './rng';
import type { RunnerInput, RunnerState } from './types';

type Plan = RunnerInput[];

const IDLE: RunnerInput = { jump: false, slide: false, use: 0 };
const JUMP: RunnerInput = { jump: true, slide: false, use: 0 };
const SLIDE: RunnerInput = { jump: false, slide: true, use: 0 };

function buildPlans(horizon: number): Plan[] {
  const plans: Plan[] = [];
  const make = (fn: (t: number) => RunnerInput) => {
    const p: Plan = [];
    for (let t = 0; t < horizon; t++) p.push(fn(t));
    plans.push(p);
  };
  make(() => IDLE);
  for (const len of [16, 30, horizon]) make((t) => (t < len ? SLIDE : IDLE));
  for (const delay of [0, 3, 6, 10, 15, 22, 30]) {
    for (const hold of [5, 12, 24]) make((t) => (t >= delay && t < delay + hold ? JUMP : IDLE));
  }
  // Two separate jumps (onto a ledge, then onwards).
  for (const delay of [0, 6]) {
    for (const second of [24, 32, 40, 50]) {
      make((t) => ((t >= delay && t < delay + 14) || (t >= second && t < second + 14) ? JUMP : IDLE));
    }
  }
  // Repeated presses: climbs walls with wall-jumps.
  for (const gap of [18, 24]) {
    make((t) => (t % gap < 13 ? JUMP : IDLE));
  }
  // Quick double jumps (up through a ledge to the next storey).
  for (const delay of [0, 4]) {
    for (const second of [10, 14, 18, 22]) {
      make((t) => ((t >= delay && t < delay + 9) || (t >= delay + second && t < delay + second + 10) ? JUMP : IDLE));
    }
  }
  // Jump, then slam down (fast fall; drops through ledges to the storey below).
  for (const diveAt of [6, 14, 22]) make((t) => (t < Math.min(12, diveAt - 2) ? JUMP : t >= diveAt ? SLIDE : IDLE));
  return plans;
}

function cloneRunner(r: RunnerState): RunnerState {
  return { ...r };
}

interface Outcome {
  dead: boolean;
  deathTick: number;
  x: number;
  y: number;
  blocked: number;
  climb: number;
  coins: number;
}

function simulate(race: Race, start: RunnerState, plan: Plan, from: number, horizon: number): Outcome {
  const r = cloneRunner(start);
  let blocked = 0;
  let coins = 0;
  const coinList = race.track.coins;
  const taken = race.coinTaken[start.id];
  let nextCoin = lowerBound(coinList, start.x - 20);
  for (let t = 0; t < horizon; t++) {
    const input = plan[from + t] ?? IDLE;
    const clock = race.clock + (t + 1) * DT;
    stepRunnerPhysics(r, input, race.track, DT, clock);
    applyPads(race.track, r);
    if (r.blocked) blocked++;
    if (levelHazard(race.track, r, clock)) {
      return { dead: true, deathTick: t, x: r.x, y: r.y, blocked, climb: 0, coins };
    }
    for (const trap of race.traps) {
      if (r.grounded && Math.abs(r.x - trap.x) < 20 && Math.abs(r.y - trap.y) < 10) {
        return { dead: true, deathTick: t, x: r.x, y: r.y, blocked, climb: 0, coins };
      }
    }
    while (nextCoin < coinList.length && coinList[nextCoin].x < r.x - 20) nextCoin++;
    for (let i = nextCoin; i < coinList.length && coinList[i].x < r.x + 20; i++) {
      if (!taken?.[i] && Math.abs(coinList[i].y - (r.y - 23)) < 30) coins++;
    }
  }
  return { dead: false, deathTick: horizon, x: r.x, y: r.y, blocked, climb: r.onWall ? start.y - r.y : 0, coins };
}

function score(o: Outcome, start: RunnerState, profile: BotProfile): number {
  if (o.dead) return -100000 + o.deathTick * 100 + (o.x - start.x) * 0.1;
  const lane = profile.lanePref ? profile.lanePref * (start.y - o.y) * 0.35 : 0;
  const coins = profile.coinLover ? Math.min(o.coins, 6) * 10 : 0;
  return o.x - start.x - o.blocked * 6 + o.climb * 0.5 + lane + coins;
}

export interface BotProfile {
  /** 0 = clumsy, 1 = sharp. */
  skill: number;
  /** Route taste: 1 = likes the high (fast, risky) storeys, -1 = prefers the safe low ones. */
  lanePref?: number;
  /** Detours for coins. */
  coinLover?: boolean;
}

/** Computer opponent: reads the track by simulating a few possible input plans ahead of time. */
export class BotBrain {
  private rng: Rng;
  private plan: Plan = [];
  private planPos = 0;
  private sinceFull = 0;
  private sinceCheck = 0;
  private itemTimer = -1;
  private readonly horizon: number;
  private readonly plans: Plan[];

  constructor(
    seed: number,
    readonly profile: BotProfile,
  ) {
    this.rng = new Rng(seed);
    this.horizon = Math.round(30 + 50 * profile.skill);
    this.plans = buildPlans(this.horizon);
  }

  think(race: Race, id: number): RunnerInput {
    const r = race.runners[id];
    if (r.mode !== 'run') {
      this.plan = [];
      this.planPos = 0;
      return IDLE;
    }
    const horizon = r.ink > 0 ? Math.round(this.horizon * 0.55) : this.horizon;
    // clumsy bots react late
    const checkEvery = Math.round(11 - 8 * this.profile.skill);

    this.sinceCheck++;
    this.sinceFull++;
    if (this.sinceCheck >= checkEvery || this.planPos >= this.plan.length) {
      this.sinceCheck = 0;
      const current = simulate(race, r, this.plan, this.planPos, horizon);
      const troubled = current.dead || current.blocked > 4;
      if (troubled || this.sinceFull >= 20) {
        this.sinceFull = 0;
        this.choosePlan(race, r, horizon, current);
      }
    }
    const input = this.plan[this.planPos] ?? IDLE;
    this.planPos++;
    return { ...input, use: this.decideItem(race, r), ability: this.decideAbility(race, r) };
  }

  /** Fire the special ability when it is charged and useful right now. */
  private decideAbility(race: Race, r: RunnerState): boolean {
    const kind = race.abilities[r.id];
    if (!kind || r.charge < 1 || this.rng.next() > 0.04 + 0.04 * this.profile.skill) return false;
    const others = race.runners.filter((o) => race.isRival(r.id, o.id) && o.mode === 'run');
    switch (kind) {
      case 'spores':
        return others.some((o) => o.x < r.x && r.x - o.x < 300 && Math.abs(o.y - r.y) < 150);
      case 'quake':
        return others.some((o) => Math.abs(o.x - r.x) < 300 && Math.abs(o.y - r.y) < 80);
      case 'tongue':
        return !r.item && r.rolling <= 0;
      case 'steal':
        return !r.item && r.rolling <= 0 && others.some((o) => o.item && o.x > r.x && o.x - r.x < 850);
      case 'fireworks':
        return others.some((o) => o.x > r.x && o.x - r.x < 1400);
      case 'megajump':
      case 'sprint':
      case 'bash':
      case 'mask':
        return r.grounded && !r.sliding;
    }
  }

  private choosePlan(race: Race, r: RunnerState, horizon: number, current: Outcome) {
    const scored: { plan: Plan; s: number }[] = [];
    // Keeping the current plan gets a small bonus so bots don't twitch.
    const keepPlan = this.plan.slice(this.planPos);
    scored.push({ plan: keepPlan, s: score(current, r, this.profile) + 4 });
    for (const plan of this.plans) {
      scored.push({ plan, s: score(simulate(race, r, plan, 0, horizon), r, this.profile) });
    }
    scored.sort((a, b) => b.s - a.s);
    let pick = scored[0];
    // Clumsier bots sometimes take a worse option, and now and then they simply blunder
    // (any plan at all, even one that ends in a saw) – like a human who taps at the wrong moment.
    const clumsy = 1 - this.profile.skill;
    if (scored.length > 2 && this.rng.next() < clumsy * 0.15) pick = scored[1 + this.rng.int(2)];
    if (this.rng.next() < clumsy * clumsy * 0.6) pick = scored[1 + this.rng.int(scored.length - 1)];
    this.plan = pick.plan;
    this.planPos = 0;
  }

  private decideItem(race: Race, r: RunnerState): -1 | 0 | 1 {
    if (!r.item || r.rolling > 0) {
      this.itemTimer = -1;
      return 0;
    }
    // clumsy bots hold on to their items longer (fewer hits flying around for beginners)
    if (this.itemTimer < 0) this.itemTimer = 0.3 + this.rng.next() * (2.2 - this.profile.skill * 1.4) + (1 - this.profile.skill) * 3;
    this.itemTimer -= DT;
    if (this.itemTimer > 0) return 0;

    if (r.item === 'turbo') {
      if (!r.grounded) return 0;
      const boosted = { ...r, boost: TURBO_TIME, vx: Math.max(r.vx, BOOST_SPEED) };
      if (simulate(race, boosted, this.plan, this.planPos, this.horizon).dead) return 0;
      this.sinceCheck = 99; // re-plan right away at the new speed
      return 1;
    }
    const others = race.runners.filter((o) => race.isRival(r.id, o.id) && o.mode === 'run');
    const ahead = others.filter((o) => o.x > r.x && o.x - r.x < 650 && Math.abs(o.y - r.y) < 90);
    const behind = others.filter((o) => o.x < r.x && r.x - o.x < 450);
    switch (r.item) {
      case 'saw':
        if (ahead.length) return 1;
        if (behind.length) return -1;
        return this.itemTimer < -4 ? 1 : 0;
      case 'trap':
        if (behind.length) return -1;
        if (ahead.length) return 1;
        return this.itemTimer < -3 ? -1 : 0;
      case 'rocket':
        if (others.some((o) => o.x > r.x)) return 1;
        return behind.length ? -1 : 0;
      case 'ink':
        return others.some((o) => o.x > r.x) || this.itemTimer < -5 ? 1 : 0;
      default:
        return 1;
    }
  }
}

const PERSONALITIES: Pick<BotProfile, 'lanePref' | 'coinLover'>[] = [
  { lanePref: 1 },
  { lanePref: -1 },
  { lanePref: 0, coinLover: true },
  { lanePref: 0.5 },
];

export type BotLevel = 'easy' | 'normal' | 'hard';

/**
 * How fast bots run compared to people. Bots on easy make mistakes but never tire and never hesitate,
 * so a beginner still lost to them: on easy and normal they also run a bit slower.
 */
export const BOT_PACE: Record<BotLevel, number> = { easy: 0.88, normal: 0.95, hard: 1 };

/** Speed factor of every runner: bots by level, people 1. */
export function paceFor(isBot: boolean[], level: BotLevel): number[] {
  return isBot.map((bot) => (bot ? BOT_PACE[level] : 1));
}

export function botProfile(level: BotLevel, index: number): BotProfile {
  const base = level === 'easy' ? 0.1 : level === 'normal' ? 0.45 : 0.9;
  return { skill: Math.max(0, Math.min(1, base + (index - 1) * 0.05)), ...PERSONALITIES[index % PERSONALITIES.length] };
}
