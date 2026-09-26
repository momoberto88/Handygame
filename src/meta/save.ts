const KEY = 'chaos-sprint-save-v1';

/** How much of the level the race camera shows. */
export type CameraDistance = 'near' | 'mid' | 'far';
export const CAMERA_DISTANCES: { id: CameraDistance; label: string; viewH: number }[] = [
  { id: 'near', label: 'nah', viewH: 440 },
  { id: 'mid', label: 'mittel', viewH: 540 },
  { id: 'far', label: 'weit', viewH: 640 },
];

export interface SaveData {
  name: string;
  coins: number;
  trophies: number;
  character: string;
  unlocked: string[];
  owned: string[];
  equipped: { hat: string | null; glasses: string | null; outfit: string | null };
  settings: { sound: boolean; music: boolean; leftHanded: boolean; vibration: boolean; camera: CameraDistance };
  stats: { races: number; wins: number };
  /** Best finishing time per course id (seconds). */
  best: Record<string, number>;
  /** Best cup result per cup id (1 = won). */
  cups: Record<string, number>;
  /** Own tracks from the editor (course ids "custom:<code>"), newest first. */
  tracks: string[];
}

const DEFAULT: SaveData = {
  name: '',
  coins: 0,
  trophies: 0,
  character: 'hase',
  unlocked: ['hase', 'pilz', 'fuchs'],
  owned: [],
  equipped: { hat: null, glasses: null, outfit: null },
  settings: { sound: true, music: true, leftHanded: false, vibration: true, camera: 'mid' },
  stats: { races: 0, wins: 0 },
  best: {},
  cups: {},
  tracks: [],
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
        best: { ...parsed.best },
        cups: { ...parsed.cups },
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
