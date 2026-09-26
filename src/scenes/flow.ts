import type Phaser from 'phaser';
import { CHARACTERS, characterById } from '../meta/characters';
import { SKINS } from '../meta/cosmetics';
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
import { activeCup, isLastRace, newCup, randomCourses, setActiveCup, stillIn, type CupState } from '../meta/cup';
import { VOTE_SECONDS } from '../net/protocol';
import { assignTeams } from '../meta/teams';

export function playerName(): string {
  const s = loadSave();
  return s.name || characterById(s.character).name;
}

/** Fills the empty seats with bots using characters nobody else picked. */
export function fillWithBots(humans: RacerInfo[], total: number, seed: number): RacerInfo[] {
  const rng = new Rng(seed);
  // a separate stream, so the skins do not change which characters the bots pick
  const look = new Rng(seed ^ 0x5eed);
  const used = new Set(humans.map((h) => h.character));
  const pool = CHARACTERS.filter((c) => !used.has(c.id)).map((c) => c.id);
  const result = [...humans];
  while (result.length < total) {
    const idx = rng.int(pool.length);
    const character = pool.splice(idx, 1)[0] ?? CHARACTERS[result.length % CHARACTERS.length].id;
    // every third bot or so shows off its painted skin
    const skin = look.next() < 0.35 ? (SKINS.find((k) => k.character === character)?.id ?? null) : null;
    result.push({ id: result.length, name: characterById(character).name, character, isBot: true, cosmetics: { skin, outfit: null } });
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

export function startLocalRace(
  scene: Phaser.Scene,
  opts: { courseId?: string; world?: WorldId; racers?: RacerInfo[]; keepCup?: boolean; spectator?: boolean } = {},
) {
  if (!opts.keepCup) setActiveCup(null);
  const save = loadSave();
  const seed = Number(debugParam('seed')) || randomSeed();
  let world = (debugParam('world') as WorldId | null) ?? opts.world;
  let courseId = debugParam('course') ?? opts.courseId;
  if (!courseId && !world) courseId = COURSES[seed % COURSES.length].id;
  if (courseId) world = courseById(courseId).world;
  const autoplay = debugParam('autoplay') !== null;
  const me: RacerInfo = { id: 0, seat: 0, name: playerName(), character: save.character, isBot: autoplay, cosmetics: myLook() };
  let racers = opts.racers ?? fillWithBots([me], 4, seed);
  // 2 vs 2 offline: you and one bot against two bots
  if (!opts.racers && save.teamMode) racers = assignTeams(racers);
  const session = new LocalSession({
    seed,
    world: world ?? randomWorld(seed),
    courseId,
    racers,
    botLevel: save.stats.races < 2 ? 'easy' : save.stats.wins > save.stats.races * 0.5 ? 'hard' : 'normal',
    localId: 0,
    spectator: opts.spectator,
  });
  startRace(scene, session);
}

/** Practice run: alone on the easiest course, without the chaos wall; the HUD coach explains. */
export function startTutorial(scene: Phaser.Scene) {
  setActiveCup(null);
  const save = loadSave();
  const me: RacerInfo = { id: 0, seat: 0, name: playerName(), character: save.character, isBot: false, cosmetics: myLook() };
  const courseId = 'lianen-lauf';
  const session = new LocalSession({ seed: 1, world: courseById(courseId).world, courseId, racers: [me], botLevel: 'easy', localId: 0, tutorial: true });
  startRace(scene, session);
}

/** Starts an offline cup against bots (fixed cups, a custom selection or random courses). */
export function startSoloCup(scene: Phaser.Scene, id: string, name: string, courses: string[], mode: 'points' | 'ko' = 'points') {
  const save = loadSave();
  const cup = newCup(id, name, courses, randomSeed(), mode);
  const me: RacerInfo = { id: 0, seat: 0, name: playerName(), character: save.character, isBot: debugParam('autoplay') !== null, cosmetics: myLook() };
  cup.racers = fillWithBots([me], 4, cup.seed);
  if (save.teamMode && mode === 'points') {
    cup.teams = true;
    cup.racers = assignTeams(cup.racers);
  }
  setActiveCup(cup);
  startCupRace(scene);
}

/** Next race of the offline cup. */
export function startCupRace(scene: Phaser.Scene) {
  const cup = activeCup();
  if (!cup) return startLocalRace(scene);
  if (cup.counted >= cup.index && !isLastRace(cup)) cup.index++;
  // K.-o. cup: only the ones still in race; if that's no longer you, you watch
  const racers = stillIn(cup, cup.racers ?? []).map((r, i) => ({ ...r, id: i }));
  const spectator = !racers.some((r) => r.seat === 0);
  startLocalRace(scene, { courseId: cup.courses[cup.index], racers, keepCup: true, spectator });
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

/** What the player wears: the skin of the chosen character and the trail. */
export function myLook(): NonNullable<RacerInfo['cosmetics']> {
  const s = loadSave();
  return { skin: s.skins[s.character] ?? null, outfit: s.equipped.outfit };
}

export function myProfile(): Profile {
  const s = loadSave();
  return { name: playerName(), character: s.character, cosmetics: myLook() };
}

/** Clients start a race whenever the host says so, whatever screen they are on. */
export function wireClientRoom(game: Phaser.Game, room: NetRoom) {
  // the host opened a course vote: show the lobby, wherever we are
  room.onVoteStart = () => {
    const active = game.scene.getScenes(true)[0];
    if (active && active.scene.key !== 'lobby') showLobby(active);
  };
  room.onStart = (msg) => {
    setActiveCup(msg.cup ?? null);
    const active = game.scene.getScenes(true)[0];
    if (active) startRace(active, new ClientSession(room, msg));
  };
}

/** Leaves race / result screens and opens the lobby. */
export function showLobby(scene: Phaser.Scene) {
  const mgr = scene.game.scene;
  for (const key of ['result', 'hud', 'race', 'menu', 'wardrobe', 'courses', 'podium', 'editor']) {
    if (mgr.isActive(key) || mgr.isPaused(key)) mgr.stop(key);
  }
  if (!mgr.isActive('lobby')) mgr.start('lobby');
}

/** Host: three random courses, VOTE_SECONDS to vote, then the race starts on the winner. */
export function hostStartVote(scene: Phaser.Scene, room: NetRoom) {
  if (room.vote) return;
  const game = scene.game;
  room.vote = { options: randomCourses(3, randomSeed()), votes: [], left: VOTE_SECONDS, endsAt: Date.now() + VOTE_SECONDS * 1000 };
  showLobby(scene);
  room.broadcastLobby();
  window.setTimeout(() => {
    const vote = room.vote;
    if (!vote || room.isClosed) return;
    const counts = vote.options.map((_, i) => vote.votes.filter(([, o]) => o === i).length);
    const best = Math.max(...counts);
    const top = vote.options.filter((_, i) => counts[i] === best);
    const winner = top[Math.floor(Math.random() * top.length)];
    room.vote = null;
    room.broadcastLobby();
    const active = game.scene.getScenes(true)[0];
    if (active) hostStartRace(active, room, winner);
  }, VOTE_SECONDS * 1000);
}

/** Host: start a race with everyone currently in the room (empty seats become bots). */
export function hostStartRace(scene: Phaser.Scene, room: NetRoom, forcedCourse?: string) {
  if (room.playlist.vote && !forcedCourse) return hostStartVote(scene, room);
  const seed = randomSeed();
  const list = room.playlist.courses;
  // 2 vs 2 (not in a K.-o. cup, where racers drop out one by one)
  const teamPairing = room.playlist.ko ? undefined : room.playlist.teams;
  let cup: CupState | null = null;
  let courseId: string;
  if (forcedCourse) {
    courseId = forcedCourse;
  } else if (list.length > 1) {
    // a cup: continue the running one or start it fresh
    cup = activeCup();
    const finished = cup && cup.counted >= cup.index && isLastRace(cup);
    const mode = room.playlist.ko ? 'ko' : 'points';
    const teams = teamPairing !== undefined;
    const same = cup && cup.courses.join() === list.join() && (cup.mode ?? 'points') === mode && !!cup.teams === teams && !finished;
    if (!cup || !same) {
      cup = newCup('room', room.playlist.name, list, seed, mode);
      cup.teams = teams;
    }
    else if (cup.counted >= cup.index) cup.index++; // previous race is done: on to the next course
    courseId = cup.courses[cup.index];
  } else {
    courseId = list[0] ?? COURSES[seed % COURSES.length].id;
  }
  setActiveCup(cup);
  const world = courseById(courseId).world;
  const humans: RacerInfo[] = room.players.map((p, i) => ({
    id: i,
    seat: p.seat,
    name: p.name,
    character: p.character,
    isBot: false,
    cosmetics: p.cosmetics,
  }));
  // in a cup the same bots come back every race (same seed, same free characters);
  // in a K.-o. cup only the ones still in take part, the others watch
  let lineup = fillWithBots(humans, 4, cup ? cup.seed : seed);
  if (teamPairing !== undefined) lineup = assignTeams(lineup, teamPairing);
  const racers = (cup ? stillIn(cup, lineup) : lineup).map((r, i) => ({ ...r, id: i }));
  const seatToRacer = new Map<number, number>();
  for (const r of racers) if (!r.isBot && r.seat !== undefined && r.seat !== 0) seatToRacer.set(r.seat, r.id);
  const watchers: number[] = [];
  for (const p of room.players) {
    if (p.seat === 0) continue;
    const id = seatToRacer.get(p.seat);
    const spectator = id === undefined;
    if (spectator) watchers.push(p.seat);
    room.sendTo(p.seat, { t: 'start', seed, world, courseId, racers, you: spectator ? 0 : id, cup: cup ?? undefined, spectator });
  }
  room.racing = true;
  room.broadcastLobby();
  const hostIn = racers.some((r) => !r.isBot && r.seat === 0);
  startRace(scene, new HostSession(room, { seed, world, courseId, racers, seatToRacer, spectator: !hostIn, watch: 0, watchers }));
}
