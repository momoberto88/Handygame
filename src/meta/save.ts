const KEY = 'chaos-sprint-save-v1';

export interface SaveData {
  name: string;
  coins: number;
  trophies: number;
  character: string;
  unlocked: string[];
  owned: string[];
  equipped: { hat: string | null; glasses: string | null; outfit: string | null };
  settings: { sound: boolean; music: boolean; leftHanded: boolean; vibration: boolean };
  stats: { races: number; wins: number };
}

const DEFAULT: SaveData = {
  name: '',
  coins: 0,
  trophies: 0,
  character: 'hase',
  unlocked: ['hase', 'pilz', 'fuchs'],
  owned: [],
  equipped: { hat: null, glasses: null, outfit: null },
  settings: { sound: true, music: true, leftHanded: false, vibration: true },
  stats: { races: 0, wins: 0 },
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
        equipped: { ...data.equipped, ...parsed.equipped },
        settings: { ...data.settings, ...parsed.settings },
        stats: { ...data.stats, ...parsed.stats },
      };
    }
  } catch {
    // storage blocked (private mode): play with defaults
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
