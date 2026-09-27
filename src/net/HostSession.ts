import { BOT_PACE, BotBrain, botProfile, paceFor, type BotLevel } from '../sim/bot';
import { DT } from '../sim/constants';
import { Race } from '../sim/race';
import type { RunnerInput, SimEvent, WorldId } from '../sim/types';
import { TickClock } from './LocalSession';
import { SNAPSHOT_EVERY, packProjectile, packRunner, packTrap, type ClientMsg, type SnapshotMsg } from './protocol';
import type { NetRoom } from './room';
import type { LocalInput, RaceSession, RacerInfo } from './session';
import { abilitiesOf } from '../meta/characters';
import { teamsOf } from '../meta/teams';

const TICK_MS = DT * 1000;

interface RemotePlayer {
  seat: number;
  queue: { s: number; j: 0 | 1; d: 0 | 1 }[];
  last: { j: 0 | 1; d: 0 | 1 };
  ack: number;
  use: -1 | 0 | 1;
  ability: boolean;
}

export interface HostSetup {
  seed: number;
  world: WorldId;
  courseId?: string;
  racers: RacerInfo[];
  /** seat → racer id for every remote human. */
  seatToRacer: Map<number, number>;
  /** The host is knocked out and watches racer `watch`. */
  spectator?: boolean;
  watch?: number;
  /** Seats of knocked-out players who only watch (they get snapshots, send no inputs). */
  watchers?: number[];
  /** How good the bots are (the host's setting). */
  botLevel?: BotLevel;
}

/** The hosting phone: runs the authoritative race and streams snapshots to the others. */
export class HostSession implements RaceSession {
  readonly race: Race;
  readonly racers: RacerInfo[];
  readonly localId: number;
  readonly spectator: boolean;
  readonly online = true;
  private brains: (BotBrain | null)[];
  private readonly botLevel: BotLevel;
  private remotes = new Map<number, RemotePlayer>();
  private watchers: number[];
  private clock = new TickClock();
  private pendingUse: -1 | 0 | 1 = 0;
  private pendingAbility = false;
  private outEvents: SimEvent[] = [];
  private notice: { text: string; until: number } | null = null;
  private announcedEnd = false;

  constructor(
    private room: NetRoom,
    setup: HostSetup,
  ) {
    this.race = new Race({ seed: setup.seed, world: setup.world, runnerCount: setup.racers.length, courseId: setup.courseId, abilities: abilitiesOf(setup.racers), teams: teamsOf(setup.racers), humans: setup.racers.map((r) => !r.isBot), wallSpeed: setup.botLevel === 'easy' ? 0.85 : 1, pace: paceFor(setup.racers.map((r) => r.isBot), setup.botLevel ?? 'normal') });
    this.racers = setup.racers.map((r) => ({ ...r }));
    this.spectator = setup.spectator ?? false;
    this.botLevel = setup.botLevel ?? 'normal';
    this.watchers = setup.watchers ?? [];
    this.localId = this.spectator ? (setup.watch ?? 0) : 0;
    this.brains = this.racers.map((r, i) => (r.isBot ? new BotBrain(setup.seed + i * 7919, botProfile(this.botLevel, i)) : null));
    for (const [seat, id] of setup.seatToRacer) {
      this.remotes.set(id, { seat, queue: [], last: { j: 0, d: 0 }, ack: 0, use: 0, ability: false });
    }
    room.onClientMessage = this.onClientMessage;
    room.onSeatLeft = this.onSeatLeft;
    this.clock.snapshot(this.race);
  }

  private onClientMessage = (seat: number, msg: ClientMsg) => this.onMessage(seat, msg);
  private onSeatLeft = (seat: number, name: string) => this.onLeft(seat, name);

  private racerForSeat(seat: number): number {
    for (const [id, rp] of this.remotes) if (rp.seat === seat) return id;
    return -1;
  }

  private onMessage(seat: number, msg: ClientMsg) {
    const id = this.racerForSeat(seat);
    const rp = this.remotes.get(id);
    if (!rp) return;
    if (msg.t === 'in') {
      rp.queue.push({ s: msg.s, j: msg.j, d: msg.d });
      // a flood of inputs (broken or changed game) must not pile up
      if (rp.queue.length > 240) rp.queue.splice(0, rp.queue.length - 240);
    }
    else if (msg.t === 'use') rp.use = msg.dir;
    else if (msg.t === 'ab') rp.ability = true;
    else if (msg.t === 'emote') this.emote(id, msg.e);
  }

  private onLeft(seat: number, name: string) {
    const id = this.racerForSeat(seat);
    if (id < 0) return;
    this.remotes.delete(id);
    this.brains[id] = new BotBrain(this.race.tick + id, botProfile(this.botLevel, id));
    this.race.runners[id].pace = BOT_PACE[this.botLevel];
    this.racers[id].isBot = true;
    this.notice = { text: `${name} ist weg – ein Bot übernimmt`, until: performance.now() + 4000 };
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
        if (info.id === this.localId && !this.spectator) {
          const use = this.pendingUse;
          const ability = this.pendingAbility;
          this.pendingUse = 0;
          this.pendingAbility = false;
          return { jump: input.jump, slide: input.slide, use, ability };
        }
        const rp = this.remotes.get(info.id);
        if (!rp) return { jump: false, slide: false, use: 0 };
        // Keep the queue short so a player who lagged doesn't stay behind forever.
        while (rp.queue.length > 4) rp.queue.shift();
        const next = rp.queue.shift();
        if (next) {
          rp.last = next;
          rp.ack = next.s;
        }
        const use = rp.use;
        const ability = rp.ability;
        rp.use = 0;
        rp.ability = false;
        return { jump: rp.last.j === 1, slide: rp.last.d === 1, use, ability };
      });
      const stepEvents = this.race.step(inputs);
      events.push(...stepEvents);
      this.outEvents.push(...stepEvents);
      if (this.race.tick % SNAPSHOT_EVERY === 0) this.sendSnapshot();
    }
    this.clock.alpha = this.clock.acc / TICK_MS;
    if (this.race.over && !this.announcedEnd) {
      this.announcedEnd = true;
      this.sendSnapshot();
      this.room.racing = false;
      this.room.broadcastLobby();
    }
    return events;
  }

  private sendSnapshot() {
    const race = this.race;
    const b: number[][] = [];
    race.boxCooldown.forEach((cd, i) => {
      if (cd > 0) b.push([i, Math.round(cd * 100) / 100]);
    });
    const base: Omit<SnapshotMsg, 'a'> = {
      t: 'snap',
      k: race.tick,
      w: Math.round(race.wallX * 10) / 10,
      e: race.endTime,
      f: race.finishCount,
      o: race.over ? 1 : 0,
      r: race.runners.map(packRunner),
      p: race.projectiles.map(packProjectile),
      tr: race.traps.map(packTrap),
      b,
      cr: [...race.crumbles].map(([idx, c]) => [idx, Math.round(c.t * 100) / 100, c.broken ? 1 : 0]),
      ev: this.outEvents,
    };
    this.outEvents = [];
    for (const rp of this.remotes.values()) this.room.sendTo(rp.seat, { ...base, a: rp.ack });
    for (const seat of this.watchers) this.room.sendTo(seat, { ...base, a: 0 });
  }

  prevPosition(id: number) {
    return this.clock.prevPosition(this.race, id);
  }

  status() {
    if (this.notice && performance.now() < this.notice.until) return this.notice.text;
    return null;
  }

  private emotes: [number, number][] = [];

  /** Shows an emote here and on every other phone. */
  private emote(r: number, e: number) {
    this.emotes.push([r, e]);
    for (const rp of this.remotes.values()) this.room.sendTo(rp.seat, { t: 'emote', r, e });
    for (const seat of this.watchers) this.room.sendTo(seat, { t: 'emote', r, e });
  }

  sendEmote(e: number) {
    if (!this.spectator) this.emote(this.localId, e);
  }

  takeEmotes() {
    const out = this.emotes;
    this.emotes = [];
    return out;
  }

  destroy() {
    // The next race's session may already be listening: only unhook our own handlers.
    if (this.room.onClientMessage === this.onClientMessage) this.room.onClientMessage = null;
    if (this.room.onSeatLeft === this.onSeatLeft) this.room.onSeatLeft = null;
  }
}
