import type { Rng } from './rng';
import type { ItemKind } from './types';

/**
 * Catch-up item odds (like kart racers): the leader mostly gets defensive items,
 * the back of the pack gets the strong stuff.
 */
const ODDS: Record<number, Partial<Record<ItemKind, number>>> = {
  1: { saw: 30, trap: 30, shield: 25, magnet: 15, turbo: 5 },
  2: { saw: 25, trap: 15, shield: 15, turbo: 15, rocket: 15, ink: 10, magnet: 5 },
  3: { saw: 15, turbo: 25, rocket: 25, ink: 15, lightning: 8, shield: 7, trap: 5 },
  4: { turbo: 30, rocket: 25, lightning: 15, ink: 15, saw: 10, shield: 5 },
};

export function rollItem(rng: Rng, place: number, runnerCount: number, gapToLeader = 0): ItemKind {
  // Map the place onto the 4-slot table so smaller races still get sensible odds.
  let slot = runnerCount <= 1 ? 2 : Math.round(1 + ((place - 1) * 3) / (runnerCount - 1));
  // far behind counts more than the place: a close 4th is in the race, a distant 2nd is not
  if (runnerCount > 1 && place > 1) slot = Math.max(slot, gapToLeader > 1400 ? 4 : gapToLeader > 700 ? 3 : 1);
  return rng.weighted<ItemKind>(ODDS[Math.min(4, Math.max(1, slot))]);
}

export const ITEM_LABELS: Record<ItemKind, string> = {
  saw: 'Sägeblatt',
  trap: 'Bärenfalle',
  lightning: 'Blitz',
  shield: 'Schild',
  turbo: 'Turbo-Pilz',
  rocket: 'Rakete',
  ink: 'Tintenklecks',
  magnet: 'Münzmagnet',
};
