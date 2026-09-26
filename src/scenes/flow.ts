import type Phaser from 'phaser';
import { CHARACTERS, characterById } from '../meta/characters';
import { loadSave } from '../meta/save';
import { LocalSession } from '../net/LocalSession';
import type { RaceSession, RacerInfo } from '../net/session';
import { Rng, randomSeed } from '../sim/rng';
import type { WorldId } from '../sim/types';
import { WORLD_ORDER } from '../render/worlds';

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

export function startLocalRace(scene: Phaser.Scene, world?: WorldId) {
  const save = loadSave();
  const seed = Number(debugParam('seed')) || randomSeed();
  world = (debugParam('world') as WorldId | null) ?? world;
  const autoplay = debugParam('autoplay') !== null;
  const me: RacerInfo = { id: 0, name: playerName(), character: save.character, isBot: autoplay, cosmetics: save.equipped };
  const racers = fillWithBots([me], 4, seed);
  const session = new LocalSession({
    seed,
    world: world ?? randomWorld(seed),
    racers,
    botLevel: save.stats.races < 2 ? 'easy' : save.stats.wins > save.stats.races * 0.5 ? 'hard' : 'normal',
    localId: 0,
  });
  startRace(scene, session);
}

export function startRace(scene: Phaser.Scene, session: RaceSession) {
  for (const key of ['result', 'hud', 'race', 'menu', 'lobby', 'wardrobe']) {
    if (scene.scene.isActive(key) || scene.scene.isPaused(key)) scene.scene.stop(key);
  }
  scene.scene.start('race', { session });
}
