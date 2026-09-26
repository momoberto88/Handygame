import type Phaser from 'phaser';
import { CHARACTERS, characterById } from '../meta/characters';
import { loadSave } from '../meta/save';
import { ClientSession } from '../net/ClientSession';
import { HostSession } from '../net/HostSession';
import { LocalSession } from '../net/LocalSession';
import type { NetRoom, Profile } from '../net/room';
import type { RaceSession, RacerInfo } from '../net/session';
import { Rng, randomSeed } from '../sim/rng';
import type { WorldId } from '../sim/types';
import { WORLD_ORDER } from '../render/worlds';
import { COURSES, courseById } from '../sim/track/courses';
import { activeCup, isLastRace, newCup, setActiveCup, type CupState } from '../meta/cup';

export function playerName(): string {
  const s = loadSave();
  return s.name || characterById(s.character).name;
}

/** Fills the empty seats with bots using characters nobody else picked. */
export function fillWithBots(humans: RacerInfo[], total: number, seed: number): RacerInfo[] {
  const rng = new Rng(seed);
  const used = new Set(humans.map((h) => h.character));
  const pool = CHARACTERS.filter((c) => !used.has(c.id)).map((c) => c.id);
  const result = [...humans];
  while (result.length < total) {
    const idx = rng.int(pool.length);
    const character = pool.splice(idx, 1)[0] ?? CHARACTERS[result.length % CHARACTERS.length].id;
    result.push({ id: result.length, name: characterById(character).name, character, isBot: true });
  }
  return result.map((r, i) => ({ ...r, id: i }));
}

export function randomWorld(seed: number): WorldId {
  return WORLD_ORDER[seed % WORLD_ORDER.length];
}

/** Debug switches via the URL, e.g. ?autoplay&world=neon&seed=42 (used for automated tests). */
export function debugParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

export function startLocalRace(scene: Phaser.Scene, opts: { courseId?: string; world?: WorldId; racers?: RacerInfo[]; keepCup?: boolean } = {}) {
  if (!opts.keepCup) setActiveCup(null);
  const save = loadSave();
  const seed = Number(debugParam('seed')) || randomSeed();
  let world = (debugParam('world') as WorldId | null) ?? opts.world;
  let courseId = debugParam('course') ?? opts.courseId;
  if (!courseId && !world) courseId = COURSES[seed % COURSES.length].id;
  if (courseId) world = courseById(courseId).world;
  const autoplay = debugParam('autoplay') !== null;
  const me: RacerInfo = { id: 0, name: playerName(), character: save.character, isBot: autoplay, cosmetics: save.equipped };
  const racers = opts.racers ?? fillWithBots([me], 4, seed);
  const session = new LocalSession({
    seed,
    world: world ?? randomWorld(seed),
    courseId,
    racers,
    botLevel: save.stats.races < 2 ? 'easy' : save.stats.wins > save.stats.races * 0.5 ? 'hard' : 'normal',
    localId: 0,
  });
  startRace(scene, session);
}

/** Starts an offline cup against bots (fixed cups, a custom selection or random courses). */
export function startSoloCup(scene: Phaser.Scene, id: string, name: string, courses: string[]) {
  const save = loadSave();
  const cup = newCup(id, name, courses, randomSeed());
  const me: RacerInfo = { id: 0, name: playerName(), character: save.character, isBot: false, cosmetics: save.equipped };
  cup.racers = fillWithBots([me], 4, cup.seed);
  setActiveCup(cup);
  startCupRace(scene);
}

/** Next race of the offline cup. */
export function startCupRace(scene: Phaser.Scene) {
  const cup = activeCup();
  if (!cup) return startLocalRace(scene);
  if (cup.counted >= cup.index && !isLastRace(cup)) cup.index++;
  startLocalRace(scene, { courseId: cup.courses[cup.index], racers: cup.racers, keepCup: true });
}

export function startRace(scene: Phaser.Scene, session: RaceSession) {
  const mgr = scene.game.scene;
  for (const key of ['result', 'hud', 'race', 'menu', 'lobby', 'wardrobe', 'courses', 'podium', 'editor']) {
    if (mgr.isActive(key) || mgr.isPaused(key)) mgr.stop(key);
  }
  mgr.start('race', { session });
}

/** Leaves any race/result/lobby scenes and returns to the main menu. */
export function goToMenu(scene: Phaser.Scene, message?: string) {
  const mgr = scene.game.scene;
  for (const key of ['result', 'hud', 'race', 'lobby', 'wardrobe', 'courses', 'podium', 'editor']) {
    if (mgr.isActive(key) || mgr.isPaused(key)) mgr.stop(key);
  }
  mgr.start('menu', { message });
}

export function myProfile(): Profile {
  const s = loadSave();
  return { name: playerName(), character: s.character, cosmetics: s.equipped };
}

/** Clients start a race whenever the host says so, whatever screen they are on. */
export function wireClientRoom(game: Phaser.Game, room: NetRoom) {
  room.onStart = (msg) => {
    setActiveCup(msg.cup ?? null);
    const active = game.scene.getScenes(true)[0];
    if (active) startRace(active, new ClientSession(room, msg));
  };
}

/** Host: start a race with everyone currently in the room (empty seats become bots). */
export function hostStartRace(scene: Phaser.Scene, room: NetRoom) {
  const seed = randomSeed();
  const list = room.playlist.courses;
  let cup: CupState | null = null;
  let courseId: string;
  if (list.length > 1) {
    // a cup: continue the running one or start it fresh
    cup = activeCup();
    const finished = cup && cup.counted >= cup.index && isLastRace(cup);
    const same = cup && cup.courses.join() === list.join() && !finished;
    if (!cup || !same) cup = newCup('room', room.playlist.name, list, seed);
    else if (cup.counted >= cup.index) cup.index++; // previous race is done: on to the next course
    courseId = cup.courses[cup.index];
  } else {
    courseId = list[0] ?? COURSES[seed % COURSES.length].id;
  }
  setActiveCup(cup);
  const world = courseById(courseId).world;
  const humans: RacerInfo[] = room.players.map((p, i) => ({
    id: i,
    name: p.name,
    character: p.character,
    isBot: false,
    cosmetics: p.cosmetics,
  }));
  // in a cup the same bots come back every race (same seed, same free characters)
  const racers = fillWithBots(humans, 4, cup ? cup.seed : seed);
  const seatToRacer = new Map<number, number>();
  room.players.forEach((p, i) => {
    if (p.seat !== 0) seatToRacer.set(p.seat, i);
  });
  for (const [seat, id] of seatToRacer) room.sendTo(seat, { t: 'start', seed, world, courseId, racers, you: id, cup: cup ?? undefined });
  room.racing = true;
  room.broadcastLobby();
  startRace(scene, new HostSession(room, { seed, world, courseId, racers, seatToRacer }));
}
