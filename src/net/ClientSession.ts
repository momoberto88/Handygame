import { COUNTDOWN_TIME, DT, TICKS_PER_SEC } from '../sim/constants';
import { applyPads } from '../sim/hazards';
import { stepRunnerPhysics } from '../sim/physics';
import { Race, createRunner } from '../sim/race';
import { Tile, type RunnerState, type SimEvent } from '../sim/types';
import { unpackProjectile, unpackRunner, unpackTrap, type HostMsg, type SnapshotMsg } from './protocol';
import type { NetRoom } from './room';
import type { LocalInput, RaceSession, RacerInfo } from './session';

const TICK_MS = DT * 1000;
/** Remote runners are drawn this many ticks in the past so there are always two snapshots to blend. */
const INTERP_TICKS = 7;

interface Buffered {
  k: number;
  states: RunnerState[];
}

/**
 * A joining phone: predicts its own runner immediately (so jumping feels instant), corrects it
 * with the host's snapshots, and shows everyone else smoothly interpolated.
 */
export class ClientSession implements RaceSession {
  readonly race: Race;
  readonly racers: RacerInfo[];
  readonly localId: number;
  readonly online = true;
  alpha = 0;
  private acc = 0;
  private seq = 0;
  private history: { s: number; j: 0 | 1; d: 0 | 1 }[] = [];
  private buffer: Buffered[] = [];
  private inbox: SnapshotMsg[] = [];
  private hostTick = 0;
  private started = false;
  private lastSnapAt = performance.now();
  private prevLocal = { x: 0, y: 0 };
  private offset = { x: 0, y: 0 };
  private lost: string | null = null;

  constructor(
    private room: NetRoom,
    start: Extract<HostMsg, { t: 'start' }>,
  ) {
    this.race = new Race({ seed: start.seed, world: start.world, runnerCount: start.racers.length, courseId: start.courseId });
    this.racers = start.racers;
    this.localId = start.you;
    const me = this.race.runners[this.localId];
    this.prevLocal = { x: me.x, y: me.y };
    room.onHostMessage = (msg) => {
      if (msg.t === 'snap') this.inbox.push(msg);
    };
    room.onClosed = (reason) => {
      this.lost = reason;
    };
  }

  private get local(): RunnerState {
    return this.race.runners[this.localId];
  }

  update(dtMs: number, input: LocalInput): SimEvent[] {
    const events: SimEvent[] = [];
    const dt = Math.min(dtMs, 200) / 1000;

    for (const snap of this.inbox) this.applySnapshot(snap, events);
    this.inbox = [];

    this.hostTick += dt * TICKS_PER_SEC;
    this.race.tick = Math.max(0, Math.floor(this.hostTick));

    if (input.use) this.room.send({ t: 'use', dir: input.use });
    this.acc += dt * 1000;
    while (this.acc >= TICK_MS) {
      this.acc -= TICK_MS;
      const inp = { s: ++this.seq, j: (input.jump ? 1 : 0) as 0 | 1, d: (input.slide ? 1 : 0) as 0 | 1 };
      this.history.push(inp);
      if (this.history.length > 180) this.history.shift();
      this.room.send({ t: 'in', ...inp });
      const me = this.local;
      this.prevLocal = { x: me.x, y: me.y };
      if (this.canPredict()) {
        const res = stepRunnerPhysics(me, { jump: input.jump, slide: input.slide, use: 0 }, this.race.track, DT, this.hostTick * DT);
        applyPads(this.race.track, me);
        if (res.jumped) events.push({ t: 'jump', r: this.localId, wall: res.wallJumped, double: res.doubleJumped });
        if (res.slammed) events.push({ t: 'slam', r: this.localId, x: me.x, y: me.y });
        if (res.landed && res.landSpeed > 250) events.push({ t: 'land', r: this.localId, v: res.landSpeed });
      }
    }
    this.alpha = this.acc / TICK_MS;

    this.interpolateRemotes();
    const decay = Math.exp(-dt * 12);
    this.offset.x *= decay;
    this.offset.y *= decay;
    return events;
  }

  private canPredict(): boolean {
    return this.started && this.local.mode === 'run' && !this.race.over && this.hostTick >= COUNTDOWN_TIME * TICKS_PER_SEC;
  }

  private applySnapshot(snap: SnapshotMsg, events: SimEvent[]) {
    this.lastSnapAt = performance.now();
    if (!this.started) {
      this.started = true;
      this.hostTick = snap.k;
    } else {
      const err = snap.k - this.hostTick;
      if (Math.abs(err) > 30) this.hostTick = snap.k;
      else this.hostTick += err * 0.1;
    }
    const race = this.race;
    race.wallX = snap.w;
    race.endTime = snap.e;
    race.finishCount = snap.f;
    race.over = snap.o === 1;
    race.projectiles = snap.p.map(unpackProjectile);
    race.traps = snap.tr.map(unpackTrap);
    race.boxCooldown.fill(0);
    for (const [i, cd] of snap.b) race.boxCooldown[i] = cd;
    // crumbling slabs: mirror the host's state into our copy of the track
    const tiles = race.track.tiles;
    const next = new Map<number, { t: number; broken: boolean }>();
    for (const [idx, t, broken] of snap.cr) next.set(idx, { t, broken: broken === 1 });
    for (const [idx, c] of race.crumbles) if (c.broken && !next.get(idx)?.broken) tiles[idx] = Tile.Crumble;
    for (const [idx, c] of next) if (c.broken) tiles[idx] = Tile.Empty;
    race.crumbles = next;

    const states = snap.r.map((a, i) => unpackRunner(a, createRunner(i, 0, 0)));
    this.buffer.push({ k: snap.k, states });
    if (this.buffer.length > 40) this.buffer.shift();

    this.reconcile(states[this.localId], snap.a);

    for (const e of snap.ev) {
      if ((e.t === 'jump' || e.t === 'land' || e.t === 'slam') && e.r === this.localId) continue;
      if (e.t === 'coin') race.coinTaken[e.r][e.coin] = 1;
      events.push(e);
    }
  }

  /** Take the host's word for our runner, then re-apply the inputs it hasn't seen yet. */
  private reconcile(host: RunnerState, ack: number) {
    const me = this.local;
    const beforeX = me.x;
    const beforeY = me.y;
    Object.assign(me, host);
    this.history = this.history.filter((h) => h.s > ack);
    if (this.canPredict()) {
      for (const h of this.history) {
        stepRunnerPhysics(me, { jump: h.j === 1, slide: h.d === 1, use: 0 }, this.race.track, DT, this.hostTick * DT);
        applyPads(this.race.track, me);
      }
    }
    const dx = beforeX - me.x;
    const dy = beforeY - me.y;
    if (Math.hypot(dx, dy) < 120) {
      this.offset.x += dx;
      this.offset.y += dy;
    } else {
      this.offset.x = 0;
      this.offset.y = 0;
    }
  }

  private interpolateRemotes() {
    const buf = this.buffer;
    if (!buf.length) return;
    const rt = this.hostTick - INTERP_TICKS;
    let a = buf[0];
    let b = buf[buf.length - 1];
    for (let i = 0; i < buf.length - 1; i++) {
      if (buf[i].k <= rt && buf[i + 1].k >= rt) {
        a = buf[i];
        b = buf[i + 1];
        break;
      }
    }
    if (rt >= b.k) a = b;
    const span = b.k - a.k;
    const t = span > 0 ? Math.min(1, Math.max(0, (rt - a.k) / span)) : 1;
    this.race.runners.forEach((r, id) => {
      if (id === this.localId) return;
      const sa = a.states[id];
      const sb = b.states[id];
      const x = sa.x + (sb.x - sa.x) * t;
      const y = sa.y + (sb.y - sa.y) * t;
      const jump = Math.abs(sb.x - sa.x) > 150 || Math.abs(sb.y - sa.y) > 150;
      Object.assign(r, t < 0.5 ? sa : sb);
      if (!jump) {
        r.x = x;
        r.y = y;
      }
    });
  }

  prevPosition(id: number) {
    if (id === this.localId) {
      const me = this.local;
      if (Math.abs(this.prevLocal.x - me.x) > 80 || Math.abs(this.prevLocal.y - me.y) > 80) return { x: me.x, y: me.y };
      return this.prevLocal;
    }
    const r = this.race.runners[id];
    return { x: r.x, y: r.y };
  }

  renderOffset(id: number) {
    return id === this.localId ? this.offset : { x: 0, y: 0 };
  }

  status() {
    if (this.lost) return this.lost;
    if (this.started && performance.now() - this.lastSnapAt > 1500) return 'Verbindung wackelt …';
    if (!this.started) return 'Warte auf den Gastgeber …';
    return null;
  }

  destroy() {
    this.room.onHostMessage = null;
  }
}
