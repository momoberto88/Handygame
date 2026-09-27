import {
  ABILITY_CHARGE_BOX,
  ABILITY_CHARGE_COIN,
  ABILITY_CHARGE_RATE,
  BASH_SHIELD,
  BOOST_SPEED,
  MASK_TIME,
  MEGAJUMP_V,
  QUAKE_RANGE,
  SPORE_RANGE_BACK,
  SPRINT_TIME,
  STEAL_RANGE,
  STUN_TIME,
  BOX_RADIUS,
  BOX_RESPAWN,
  COIN_RADIUS,
  COUNTDOWN_TIME,
  DEATH_TIME,
  DT,
  FINISH_GRACE,
  GHOST_TIME,
  GRAVITY,
  INK_TIME,
  ITEM_ROLL_TIME,
  LEVEL_BOTTOM,
  MAGNET_RADIUS,
  MAGNET_TIME,
  MAX_FALL,
  RESPAWN_SPEED,
  SHIELD_TIME,
  SWALLOW_JUMP_AHEAD,
  TRAP_LIFE,
  TURBO_TIME,
  WALL_BASE_SPEED,
  WALL_LEASH,
  WALL_MAX_SPEED,
  WALL_RAMP,
  WALL_START_OFFSET,
  WALL_GRACE_GAP,
  CRUMBLE_DELAY,
  CRUMBLE_RESPAWN,
  TILE,
} from './constants';
import { applyPads, circleHitsBox, findSafeSpot, isSafeSpot, levelHazard, lowerBound, runnerBox } from './hazards';
import { rollItem } from './items';
import { findFloor, solidInColumn, stepRunnerPhysics } from './physics';
import { Rng } from './rng';
import { generateTrack } from './track/generator';
import {
  NO_INPUT,
  Tile,
  type AbilityKind,
  type DeathKind,
  type ItemKind,
  type Projectile,
  type RunnerInput,
  type RunnerState,
  type SimEvent,
  type Track,
  type Trap,
  type WorldId,
} from './types';

export interface RaceSetup {
  seed: number;
  world: WorldId;
  runnerCount: number;
  lengthTiles?: number;
  chunkNames?: string[];
  /** Race on one of the fixed courses. */
  courseId?: string;
  /** No chaos wall (practice runs, route analysis). */
  noWall?: boolean;
  /** Special ability of each runner (by character); none if left out. */
  abilities?: (AbilityKind | null)[];
  /** 2 vs 2: team (0/1) of each runner; items and abilities spare teammates. */
  teams?: number[];
  /** Which runners are people (the wall follows the last of them, not the leading bot). */
  humans?: boolean[];
  /** Chaos wall speed factor (easy bots: a slower wall). */
  wallSpeed?: number;
}

export const SAW_PROJECTILE_RADIUS = 18;
export const TRAP_THROW_RADIUS = 12;
export const ROCKET_RADIUS = 16;
const ROCKET_SPEED = 720;
const ROCKET_TURN = 4.5;
const MAX_RACE_TIME = 150;

export function createRunner(id: number, x: number, y: number): RunnerState {
  return {
    id,
    x,
    y,
    vx: 0,
    vy: 0,
    grounded: true,
    onWall: false,
    blocked: false,
    sliding: false,
    diving: false,
    airJumps: 1,
    onMover: -1,
    inWater: false,
    slope: 0,
    coyote: 0,
    jumpBuffer: 0,
    prevJump: false,
    canCut: false,
    mode: 'run',
    deathKind: null,
    deathTimer: 0,
    ghost: 0,
    safeX: x,
    safeY: y,
    item: null,
    rolling: 0,
    shield: 0,
    boost: 0,
    magnet: 0,
    ink: 0,
    charge: 0,
    stun: 0,
    coins: 0,
    finishTime: -1,
    place: 0,
    deaths: 0,
  };
}

type KillResult = 'killed' | 'blocked' | 'immune';

export class Race {
  readonly track: Track;
  readonly runners: RunnerState[];
  projectiles: Projectile[] = [];
  traps: Trap[] = [];
  /** Seconds until each item box is available again. */
  boxCooldown: number[];
  /** Per runner: which coins it already collected (coins are personal, like in most runners). */
  coinTaken: Uint8Array[];
  tick = 0;
  wallX: number;
  endTime = -1;
  over = false;
  finishCount = 0;
  private rng: Rng;
  private nextId = 1;

  /** The fixed course being raced, if any. */
  readonly courseId: string | undefined;

  constructor(setup: RaceSetup) {
    this.courseId = setup.courseId;
    this.track = generateTrack({
      seed: setup.seed,
      world: setup.world,
      lengthTiles: setup.lengthTiles,
      chunkNames: setup.chunkNames,
      courseId: setup.courseId,
    });
    this.rng = new Rng(setup.seed ^ 0xa5a5a5);
    this.runners = [];
    for (let i = 0; i < setup.runnerCount; i++) {
      this.runners.push(createRunner(i, this.track.startX - i * 4, this.track.startY));
    }
    this.boxCooldown = this.track.boxes.map(() => 0);
    this.coinTaken = this.runners.map(() => new Uint8Array(this.track.coins.length));
    this.wallX = this.track.startX - WALL_START_OFFSET;
    this.noWall = setup.noWall ?? false;
    this.abilities = this.runners.map((_, i) => setup.abilities?.[i] ?? null);
    this.teams = this.runners.map((_, i) => setup.teams?.[i] ?? -1);
    this.humans = this.runners.map((_, i) => setup.humans?.[i] ?? false);
    this.wallSpeed = setup.wallSpeed ?? 1;
  }

  /** Which runners are people. */
  readonly humans: boolean[];
  private readonly wallSpeed: number;

  /** Team of each runner (-1 = every runner for themselves). */
  readonly teams: number[];

  /** True if `b` is on the same team as `a` (but not `a` itself). */
  isTeammate(a: number, b: number): boolean {
    return a !== b && this.teams[a] >= 0 && this.teams[a] === this.teams[b];
  }

  /** True if `b` is an opponent of `a` (not the same runner, not a teammate). */
  isRival(a: number, b: number): boolean {
    return a !== b && (this.teams[a] < 0 || this.teams[a] !== this.teams[b]);
  }

  private readonly noWall: boolean;
  /** Ability of each runner (null = none). */
  readonly abilities: (AbilityKind | null)[];

  /** Seconds since the simulation started (including the countdown). Drives moving hazards. */
  get clock(): number {
    return this.tick * DT;
  }

  /** Seconds since "GO" (negative during the countdown). */
  get time(): number {
    return this.clock - COUNTDOWN_TIME;
  }

  standings(): RunnerState[] {
    return [...this.runners].sort((a, b) => {
      const fa = a.place > 0 ? a.place : 99;
      const fb = b.place > 0 ? b.place : 99;
      if (fa !== fb) return fa - fb;
      return b.x - a.x;
    });
  }

  placeOf(id: number): number {
    return this.standings().findIndex((r) => r.id === id) + 1;
  }

  step(inputs: readonly RunnerInput[]): SimEvent[] {
    const events: SimEvent[] = [];
    if (this.over) return events;
    const prevTime = this.time;
    this.tick++;
    const time = this.time;
    if (time < 0) {
      const n = Math.ceil(-time);
      if (this.tick === 1 || Math.ceil(-prevTime) !== n) events.push({ t: 'countdown', n });
      return events;
    }
    if (prevTime < 0) events.push({ t: 'go' });

    this.updateWall(time);
    for (const r of this.runners) this.stepRunner(r, inputs[r.id] ?? NO_INPUT, time, events);
    this.updateProjectiles(events);
    this.updateTraps(events);
    this.updateCrumbles(events);
    for (let i = 0; i < this.boxCooldown.length; i++) {
      if (this.boxCooldown[i] > 0) this.boxCooldown[i] = Math.max(0, this.boxCooldown[i] - DT);
    }

    if (
      this.finishCount === this.runners.length ||
      (this.endTime >= 0 && time >= this.endTime) ||
      time >= MAX_RACE_TIME
    ) {
      this.finishRace(events);
    }
    return events;
  }

  private updateWall(time: number) {
    if (this.noWall) {
      this.wallX = -1e9;
      return;
    }
    const speed = Math.min(WALL_MAX_SPEED, WALL_BASE_SPEED + WALL_RAMP * time) * this.wallSpeed;
    this.wallX += speed * DT;
    // the leash: never too far behind the last person still running (or the leader in a bots-only
    // race), so the wall stays a threat – but a fast bot in front no longer drags it along
    const people = this.runners.filter((r, i) => this.humans[i] && r.mode !== 'finished');
    let anchor = -Infinity;
    if (people.length) anchor = Math.min(...people.map((r) => r.x));
    else for (const r of this.runners) if (r.mode !== 'finished') anchor = Math.max(anchor, r.x);
    if (anchor > -Infinity) this.wallX = Math.max(this.wallX, anchor - WALL_LEASH);
    // grace after a respawn: the wall waits while the runner is still blinking
    for (const r of this.runners) {
      if (r.mode === 'run' && r.ghost > 0) this.wallX = Math.min(this.wallX, r.x - WALL_GRACE_GAP);
    }
    this.wallX = Math.min(this.wallX, this.track.finishX - 700);
  }

  private stepRunner(r: RunnerState, input: RunnerInput, time: number, events: SimEvent[]) {
    r.ghost = Math.max(0, r.ghost - DT);
    r.shield = Math.max(0, r.shield - DT);
    r.boost = Math.max(0, r.boost - DT);
    r.magnet = Math.max(0, r.magnet - DT);
    r.ink = Math.max(0, r.ink - DT);
    r.stun = Math.max(0, r.stun - DT);

    if (r.mode === 'dead') {
      r.deathTimer -= DT;
      if (r.deathTimer <= 0) this.respawn(r, events);
      return;
    }
    if (r.rolling > 0) {
      r.rolling -= DT;
      if (r.rolling <= 0) {
        r.rolling = 0;
        r.item = rollItem(this.rng, this.placeOf(r.id), this.runners.length);
        events.push({ t: 'item', r: r.id, item: r.item });
      }
    }
    if (r.mode === 'run' && input.use !== 0 && r.item && r.rolling <= 0) this.useItem(r, input.use, events);
    if (r.mode === 'run' && this.abilities[r.id]) {
      r.charge = Math.min(1, r.charge + ABILITY_CHARGE_RATE * DT);
      if (input.ability && r.charge >= 1) this.useAbility(r, events);
    }

    const phys = stepRunnerPhysics(r, r.mode === 'finished' ? NO_INPUT : input, this.track, DT, this.clock);
    if (phys.jumped) events.push({ t: 'jump', r: r.id, wall: phys.wallJumped, double: phys.doubleJumped });
    if (phys.slammed) events.push({ t: 'slam', r: r.id, x: r.x, y: r.y });
    if (r.grounded && r.mode === 'run') this.touchCrumble(r);
    if (phys.landed && phys.landSpeed > 250) events.push({ t: 'land', r: r.id, v: phys.landSpeed });
    const pad = applyPads(this.track, r);
    if (pad) events.push({ t: 'pad', r: r.id, kind: pad });
    if (r.mode === 'finished') return;

    const hazard = levelHazard(this.track, r, this.clock);
    if (hazard && this.kill(r, hazard, false, events) === 'killed') return;

    this.collectPickups(r, events);

    if (r.x >= this.track.finishX) {
      r.mode = 'finished';
      r.finishTime = time;
      r.place = ++this.finishCount;
      events.push({ t: 'finish', r: r.id, place: r.place });
      if (this.endTime < 0) this.endTime = time + FINISH_GRACE;
      return;
    }

    if (r.grounded && isSafeSpot(this.track, r.x, r.y)) {
      r.safeX = r.x;
      r.safeY = r.y;
    }

    if (r.x < this.wallX) {
      const fromX = r.x;
      const fromY = r.y;
      this.placeAhead(r);
      events.push({ t: 'swallowed', r: r.id, fromX, fromY });
    }
  }

  private placeAhead(r: RunnerState) {
    const spot = findSafeSpot(this.track, this.wallX + SWALLOW_JUMP_AHEAD, Math.round(r.y / TILE));
    r.x = spot.x;
    r.y = spot.y;
    r.safeX = spot.x;
    r.safeY = spot.y;
    r.vx = 0;
    r.vy = 0;
    r.grounded = true;
    r.sliding = false;
    r.diving = false;
    r.onWall = false;
    r.slope = 0;
    r.boost = 0;
    r.ghost = GHOST_TIME;
  }


  // --- crumbling platforms --------------------------------------------------------------

  /** tile index → seconds left; negative while broken (counts up to 0 = regrow). */
  crumbles = new Map<number, { t: number; broken: boolean }>();

  private touchCrumble(r: RunnerState) {
    const row = Math.floor((r.y + 1) / TILE);
    for (const px of [r.x - 9, r.x + 9]) {
      const col = Math.floor(px / TILE);
      if (col < 0 || col >= this.track.cols) continue;
      const idx = row * this.track.cols + col;
      if (this.track.tiles[idx] === Tile.Crumble && !this.crumbles.has(idx)) this.crumbles.set(idx, { t: CRUMBLE_DELAY, broken: false });
    }
  }

  private updateCrumbles(events: SimEvent[]) {
    const tiles = this.track.tiles;
    const cols = this.track.cols;
    for (const [idx, c] of this.crumbles) {
      c.t -= DT;
      if (c.t > 0) continue;
      if (!c.broken) {
        tiles[idx] = Tile.Empty;
        c.broken = true;
        c.t = CRUMBLE_RESPAWN;
        events.push({ t: 'crumble', tile: idx, broken: true });
        // the break spreads along the bridge
        for (const n of [idx - 1, idx + 1]) {
          if (Math.floor(n / cols) === Math.floor(idx / cols) && tiles[n] === Tile.Crumble && !this.crumbles.has(n)) {
            this.crumbles.set(n, { t: 0.14, broken: false });
          }
        }
      } else {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const x0 = col * TILE;
        const y0 = row * TILE;
        const blocked = this.runners.some((o) => o.x + 13 > x0 && o.x - 13 < x0 + TILE && o.y > y0 && o.y - 46 < y0 + TILE);
        if (blocked) continue;
        tiles[idx] = Tile.Crumble;
        this.crumbles.delete(idx);
        events.push({ t: 'crumble', tile: idx, broken: false });
      }
    }
  }

  kill(r: RunnerState, kind: DeathKind, byItem: boolean, events: SimEvent[], by?: number): KillResult {
    if (r.mode !== 'run') return 'immune';
    if (kind !== 'fall') {
      if (r.ghost > 0) return 'immune';
      if (byItem && r.shield > 0) {
        r.shield = 0;
        events.push({ t: 'shieldBlock', r: r.id });
        return 'blocked';
      }
    }
    r.mode = 'dead';
    r.deathKind = kind;
    r.deathTimer = DEATH_TIME;
    r.deaths++;
    r.boost = 0;
    r.sliding = false;
    r.diving = false;
    events.push(by === undefined ? { t: 'death', r: r.id, kind, x: r.x, y: r.y } : { t: 'death', r: r.id, kind, x: r.x, y: r.y, by });
    r.vx = 0;
    r.vy = 0;
    return 'killed';
  }

  private respawn(r: RunnerState, events: SimEvent[]) {
    r.mode = 'run';
    r.deathKind = null;
    if (r.safeX < this.wallX + 40) {
      this.placeAhead(r);
    } else {
      r.x = r.safeX;
      r.y = r.safeY;
      r.vx = RESPAWN_SPEED;
      r.vy = 0;
      r.grounded = true;
      r.onWall = false;
      r.slope = 0;
      r.ghost = GHOST_TIME;
    }
    events.push({ t: 'respawn', r: r.id });
  }

  private collectPickups(r: RunnerState, events: SimEvent[]) {
    const b = runnerBox(r, 0);
    const boxes = this.track.boxes;
    for (let i = lowerBound(boxes, b.left - BOX_RADIUS); i < boxes.length && boxes[i].x <= b.right + BOX_RADIUS; i++) {
      if (this.boxCooldown[i] > 0) continue;
      if (!circleHitsBox(boxes[i].x, boxes[i].y, BOX_RADIUS, b)) continue;
      this.boxCooldown[i] = BOX_RESPAWN;
      events.push({ t: 'box', r: r.id, box: i });
      if (!r.item && r.rolling <= 0) r.rolling = ITEM_ROLL_TIME;
      if (this.abilities[r.id]) r.charge = Math.min(1, r.charge + ABILITY_CHARGE_BOX);
    }

    const coins = this.track.coins;
    const taken = this.coinTaken[r.id];
    const reach = r.magnet > 0 ? MAGNET_RADIUS : COIN_RADIUS;
    const cy = r.y - 23;
    for (let i = lowerBound(coins, b.left - reach); i < coins.length && coins[i].x <= b.right + reach; i++) {
      if (taken[i]) continue;
      const c = coins[i];
      const hit =
        r.magnet > 0 ? (c.x - r.x) ** 2 + (c.y - cy) ** 2 < MAGNET_RADIUS ** 2 : circleHitsBox(c.x, c.y, COIN_RADIUS, b);
      if (!hit) continue;
      taken[i] = 1;
      r.coins++;
      if (this.abilities[r.id]) r.charge = Math.min(1, r.charge + ABILITY_CHARGE_COIN);
      events.push({ t: 'coin', r: r.id, coin: i });
    }
  }

  private runnerAhead(r: RunnerState, dir: number): RunnerState | null {
    let best: RunnerState | null = null;
    for (const o of this.runners) {
      if (!this.isRival(r.id, o.id) || o.mode === 'finished') continue;
      if (dir > 0 ? o.x > r.x : o.x < r.x) {
        if (!best || Math.abs(o.x - r.x) < Math.abs(best.x - r.x)) best = o;
      }
    }
    return best;
  }

  /** Knocks runners near (x, y) off balance for a moment (items and shields protect as usual). */
  private stunNear(r: RunnerState, test: (o: RunnerState) => boolean, events: SimEvent[]) {
    for (const o of this.runners) {
      if (!this.isRival(r.id, o.id) || o.mode !== 'run' || o.ghost > 0 || !test(o)) continue;
      if (o.shield > 0) {
        o.shield = 0;
        events.push({ t: 'shieldBlock', r: o.id });
        continue;
      }
      o.stun = STUN_TIME;
      o.boost = 0;
      o.vx *= 0.4;
      events.push({ t: 'stunned', r: o.id, by: r.id });
    }
  }

  private useAbility(r: RunnerState, events: SimEvent[]) {
    const kind = this.abilities[r.id]!;
    r.charge = 0;
    let target: number | undefined;
    switch (kind) {
      case 'megajump': // Hoppel: huge leap, even in mid-air
        r.vy = -MEGAJUMP_V;
        r.grounded = false;
        r.sliding = false;
        r.diving = false;
        break;
      case 'sprint': // Flinki
        r.boost = SPRINT_TIME;
        r.vx = Math.max(r.vx, BOOST_SPEED);
        break;
      case 'spores': // Pilzi: a cloud that dazes everyone close behind
        this.stunNear(r, (o) => o.x < r.x + 60 && o.x > r.x - SPORE_RANGE_BACK && Math.abs(o.y - r.y) < 170, events);
        break;
      case 'tongue': // Quaki: snaps an item out of thin air
        if (!r.item && r.rolling <= 0) r.rolling = ITEM_ROLL_TIME * 0.4;
        else r.boost = Math.max(r.boost, 0.6);
        break;
      case 'steal': { // Rocco: steals the item of the nearest runner ahead that has one
        let best: RunnerState | null = null;
        for (const o of this.runners) {
          if (!this.isRival(r.id, o.id) || o.mode !== 'run' || !o.item || o.x < r.x || o.x - r.x > STEAL_RANGE) continue;
          if (!best || o.x < best.x) best = o;
        }
        if (best && !r.item && r.rolling <= 0) {
          r.item = best.item;
          best.item = null;
          target = best.id;
        } else if (!r.item && r.rolling <= 0) {
          r.rolling = ITEM_ROLL_TIME * 0.4;
        } else {
          r.boost = Math.max(r.boost, 0.6);
        }
        break;
      }
      case 'quake': // Grumbold: shock wave along the ground
        this.stunNear(r, (o) => Math.abs(o.x - r.x) < QUAKE_RANGE && Math.abs(o.y - r.y) < 90 && o.grounded, events);
        break;
      case 'mask': // Tiki: untouchable for a moment
        r.ghost = Math.max(r.ghost, MASK_TIME);
        break;
      case 'fireworks': { // Bumm-Bert: a homing firework rocket at the next runner ahead
        const aim = this.runnerAhead(r, 1);
        this.projectiles.push({
          id: this.nextId++,
          owner: r.id,
          life: 4.5,
          ownerSafe: 0.8,
          grounded: false,
          kind: 'rocket',
          target: aim ? aim.id : -1,
          x: r.x + 10,
          y: r.y - 40,
          vx: 450,
          vy: -160,
        });
        target = aim?.id;
        break;
      }
      case 'bash': // Madame Flausch: cloud shield and a short push
        r.shield = Math.max(r.shield, BASH_SHIELD);
        r.boost = Math.max(r.boost, 0.7);
        r.vx = Math.max(r.vx, BOOST_SPEED * 0.9);
        break;
    }
    events.push({ t: 'ability', r: r.id, kind, x: r.x, y: r.y, target });
  }

  private useItem(r: RunnerState, dir: -1 | 1, events: SimEvent[]) {
    const item = r.item as ItemKind;
    r.item = null;
    events.push({ t: 'use', r: r.id, item, dir });
    const base = { id: this.nextId++, owner: r.id, life: 3.5, ownerSafe: 0.4, target: -1, grounded: false };
    switch (item) {
      case 'saw':
        this.projectiles.push({
          ...base,
          kind: 'saw',
          x: r.x + dir * 24,
          y: r.y - SAW_PROJECTILE_RADIUS - 2,
          vx: dir > 0 ? Math.max(r.vx + 420, 760) : -260,
          vy: 0,
        });
        break;
      case 'trap':
        this.projectiles.push({
          ...base,
          kind: 'trapThrow',
          life: 6,
          ownerSafe: 1,
          x: r.x + dir * 20,
          y: r.y - 30,
          vx: dir > 0 ? r.vx + 180 : 40,
          vy: dir > 0 ? -520 : -150,
        });
        break;
      case 'lightning':
        events.push({ t: 'lightning', r: r.id });
        for (const o of this.runners) if (this.isRival(r.id, o.id)) this.kill(o, 'zap', true, events, r.id);
        break;
      case 'shield':
        r.shield = SHIELD_TIME;
        break;
      case 'turbo':
        r.boost = TURBO_TIME;
        r.vx = Math.max(r.vx, BOOST_SPEED);
        break;
      case 'rocket': {
        const target = this.runnerAhead(r, dir);
        this.projectiles.push({
          ...base,
          kind: 'rocket',
          life: 4.5,
          ownerSafe: 0.8,
          target: target ? target.id : -1,
          x: r.x + dir * 10,
          y: r.y - 34,
          vx: dir * 450,
          vy: -120,
        });
        break;
      }
      case 'ink':
        for (const o of this.runners) if (this.isRival(r.id, o.id) && o.x > r.x && o.mode !== 'finished') o.ink = INK_TIME;
        break;
      case 'magnet':
        r.magnet = MAGNET_TIME;
        break;
    }
  }

  private updateProjectiles(events: SimEvent[]) {
    const keep: Projectile[] = [];
    for (const p of this.projectiles) {
      p.life -= DT;
      p.ownerSafe -= DT;
      let alive = p.life > 0;
      if (p.kind === 'rocket') {
        const target = p.target >= 0 ? this.runners[p.target] : null;
        let angle = Math.atan2(p.vy, p.vx);
        if (target && target.mode === 'run') {
          const want = Math.atan2(target.y - 24 - p.y, target.x - p.x);
          let diff = want - angle;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          angle += Math.max(-ROCKET_TURN * DT, Math.min(ROCKET_TURN * DT, diff));
        }
        const speed = Math.min(ROCKET_SPEED, Math.hypot(p.vx, p.vy) + 900 * DT);
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed;
        p.x += p.vx * DT;
        p.y += p.vy * DT;
        if (!alive) events.push({ t: 'explode', x: p.x, y: p.y });
      } else {
        const radius = p.kind === 'saw' ? SAW_PROJECTILE_RADIUS : TRAP_THROW_RADIUS;
        p.vy = Math.min(MAX_FALL, p.vy + GRAVITY * DT);
        const nx = p.x + p.vx * DT;
        const lead = nx + Math.sign(p.vx) * radius;
        if (p.vx !== 0 && solidInColumn(this.track, lead, p.y - radius + 2, p.y + radius - 10)) {
          if (p.kind === 'saw') {
            alive = false;
            events.push({ t: 'sawBreak', x: p.x, y: p.y });
          } else {
            p.vx = 0;
          }
        } else {
          p.x = nx;
        }
        const oldBottom = p.y + radius;
        const newBottom = oldBottom + p.vy * DT;
        const floor = p.vy >= 0 ? findFloor(this.track, p.x, radius * 0.6, oldBottom, newBottom, p.grounded, 10) : null;
        if (floor) {
          p.y = floor.y - radius;
          p.vy = 0;
          p.grounded = true;
          if (p.kind === 'trapThrow') {
            this.traps.push({ id: p.id, owner: p.owner, x: p.x, y: floor.y, life: TRAP_LIFE, ownerSafe: p.ownerSafe });
            events.push({ t: 'trapSet', x: p.x, y: floor.y });
            alive = false;
          }
        } else {
          p.y = newBottom - radius;
          p.grounded = false;
        }
        if (p.y > LEVEL_BOTTOM + 100) alive = false;
        if (p.kind === 'saw' && !alive && p.life <= 0) events.push({ t: 'sawBreak', x: p.x, y: p.y });
      }

      if (alive && p.kind !== 'trapThrow') {
        const radius = p.kind === 'saw' ? SAW_PROJECTILE_RADIUS : ROCKET_RADIUS;
        for (const o of this.runners) {
          if (o.mode !== 'run' || (o.id === p.owner && p.ownerSafe > 0) || this.isTeammate(p.owner, o.id)) continue;
          if (!circleHitsBox(p.x, p.y, radius, runnerBox(o))) continue;
          const res = this.kill(o, p.kind === 'saw' ? 'slice' : 'boom', true, events, p.owner);
          if (res === 'immune') continue;
          alive = false;
          if (p.kind === 'rocket') events.push({ t: 'explode', x: p.x, y: p.y });
          break;
        }
      }
      if (alive) keep.push(p);
    }
    this.projectiles = keep;
  }

  private updateTraps(events: SimEvent[]) {
    this.traps = this.traps.filter((trap) => {
      trap.life -= DT;
      trap.ownerSafe -= DT;
      if (trap.life <= 0) return false;
      for (const o of this.runners) {
        if (o.mode !== 'run' || !o.grounded || (o.id === trap.owner && trap.ownerSafe > 0) || this.isTeammate(trap.owner, o.id)) continue;
        if (Math.abs(o.x - trap.x) > 18 || Math.abs(o.y - trap.y) > 10) continue;
        if (this.kill(o, 'trap', true, events, trap.owner) !== 'immune') return false;
      }
      return true;
    });
  }

  private finishRace(events: SimEvent[]) {
    const rest = this.runners.filter((r) => r.place === 0).sort((a, b) => b.x - a.x);
    for (const r of rest) r.place = ++this.finishCount;
    this.over = true;
    events.push({ t: 'end' });
  }
}
