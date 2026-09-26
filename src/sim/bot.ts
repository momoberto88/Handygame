import { DT } from './constants';
import { applyPads, levelHazard } from './hazards';
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
  for (const delay of [0, 3, 6, 10, 15, 22]) {
    for (const hold of [5, 12, 24]) make((t) => (t >= delay && t < delay + hold ? JUMP : IDLE));
  }
  // Repeated presses: climbs walls with wall-jumps.
  for (const delay of [0, 6]) {
    for (const gap of [18, 24, 32]) {
      make((t) => {
        const k = t - delay;
        if (k < 0) return IDLE;
        return k % gap < 13 ? JUMP : IDLE;
      });
    }
  }
  // Jump, then dive down (fast fall) to dodge something overhead.
  for (const diveAt of [14, 22]) make((t) => (t < 12 ? JUMP : t >= diveAt ? SLIDE : IDLE));
  return plans;
}

function cloneRunner(r: RunnerState): RunnerState {
  return { ...r };
}

interface Outcome {
  dead: boolean;
  deathTick: number;
  x: number;
  blocked: number;
  climb: number;
}

function simulate(race: Race, start: RunnerState, plan: Plan, from: number, horizon: number): Outcome {
  const r = cloneRunner(start);
  let blocked = 0;
  for (let t = 0; t < horizon; t++) {
    const input = plan[from + t] ?? IDLE;
    stepRunnerPhysics(r, input, race.track, DT);
    applyPads(race.track, r);
    if (r.blocked) blocked++;
    if (levelHazard(race.track, r, race.clock + (t + 1) * DT)) {
      return { dead: true, deathTick: t, x: r.x, blocked, climb: 0 };
    }
    for (const trap of race.traps) {
      if (r.grounded && Math.abs(r.x - trap.x) < 20 && Math.abs(r.y - trap.y) < 10) {
        return { dead: true, deathTick: t, x: r.x, blocked, climb: 0 };
      }
    }
  }
  return { dead: false, deathTick: horizon, x: r.x, blocked, climb: r.onWall ? start.y - r.y : 0 };
}

function score(o: Outcome, start: RunnerState): number {
  if (o.dead) return -100000 + o.deathTick * 100 + (o.x - start.x) * 0.1;
  return o.x - start.x - o.blocked * 6 + o.climb * 0.5;
}

export interface BotProfile {
  /** 0 = clumsy, 1 = sharp. */
  skill: number;
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
    this.horizon = Math.round(34 + 22 * profile.skill);
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
    const checkEvery = Math.round(8 - 5 * this.profile.skill);

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
    return { ...input, use: this.decideItem(race, r) };
  }

  private choosePlan(race: Race, r: RunnerState, horizon: number, current: Outcome) {
    const scored: { plan: Plan; s: number }[] = [];
    // Keeping the current plan gets a small bonus so bots don't twitch.
    const keepPlan = this.plan.slice(this.planPos);
    scored.push({ plan: keepPlan, s: score(current, r) + 4 });
    for (const plan of this.plans) {
      scored.push({ plan, s: score(simulate(race, r, plan, 0, horizon), r) });
    }
    scored.sort((a, b) => b.s - a.s);
    let pick = scored[0];
    // Clumsier bots sometimes take a worse option.
    const mistake = (1 - this.profile.skill) * 0.12;
    if (scored.length > 2 && this.rng.next() < mistake) pick = scored[1 + this.rng.int(2)];
    this.plan = pick.plan;
    this.planPos = 0;
  }

  private decideItem(race: Race, r: RunnerState): -1 | 0 | 1 {
    if (!r.item || r.rolling > 0) {
      this.itemTimer = -1;
      return 0;
    }
    if (this.itemTimer < 0) this.itemTimer = 0.3 + this.rng.next() * (2.2 - this.profile.skill * 1.4);
    this.itemTimer -= DT;
    if (this.itemTimer > 0) return 0;

    const others = race.runners.filter((o) => o.id !== r.id && o.mode === 'run');
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

export function botProfile(level: 'easy' | 'normal' | 'hard', index: number): BotProfile {
  const base = level === 'easy' ? 0.25 : level === 'normal' ? 0.55 : 0.85;
  return { skill: Math.max(0, Math.min(1, base + (index - 1) * 0.07)) };
}
