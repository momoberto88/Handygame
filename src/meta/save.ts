import { RETIRED_PRICES } from './cosmetics';
import { EMPTY_DAILY, type DailyState } from './daily';
const KEY = 'chaos-sprint-save-v1';

/** How much of the level the race camera shows. */
export type CameraDistance = 'near' | 'mid' | 'far';
export const CAMERA_DISTANCES: { id: CameraDistance; label: string; viewH: number }[] = [
  { id: 'near', label: 'nah', viewH: 440 },
  { id: 'mid', label: 'mittel', viewH: 540 },
  { id: 'far', label: 'weit', viewH: 640 },
];

export type BotSetting = 'auto' | 'easy' | 'normal' | 'hard';
export const BOT_SETTINGS: { id: BotSetting; label: string }[] = [
  { id: 'auto', label: 'Automatisch' },
  { id: 'easy', label: 'Leicht' },
  { id: 'normal', label: 'Normal' },
  { id: 'hard', label: 'Schwer' },
];

export type OpponentSetting = 'auto' | 1 | 2 | 3;
export const OPPONENT_SETTINGS: { id: OpponentSetting; label: string }[] = [
  { id: 'auto', label: 'Automatisch' },
  { id: 1, label: '1 Gegner' },
  { id: 2, label: '2 Gegner' },
  { id: 3, label: '3 Gegner' },
];

export interface SaveData {
  name: string;
  coins: number;
  trophies: number;
  character: string;
  unlocked: string[];
  owned: string[];
  equipped: { outfit: string | null };
  /** Worn skin per character id (missing = the normal look). */
  skins: Record<string, string>;
  settings: {
    sound: boolean;
    music: boolean;
    leftHanded: boolean;
    vibration: boolean;
    camera: CameraDistance;
    rude: boolean;
    /** Volumes 0…1. */
    volMusic: number;
    volSfx: number;
    volVoice: number;
    /** Bot strength; "auto" gets harder the more you win. */
    bots: BotSetting;
    /** Number of opponents in quick races ("auto": 1 at first, then 2, then 3). */
    opponents: OpponentSetting;
    /** The intro film plays whenever the app starts (with "Überspringen"). */
    intro: boolean;
  };
  stats: { races: number; wins: number };
  /** Best finishing time per course id (seconds). */
  best: Record<string, number>;
  /** Best cup result per cup id (1 = won). */
  cups: Record<string, number>;
  /** Own tracks from the editor (course ids "custom:<code>"), newest first. */
  tracks: string[];
  /** Offline races and cups as 2 vs 2 (you and a bot against two bots). */
  teamMode: boolean;
  /** Daily chest and tasks. */
  daily: DailyState;
  /** The practice run was finished once. */
  tutorialDone: boolean;
}

const DEFAULT: SaveData = {
  name: '',
  coins: 0,
  trophies: 0,
  character: 'hase',
  unlocked: ['hase', 'katze', 'ratte'],
  owned: [],
  equipped: { outfit: null },
  skins: {},
  settings: { sound: true, music: true, leftHanded: false, vibration: true, camera: 'mid', rude: true, volMusic: 0.8, volSfx: 0.7, volVoice: 1, bots: 'auto', opponents: 'auto', intro: true },
  stats: { races: 0, wins: 0 },
  best: {},
  cups: {},
  tracks: [],
  teamMode: false,
  daily: { ...EMPTY_DAILY },
  tutorialDone: false,
};

let cache: SaveData | null = null;

export function loadSave(): SaveData {
  if (cache) return cache;
  let data: SaveData = structuredClone(DEFAULT);
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      data = {
        ...data,
        ...parsed,
        equipped: { outfit: parsed.equipped?.outfit ?? null },
        skins: { ...parsed.skins },
        settings: { ...data.settings, ...parsed.settings },
        stats: { ...data.stats, ...parsed.stats },
        best: { ...parsed.best },
        cups: { ...parsed.cups },
        daily: { ...EMPTY_DAILY, ...parsed.daily },
      };
    }
  } catch {
    // storage blocked (private mode): play with defaults
  }
  // old saves may still name characters from before the new cast
  const known = ['hase', 'katze', 'ratte', 'otter', 'kraehe', 'dachs', 'maulwurf', 'chinchilla', 'schildkroete'];
  data.unlocked = [...new Set([...DEFAULT.unlocked, ...data.unlocked.filter((id) => known.includes(id))])];
  if (!known.includes(data.character)) data.character = 'hase';
  // hats and glasses left the shop: pay them back once
  const retired = data.owned.filter((id) => id in RETIRED_PRICES);
  if (retired.length) {
    data.coins += retired.reduce((sum, id) => sum + RETIRED_PRICES[id], 0);
    data.owned = data.owned.filter((id) => !(id in RETIRED_PRICES));
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      // ignore
    }
  }
  cache = data;
  return data;
}

export function writeSave(update?: (s: SaveData) => void) {
  const data = loadSave();
  update?.(data);
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}
