import type { RacerInfo } from '../net/session';
import { CUP_POINTS, type CupState } from './cup';

/** 2 vs 2: names and colours of the two teams. */
export const TEAMS = [
  { name: 'Team Blau', icon: '🔵', color: 0x4aa3ff, css: '#7cc0ff' },
  { name: 'Team Rot', icon: '🔴', color: 0xff5a4a, css: '#ff9080' },
] as const;

/**
 * Which seats play together. Pairing 0: seats 1+2 vs 3+4, 1: 1+3 vs 2+4, 2: 1+4 vs 2+3
 * (seat numbers as shown in the lobby, counting from 1).
 */
export const PAIRINGS: readonly (readonly number[])[] = [
  [0, 0, 1, 1],
  [0, 1, 0, 1],
  [0, 1, 1, 0],
];

export function pairingLabel(pairing: number): string {
  const t = PAIRINGS[pairing] ?? PAIRINGS[0];
  const seats = (team: number) => [0, 1, 2, 3].filter((s) => t[s] === team).map((s) => s + 1).join('+');
  return `${seats(0)} gegen ${seats(1)}`;
}

/**
 * Gives every racer a team. Humans play for the team of their seat; bots take the free seats in
 * order, so both teams always have two racers.
 */
export function assignTeams(racers: RacerInfo[], pairing = 0): RacerInfo[] {
  const t = PAIRINGS[pairing] ?? PAIRINGS[0];
  const taken = new Set(racers.filter((r) => !r.isBot && r.seat !== undefined).map((r) => r.seat!));
  const free = [0, 1, 2, 3].filter((s) => !taken.has(s));
  return racers.map((r) => {
    const seat = !r.isBot && r.seat !== undefined ? r.seat : (free.shift() ?? r.id);
    return { ...r, team: t[seat % 4] };
  });
}

export function teamsOf(racers: RacerInfo[]): number[] | undefined {
  return racers.some((r) => r.team !== undefined) ? racers.map((r) => r.team ?? -1) : undefined;
}

export interface TeamScore {
  team: number;
  points: number;
  /** Best finishing place of the team (tie-breaker). */
  best: number;
}

/**
 * Team result of one race: cup points (10/6/3/1) of both members added up. On equal points the
 * team with the better single place wins. `order` is the racers from first to last.
 */
export function teamScores(order: { team?: number }[]): TeamScore[] {
  const scores: TeamScore[] = [0, 1].map((team) => ({ team, points: 0, best: 99 }));
  order.forEach((r, place) => {
    const s = scores[r.team ?? -1];
    if (!s) return;
    s.points += CUP_POINTS[place] ?? 0;
    s.best = Math.min(s.best, place + 1);
  });
  return scores.sort((a, b) => b.points - a.points || a.best - b.best);
}

/** Team totals of a 2 vs 2 cup (empty for other cups). */
export function cupTeamScores(cup: CupState): TeamScore[] {
  if (!cup.teams) return [];
  const scores: TeamScore[] = [0, 1].map((team) => ({ team, points: 0, best: 99 }));
  for (const e of cup.table) if (e.team === 0 || e.team === 1) scores[e.team].points += e.points;
  return scores.sort((a, b) => b.points - a.points);
}

/** "🔵 13 : 10 🔴" – blue always on the left. */
export function scoreLine(scores: TeamScore[]): string {
  const pts = (t: number) => scores.find((s) => s.team === t)?.points ?? 0;
  return `${TEAMS[0].icon} ${pts(0)} : ${pts(1)} ${TEAMS[1].icon}`;
}
