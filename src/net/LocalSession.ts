import { BotBrain, botProfile } from '../sim/bot';
import { DT } from '../sim/constants';
import { Race } from '../sim/race';
import type { RunnerInput, SimEvent, WorldId } from '../sim/types';
import type { LocalInput, RaceSession, RacerInfo } from './session';
import { abilitiesOf } from '../meta/characters';
import { teamsOf } from '../meta/teams';

const TICK_MS = DT * 1000;

export class TickClock {
  acc = 0;
  alpha = 0;
  prev: { x: number; y: number }[] = [];

  snapshot(race: Race) {
    this.prev = race.runners.map((r) => ({ x: r.x, y: r.y }));
  }

  prevPosition(race: Race, id: number) {
    const r = race.runners[id];
    const p = this.prev[id];
    if (!p || Math.abs(p.x - r.x) > 80 || Math.abs(p.y - r.y) > 80) return { x: r.x, y: r.y };
    return p;
  }
}

export interface LocalSetup {
  seed: number;
  world: WorldId;
  courseId?: string;
  racers: RacerInfo[];
  botLevel: 'easy' | 'normal' | 'hard';
  localId: number;
  /** Only bots race; the phone watches racer `localId`. */
  spectator?: boolean;
  /** Practice run: no chaos wall, the HUD coach explains the controls. */
  tutorial?: boolean;
}

/** Offline race against computer opponents. */
export class LocalSession implements RaceSession {
  readonly race: Race;
  readonly racers: RacerInfo[];
  readonly localId: number;
  readonly online = false;
  readonly tutorial: boolean;
  readonly spectator: boolean;
  private brains: (BotBrain | null)[];
  private clock = new TickClock();
  private pendingUse: -1 | 0 | 1 = 0;
  private pendingAbility = false;

  constructor(setup: LocalSetup) {
    this.race = new Race({ seed: setup.seed, world: setup.world, runnerCount: setup.racers.length, courseId: setup.courseId, abilities: abilitiesOf(setup.racers), teams: teamsOf(setup.racers), humans: setup.racers.map((r) => !r.isBot), wallSpeed: setup.botLevel === 'easy' ? 0.85 : 1, noWall: setup.tutorial });
    this.racers = setup.racers;
    this.tutorial = setup.tutorial ?? false;
    this.localId = setup.localId;
    this.spectator = setup.spectator ?? false;
    this.brains = setup.racers.map((r, i) =>
      r.isBot ? new BotBrain(setup.seed + i * 7919, botProfile(setup.botLevel, i)) : null,
    );
    this.clock.snapshot(this.race);
  }

  get alpha() {
    return this.clock.alpha;
  }

  update(dtMs: number, input: LocalInput): SimEvent[] {
    const events: SimEvent[] = [];
    if (input.use) this.pendingUse = input.use;
    if (input.ability) this.pendingAbility = true;
    this.clock.acc += Math.min(dtMs, 200);
    while (this.clock.acc >= TICK_MS) {
      this.clock.acc -= TICK_MS;
      this.clock.snapshot(this.race);
      const inputs: RunnerInput[] = this.racers.map((info) => {
        const brain = this.brains[info.id];
        if (brain) return brain.think(this.race, info.id);
        if (info.id === this.localId) {
          const use = this.pendingUse;
          const ability = this.pendingAbility;
          this.pendingUse = 0;
          this.pendingAbility = false;
          return { jump: input.jump, slide: input.slide, use, ability };
        }
        return { jump: false, slide: false, use: 0 };
      });
      events.push(...this.race.step(inputs));
    }
    this.clock.alpha = this.clock.acc / TICK_MS;
    return events;
  }

  prevPosition(id: number) {
    return this.clock.prevPosition(this.race, id);
  }

  status() {
    return null;
  }

  private emotes: [number, number][] = [];

  sendEmote(e: number) {
    if (!this.spectator) this.emotes.push([this.localId, e]);
  }

  takeEmotes() {
    const out = this.emotes;
    this.emotes = [];
    return out;
  }

  destroy() {}
}
