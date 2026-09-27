// "Shitty flute", note by note: finds every note of a clean recorder/flute recording, then gives
// each note one typical beginner mistake instead of random wobble:
//  - the highest notes crack up an octave into a shriek (overblown), louder and harsher
//  - long notes run out of breath and sag flat, with a nervous breath vibrato
//  - some notes are simply sour (a steady bit off), mostly flat
//  - notes are scooped into from below or overshoot for a moment
// plus a blown-too-hard tone and breath noise.
// Usage: node tools/flute-targeted.mjs <in.mp3> <out.mp3> [strength 1..2] [seed] [--notes]
// Needs ffmpeg with rubberband (FFMPEG=/path/to/ffmpeg).
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const showNotes = process.argv.includes('--notes');
const [input, output, strengthArg = '1', seedArg = '5'] = args;
if (!input || !output) {
  console.error('usage: node tools/flute-targeted.mjs <in.mp3> <out.mp3> [strength 1..2] [seed] [--notes]');
  process.exit(1);
}
const FF = process.env.FFMPEG ?? 'ffmpeg';
const RATE = 44100;
const strength = Math.max(1, Math.min(2, Number(strengthArg)));

let seed = Number(seedArg) >>> 0 || 1;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const between = (a, b) => a + rnd() * (b - a);

const decode = (file) => {
  const raw = execFileSync(FF, ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length));
};
const pcmFilter = (samples, filter) => {
  const raw = execFileSync(FF, ['-v', 'error', '-f', 'f32le', '-ar', String(RATE), '-ac', '1', '-i', '-', '-af', filter, '-f', 'f32le', '-'], {
    input: Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength),
    maxBuffer: 1 << 28,
  });
  return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length));
};

const src = decode(input);
const n = src.length;

// ---- 1. pitch per frame (YIN) ----------------------------------------------------------------
const WIN = 1024;
const HOP = 256;
const MIN_LAG = Math.floor(RATE / 2600);
const MAX_LAG = Math.ceil(RATE / 180);
const frames = [];
for (let start = 0; start + WIN + MAX_LAG < n; start += HOP) {
  let energy = 0;
  for (let i = 0; i < WIN; i++) energy += src[start + i] ** 2;
  const rms = Math.sqrt(energy / WIN);
  const d = new Float32Array(MAX_LAG + 1);
  for (let lag = 1; lag <= MAX_LAG; lag++) {
    let s = 0;
    for (let i = 0; i < WIN; i++) {
      const diff = src[start + i] - src[start + i + lag];
      s += diff * diff;
    }
    d[lag] = s;
  }
  // cumulative mean normalised difference, first dip under the threshold
  let run = 0;
  let lag = -1;
  let best = 1;
  for (let l = 1; l <= MAX_LAG; l++) {
    run += d[l];
    const v = run > 0 ? (d[l] * l) / run : 1;
    if (l >= MIN_LAG && v < 0.18) {
      lag = l;
      best = v;
      // walk to the bottom of the dip
      while (l + 1 <= MAX_LAG) {
        run += d[l + 1];
        const nv = (d[l + 1] * (l + 1)) / run;
        if (nv >= best) break;
        best = nv;
        lag = ++l;
      }
      break;
    }
  }
  frames.push({ t: start + WIN / 2, rms, f0: lag > 0 ? RATE / lag : 0 });
}
const loud = Math.max(...frames.map((f) => f.rms));
const cents = (f) => 1200 * Math.log2(f / 440);

// ---- 2. notes: runs of voiced frames with a steady pitch -------------------------------------
const notes = [];
let cur = null;
for (const f of frames) {
  const voiced = f.f0 > 0 && f.rms > loud * 0.06;
  if (voiced && cur && Math.abs(cents(f.f0) - cur.c) < 70) {
    cur.end = f.t;
    cur.list.push(cents(f.f0));
    cur.c = cur.list.slice(-6).sort((a, b) => a - b)[Math.floor(Math.min(6, cur.list.length) / 2)];
    continue;
  }
  if (cur && cur.end - cur.start > 0.06 * RATE) notes.push(cur);
  cur = voiced ? { start: f.t, end: f.t, c: cents(f.f0), list: [cents(f.f0)] } : null;
}
if (cur && cur.end - cur.start > 0.06 * RATE) notes.push(cur);
for (const nt of notes) {
  const sorted = [...nt.list].sort((a, b) => a - b);
  nt.c = sorted[Math.floor(sorted.length / 2)];
  nt.len = (nt.end - nt.start) / RATE;
}
if (showNotes) {
  for (const nt of notes) console.log(`${(nt.start / RATE).toFixed(2)}s  ${nt.len.toFixed(2)}s  ${(440 * 2 ** (nt.c / 1200)).toFixed(0)} Hz`);
}

// ---- 3. one mistake per note -------------------------------------------------------------------
const byPitch = notes.filter((nt) => nt.len > 0.12).sort((a, b) => b.c - a.c);
const high = new Set(byPitch.slice(0, Math.max(1, Math.round(byPitch.length * (0.14 + 0.08 * strength)))));
const bend = new Float32Array(n); // cents, small continuous bends (read speed)
const cracks = []; // [from, to] sample ranges that jump an octave up
for (const nt of notes) {
  const s = nt.start - HOP * 2;
  const e = Math.min(n, nt.end + HOP * 2);
  const len = e - s;
  let steady = 0;
  if (high.has(nt) && rnd() < 0.55 + 0.25 * strength) {
    // overblown: part of the note flips into a shriek
    const from = s + Math.floor(len * between(0.15, 0.45));
    const to = Math.min(e, from + Math.floor(between(0.12, 0.28) * RATE));
    cracks.push([from, to]);
  } else if (rnd() < 0.3 + 0.15 * strength) {
    // sour note: held a steady bit off, mostly flat
    steady = (rnd() < 0.75 ? -1 : 1) * between(60, 110) * (0.8 + 0.3 * strength);
  }
  const attack = rnd();
  for (let i = Math.max(0, s); i < e; i++) {
    const p = (i - s) / len;
    const ms = ((i - s) / RATE) * 1000;
    let c = steady;
    // into the note: scoop up from below, or overshoot and fall back
    if (attack < 0.45) c += -170 * Math.max(0, 1 - ms / 80);
    else if (attack < 0.7) c += 130 * Math.max(0, 1 - ms / 45);
    if (nt.len > 0.33) {
      // out of breath: sags flat towards the end, nervous vibrato on the way
      c -= Math.max(0, (p - 0.4) / 0.6) * between(55, 70) * strength;
      c += Math.min(1, ms / 150) * 18 * strength * Math.sin((2 * Math.PI * 5.6 * (i - s)) / RATE + Math.sin(ms / 170) * 1.5);
    }
    bend[i] = c;
  }
}
// smooth the joins a little so bends don't click
{
  const k = 64;
  let acc = 0;
  const copy = Float32Array.from(bend);
  for (let i = 0; i < n; i++) {
    acc += copy[i] - (i >= k ? copy[i - k] : 0);
    bend[i] = acc / Math.min(i + 1, k);
  }
}

// ---- 4. octave cracks (time kept, rubberband) --------------------------------------------------
const work = Float32Array.from(src);
const shriek = new Float32Array(n);
for (const [from, to] of cracks) {
  const pad = 2048;
  const a = Math.max(0, from - pad);
  const b = Math.min(n, to + pad);
  const up = pcmFilter(src.slice(a, b), 'rubberband=pitch=2:transients=smooth');
  const fade = Math.floor(0.012 * RATE);
  for (let i = from; i < to; i++) {
    const w = Math.min(1, (i - from) / fade, (to - i) / fade);
    const v = up[i - a] ?? 0;
    work[i] = work[i] * (1 - w) + v * 1.35 * w;
    shriek[i] = w;
  }
}

// ---- 5. bends (variable read speed; ±2 semitones changes the timing only a little) --------------
const out = [];
const outShriek = [];
let pos = 0;
while (pos < n - 1) {
  const i = Math.floor(pos);
  const f = pos - i;
  out.push(work[i] * (1 - f) + work[i + 1] * f);
  outShriek.push(shriek[i]);
  pos += 2 ** (bend[i] / 1200);
}

// ---- 6. blown too hard: bright, clipped, breathy, the shrieks extra harsh -----------------------
const drive = 1.8 + 0.7 * strength;
const y = new Float32Array(out.length);
let last = 0;
let env = 0;
let lastNoise = 0;
for (let i = 0; i < out.length; i++) {
  const x = out[i];
  const bright = x + 0.6 * (x - last);
  last = x;
  env = Math.max(Math.abs(x), env * 0.9995);
  const d = drive * (1 + 1.2 * outShriek[i]);
  const noise = rnd() * 2 - 1;
  const hiss = (noise - lastNoise) * 0.5;
  lastNoise = noise;
  y[i] = Math.tanh(d * bright) / Math.tanh(d) + hiss * env * (0.22 + 0.25 * outShriek[i]);
}
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
console.log(`${output}: ${notes.length} notes, ${cracks.length} cracks, strength ${strength}, ${(y.length / RATE).toFixed(1)} s`);
