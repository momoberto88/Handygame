import type { Race } from '../sim/race';
import type { SimEvent } from '../sim/types';

export interface RacerInfo {
  id: number;
  name: string;
  character: string;
  isBot: boolean;
  /** Accessories (hat, glasses, outfit ids). */
  cosmetics?: { hat: string | null; glasses: string | null; outfit: string | null };
}

export interface LocalInput {
  jump: boolean;
  slide: boolean;
  /** One-shot item use (-1 backward, 1 forward). */
  use: -1 | 0 | 1;
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
  update(dtMs: number, input: LocalInput): SimEvent[];
  prevPosition(id: number): { x: number; y: number };
  /** Visual correction applied on top of the simulated position (smooths network corrections). */
  renderOffset?(id: number): { x: number; y: number };
  /** Status line shown in the HUD (e.g. connection problems). */
  status(): string | null;
  destroy(): void;
}
