import type { Race } from '../sim/race';
import type { SimEvent } from '../sim/types';

export interface RacerInfo {
  id: number;
  name: string;
  character: string;
  isBot: boolean;
  /** Room seat of a human player (stable between races, unlike the racer id). */
  seat?: number;
  /** 2 vs 2: team 0 (blue) or 1 (red). */
  team?: number;
  /** Accessories (hat, glasses, outfit ids). */
  cosmetics?: { hat: string | null; glasses: string | null; outfit: string | null };
}

export interface LocalInput {
  jump: boolean;
  slide: boolean;
  /** One-shot item use (-1 backward, 1 forward). */
  use: -1 | 0 | 1;
  /** One-shot: fire the character ability. */
  ability?: boolean;
}

/**
 * Something that drives a race: a purely local game against bots, a host that also
 * serves remote players, or a client that mirrors the host.
 */
export interface RaceSession {
  readonly race: Race;
  readonly localId: number;
  readonly racers: RacerInfo[];
  /** 0..1 position between the previous and the current tick, for smooth rendering. */
  readonly alpha: number;
  readonly online: boolean;
  /** Knocked out of a K.-o. cup: just watching `localId`, no controls. */
  readonly spectator?: boolean;
  update(dtMs: number, input: LocalInput): SimEvent[];
  prevPosition(id: number): { x: number; y: number };
  /** Visual correction applied on top of the simulated position (smooths network corrections). */
  renderOffset?(id: number): { x: number; y: number };
  /** Status line shown in the HUD (e.g. connection problems). */
  status(): string | null;
  destroy(): void;
}
