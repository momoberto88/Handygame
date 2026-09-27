import { sfx } from './sfx';

/**
 * The "shitty flute": a cheap recorder, played badly. Famous public-domain melodies (Beethoven,
 * Joplin, Grieg) come out wobbly, out of tune, with squeaks, hiccups and the odd wrong note.
 * Everything is synthesized, no recordings needed.
 */

/** [MIDI note, beats]; note 0 is a rest. */
type Tune = [number, number][];

const ODE: Tune = [
  [64, 1], [64, 1], [65, 1], [67, 1], [67, 1], [65, 1], [64, 1], [62, 1],
  [60, 1], [60, 1], [62, 1], [64, 1], [64, 1.5], [62, 0.5], [62, 2],
];
const ODE_END: Tune = [
  [64, 1], [64, 1], [65, 1], [67, 1], [67, 1], [65, 1], [64, 1], [62, 1],
  [60, 1], [60, 1], [62, 1], [64, 1], [62, 1.5], [60, 0.5], [60, 2],
];
const ELISE: Tune = [[76, 0.5], [75, 0.5], [76, 0.5], [75, 0.5], [76, 0.5], [71, 0.5], [74, 0.5], [72, 0.5], [69, 1.5]];
const ENTERTAINER: Tune = [
  [62, 0.5], [63, 0.5], [64, 0.5], [72, 1], [64, 0.5], [72, 1], [64, 0.5], [72, 2.5],
  [72, 0.5], [74, 0.5], [75, 0.5], [76, 0.5], [72, 0.5], [74, 0.5], [76, 1], [71, 0.5], [74, 1], [72, 2],
];
const MOUNTAIN_KING: Tune = [
  [57, 0.5], [59, 0.5], [60, 0.5], [62, 0.5], [64, 0.5], [60, 0.5], [64, 1],
  [63, 0.5], [59, 0.5], [63, 1], [62, 0.5], [58, 0.5], [62, 1],
];

export const TUNES = { ODE, ODE_END, ELISE, ENTERTAINER, MOUNTAIN_KING };

/** Short tunes after a race. */
const SHORT: { tune: Tune; bpm: number }[] = [
  { tune: ODE, bpm: 170 },
  { tune: ELISE, bpm: 150 },
  { tune: ENTERTAINER, bpm: 190 },
  { tune: MOUNTAIN_KING, bpm: 150 },
];

const midiHz = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/** Plays a tune; returns its length in seconds (0 if the sound is off). */
function play(tune: Tune, bpm: number, sloppiness = 1): number {
  const out = sfx.input('music');
  const ctx = sfx.context;
  if (!out || !ctx || sfx.level('music') <= 0) return 0;
  return playOn(ctx, out, tune, bpm, sloppiness);
}

/** Schedules a tune on any audio context (also an offline one, to record a sample). */
export function playOn(ctx: BaseAudioContext, out: AudioNode, tune: Tune, bpm: number, sloppiness = 1): number {
  const beat = 60 / bpm;
  let t = ctx.currentTime + 0.05;
  const start = t;
  // the whole flute is a bit flat, and gets worse while playing
  let drift = -8 - Math.random() * 14;
  for (const [note, beats] of tune) {
    const len = beats * beat * (0.92 + Math.random() * 0.16 * sloppiness);
    if (note > 0) {
      let n = note;
      // now and then a wrong note
      if (Math.random() < 0.07 * sloppiness) n += Math.random() < 0.5 ? -1 : 1;
      drift += (Math.random() - 0.4) * 10 * sloppiness;
      const cents = drift + (Math.random() - 0.5) * 38 * sloppiness;
      blow(ctx, out, midiHz(n) * Math.pow(2, cents / 1200), t, len * 0.9, Math.random() < 0.08 * sloppiness);
    }
    t += len;
  }
  return t - start;
}

/** One breathy recorder note: a soft tone with wobble, breath noise and a "chiff" at the start. */
function blow(ctx: BaseAudioContext, out: AudioNode, hz: number, t: number, dur: number, squeak: boolean) {
  const vol = 0.16;
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(hz * 0.97, t);
  osc.frequency.exponentialRampToValueAtTime(hz, t + 0.06);
  // an overblown squeak: jumps up an octave for a moment
  if (squeak) {
    osc.frequency.setValueAtTime(hz * 2.02, t + dur * 0.35);
    osc.frequency.setValueAtTime(hz, t + dur * 0.35 + 0.08);
  }
  const sine = ctx.createOscillator();
  sine.type = 'sine';
  sine.frequency.value = hz * 2;
  // wobbly vibrato
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 4.5 + Math.random() * 3;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = hz * 0.012;
  lfo.connect(lfoGain).connect(osc.frequency);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.03);
  g.gain.linearRampToValueAtTime(vol * (0.7 + Math.random() * 0.4), t + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const g2 = ctx.createGain();
  g2.gain.value = 0.12;
  osc.connect(g);
  sine.connect(g2).connect(g);

  // breath: noise around the note, strongest at the start ("chiff")
  const len = Math.ceil(ctx.sampleRate * (dur + 0.05));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = hz * 1.5;
  band.Q.value = 1.2;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(vol * 0.9, t);
  ng.gain.exponentialRampToValueAtTime(vol * 0.18, t + 0.05);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  noise.connect(band).connect(ng).connect(out);
  g.connect(out);

  for (const src of [osc, sine, lfo, noise]) {
    src.start(t);
    src.stop(t + dur + 0.05);
  }
}

/** A short badly played tune after a race. */
export function fluteShort() {
  const pick = SHORT[Math.floor(Math.random() * SHORT.length)];
  const len = play(pick.tune, pick.bpm);
  if (len) sfx.duck(len);
}

/** The cup ceremony: the whole "Ode to Joy", falling apart towards the end. */
export function fluteLong() {
  const len = play([...ODE, ...ODE_END], 150, 1.4);
  if (len) sfx.duck(len);
}
