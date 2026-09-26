/**
 * Daily treasure chest (coins, growing with a streak of days) and three daily tasks.
 * Pure functions on the save data, so they are easy to test.
 */

export interface DailyTask {
  id: string;
  progress: number;
  claimed: boolean;
}

export interface DailyState {
  /** Day (YYYY-MM-DD) the chest was last opened. */
  chestDay: string;
  streak: number;
  /** Day the tasks belong to. */
  taskDay: string;
  tasks: DailyTask[];
}

export const EMPTY_DAILY: DailyState = { chestDay: '', streak: 0, taskDay: '', tasks: [] };

/** Coins in the chest for day 1…7 of a streak (day 7 and later: the big one). */
export const CHEST_COINS = [50, 75, 100, 125, 150, 200, 300];

export interface TaskDef {
  id: string;
  text: string;
  goal: number;
  reward: number;
}

export const TASKS: TaskDef[] = [
  { id: 'win', text: 'Gewinne ein Rennen', goal: 1, reward: 60 },
  { id: 'hits', text: 'Erwische 3 Gegner mit Items', goal: 3, reward: 50 },
  { id: 'coins', text: 'Sammle 60 Münzen', goal: 60, reward: 40 },
  { id: 'races', text: 'Fahre 3 Rennen', goal: 3, reward: 40 },
  { id: 'clean', text: 'Fahre ein Rennen ohne zu sterben', goal: 1, reward: 70 },
  { id: 'ability', text: 'Setze 5× deine Fähigkeit ein', goal: 5, reward: 50 },
  { id: 'podium', text: 'Werde 2× Erster oder Zweiter', goal: 2, reward: 60 },
];

export function taskDef(id: string): TaskDef {
  return TASKS.find((t) => t.id === id) ?? TASKS[0];
}

export function dayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function previousDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d - 1));
}

/** Three tasks for the day, picked by the date (same for everyone on that day). */
export function tasksFor(day: string): DailyTask[] {
  let h = 0;
  for (const ch of day) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const pool = TASKS.map((t) => t.id);
  const out: DailyTask[] = [];
  while (out.length < 3) {
    h = (h * 1103515245 + 12345) >>> 0;
    const id = pool.splice(h % pool.length, 1)[0];
    out.push({ id, progress: 0, claimed: false });
  }
  return out;
}

/** Brings the state to today (new tasks on a new day). Returns a new object. */
export function refreshDaily(state: DailyState | undefined, today = dayKey()): DailyState {
  const s = { ...EMPTY_DAILY, ...state };
  if (s.taskDay !== today) {
    s.taskDay = today;
    s.tasks = tasksFor(today);
  }
  return s;
}

export function chestReady(state: DailyState, today = dayKey()): boolean {
  return state.chestDay !== today;
}

/** Streak the chest would give today, and its coins. */
export function chestReward(state: DailyState, today = dayKey()): { streak: number; coins: number } {
  const streak = state.chestDay === previousDay(today) ? state.streak + 1 : 1;
  return { streak, coins: CHEST_COINS[Math.min(streak, CHEST_COINS.length) - 1] };
}

/** Opens the chest; returns the coins (0 if already opened today). */
export function openChest(state: DailyState, today = dayKey()): number {
  if (!chestReady(state, today)) return 0;
  const r = chestReward(state, today);
  state.streak = r.streak;
  state.chestDay = today;
  return r.coins;
}

export interface RaceStats {
  place: number;
  coins: number;
  deaths: number;
  hits: number;
  abilities: number;
}

/** Counts a finished race towards the daily tasks. Returns the ids of tasks that just got done. */
export function countRace(state: DailyState, r: RaceStats): string[] {
  const done: string[] = [];
  for (const t of state.tasks) {
    const def = taskDef(t.id);
    const before = t.progress;
    const add =
      t.id === 'win' ? (r.place === 1 ? 1 : 0)
      : t.id === 'hits' ? r.hits
      : t.id === 'coins' ? r.coins
      : t.id === 'races' ? 1
      : t.id === 'clean' ? (r.deaths === 0 ? 1 : 0)
      : t.id === 'ability' ? r.abilities
      : t.id === 'podium' ? (r.place <= 2 ? 1 : 0)
      : 0;
    t.progress = Math.min(def.goal, t.progress + add);
    if (before < def.goal && t.progress >= def.goal) done.push(t.id);
  }
  return done;
}

/** Collects a finished task; returns the coins (0 if not done or already collected). */
export function claimTask(state: DailyState, id: string): number {
  const t = state.tasks.find((x) => x.id === id);
  if (!t || t.claimed || t.progress < taskDef(id).goal) return 0;
  t.claimed = true;
  return taskDef(id).reward;
}
