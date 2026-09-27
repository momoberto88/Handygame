// Makes a recorder recording sound like the "shitty flute" memes: notes drift and land off-key,
// the pitch wobbles, notes crack up an octave (overblown), breath noise and a harsh, blown-too-hard tone.
// Usage: node tools/flute-wreck.mjs <in.mp3> <out.mp3> [level 1..3] [seed]
// Needs ffmpeg (FFMPEG=/path/to/ffmpeg).
import { execFileSync } from 'node:child_process';

const [input, output, levelArg = '2', seedArg = '7'] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: node tools/flute-wreck.mjs <in.mp3> <out.mp3> [level 1..3] [seed]');
  process.exit(1);
}
const FF = process.env.FFMPEG ?? 'ffmpeg';
const RATE = 44100;
const level = Math.max(1, Math.min(3, Number(levelArg)));

// how bad it gets per level: off-key spread, wrong-note chance, wobble, cracks per second, drive, breath
const LEVELS = {
  1: { spread: 45, wrong: 0.08, wobble: 22, cracks: 0.12, drive: 1.6, breath: 0.04 },
  2: { spread: 85, wrong: 0.18, wobble: 38, cracks: 0.3, drive: 2.6, breath: 0.08 },
  3: { spread: 140, wrong: 0.3, wobble: 60, cracks: 0.55, drive: 4, breath: 0.12 },
};
const L = LEVELS[level];

let seed = Number(seedArg) >>> 0 || 1;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const between = (a, b) => a + rnd() * (b - a);
const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 0.5;

const raw = execFileSync(FF, ['-v', 'error', '-i', input, '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
const src = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);

// pitch curve in cents over input time: per "note" an off-key offset (sometimes a clearly wrong
// note), glides between them, a seasick slow wobble, shaky fast vibrato, sagging note ends, cracks
const n = src.length;
const cents = new Float32Array(n);
{
  let t = 0;
  let prev = 0;
  while (t < n) {
    const len = Math.floor(between(0.18, 0.6) * RATE);
    let target = gauss() * L.spread;
    if (rnd() < L.wrong) target += (rnd() < 0.5 ? -1 : 1) * between(180, 320);
    const glide = Math.floor(0.045 * RATE);
    for (let i = 0; i < len && t + i < n; i++) {
      const g = Math.min(1, i / glide);
      let c = prev + (target - prev) * g;
      // breath runs out: the end of a note sags
      if (i > len * 0.72) c -= ((i - len * 0.72) / (len * 0.28)) * 45;
      cents[t + i] = c;
    }
    prev = target;
    t += len;
  }
  const wf = between(0.7, 1.3);
  for (let i = 0; i < n; i++) {
    const s = i / RATE;
    cents[i] += L.wobble * Math.sin(2 * Math.PI * wf * s) + 12 * Math.sin(2 * Math.PI * 6.2 * s + Math.sin(s * 1.7) * 2);
  }
  // overblown cracks: an octave up for a moment
  const count = Math.round((n / RATE) * L.cracks);
  for (let k = 0; k < count; k++) {
    const at = Math.floor(between(0.3, n / RATE - 0.3) * RATE);
    const len = Math.floor(between(0.08, 0.17) * RATE);
    for (let i = 0; i < len && at + i < n; i++) cents[at + i] += 1200 * Math.min(1, i / 300, (len - i) / 300);
  }
}

// variable-speed read = pitch changes (and a slightly wobbly tempo, which fits)
const out = [];
let pos = 0;
while (pos < n - 1) {
  const i = Math.floor(pos);
  const f = pos - i;
  out.push(src[i] * (1 - f) + src[i + 1] * f);
  pos += 2 ** (cents[i] / 1200);
}

// blown too hard: brighter, clipped, uneven breath pressure, breath noise under the tone
let env = 0;
let last = 0;
let lastNoise = 0;
const y = new Float32Array(out.length);
const norm = Math.tanh(L.drive);
for (let i = 0; i < out.length; i++) {
  const x = out[i];
  const bright = x + 0.7 * (x - last);
  last = x;
  env = Math.max(Math.abs(x), env * 0.9995);
  const pressure = 1 + 0.22 * Math.sin((2 * Math.PI * 3.1 * i) / RATE + Math.sin(i / RATE) * 3);
  const noise = rnd() * 2 - 1;
  const hiss = (noise - lastNoise) * 0.5;
  lastNoise = noise;
  y[i] = Math.tanh(L.drive * bright * pressure) / norm + hiss * env * L.breath * 4;
}
// about as loud as the other sounds (clipping makes it denser, so match the average, not the peak)
let peak = 0;
let sum = 0;
for (const v of y) {
  peak = Math.max(peak, Math.abs(v));
  sum += v * v;
}
const gain = Math.min(0.95 / peak, 0.12 / Math.sqrt(sum / y.length));
for (let i = 0; i < y.length; i++) y[i] *= gain;

execFileSync(FF, ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(RATE), '-ac', '1', '-i', '-', '-b:a', '128k', output], {
  input: Buffer.from(y.buffer),
});
console.log(`${output}: level ${level}, ${(y.length / RATE).toFixed(1)} s`);
