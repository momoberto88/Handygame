import { rude } from './lines';

/** Emotes for the race (index is what goes over the network, so only ever append). */
export const EMOTES = ['😂', '🤬', '😎', '💩', '🖕', '👋', '🍑', '🤡'];

/** Emotes offered in the HUD (the middle finger only with rude texts on). */
export function emoteChoices(): number[] {
  return EMOTES.map((_, i) => i).filter((i) => rude() || EMOTES[i] !== '🖕');
}
