import { sfx } from './sfx';

/**
 * The "shitty flute": a cheap recorder, played terribly. Recorded cleanly with ElevenLabs, then
 * ruined note by note with tools/flute-targeted.mjs (wrong fingers, blown sharp, overblown cracks).
 * Four short public-domain tunes for the end of a race, a long, falling-apart Ode to Joy for the
 * cup ceremony.
 */
const SHORT = ['sfx/flute-1', 'sfx/flute-2', 'sfx/flute-3', 'sfx/flute-4'];
const LONG = 'sfx/flute-long';

function play(path: string) {
  if (sfx.level('music') <= 0) return;
  const len = sfx.playClip(path, 0.45, 0, 1, 'music');
  if (len > 0) sfx.duck(len);
}

/** A short badly played tune after a race. */
export function fluteShort() {
  play(SHORT[Math.floor(Math.random() * SHORT.length)]);
}

/** The cup ceremony gets the long solo. */
export function fluteLong() {
  play(LONG);
}
