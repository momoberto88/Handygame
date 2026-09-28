// Sound track of the intro, synthesised in code: gentle mechanical sounds, no voices.
//   node tools/intro/sound.mjs out.wav
import { writeFileSync } from 'node:fs';
import { CUES as C, LENGTH } from './cues.mjs';

const RATE = 44100;
const N = Math.ceil(LENGTH * RATE);
const L = new Float32Array(N);
const R = new Float32Array(N);

// small deterministic noise source
let seed = 12345;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const noise = () => rnd() * 2 - 1;

/** Adds a sound starting at t (s) for dur (s); fn(k, x) returns the sample at local time x (s), k = 0..1. */
function add(t, dur, fn, gain = 1, pan = 0) {
  const s0 = Math.floor(t * RATE);
  const n = Math.floor(dur * RATE);
  const gl = gain * Math.min(1, 1 - pan);
  const gr = gain * Math.min(1, 1 + pan);
  for (let i = 0; i < n; i++) {
    const j = s0 + i;
    if (j < 0 || j >= N) continue;
    const v = fn(i / n, i / RATE);
    L[j] += v * gl;
    R[j] += v * gr;
  }
}

const env = (x, a, d) => (x < a ? x / a : Math.exp(-(x - a) / d));
/** One-pole low-pass filter state for noise. */
function lowpass(cut) {
  let y = 0;
  const k = 1 - Math.exp((-2 * Math.PI * cut) / RATE);
  return (x) => (y += (x - y) * k);
}
function highpass(cut) {
  const lp = lowpass(cut);
  return (x) => x - lp(x);
}

// --- building blocks -------------------------------------------------------------------------

/** Clock tick: a tiny click with a woody resonance. */
function tick(t, pitch, gain, pan = 0) {
  const hp = highpass(1500);
  add(t, 0.09, (k, x) => (hp(noise()) * env(x, 0.0005, 0.004) + Math.sin(2 * Math.PI * pitch * x) * env(x, 0.001, 0.02) * 0.6), gain, pan);
}
/** Soft low thump (landing, stamp). */
function thump(t, gain, freq = 90, pan = 0) {
  add(t, 0.35, (k, x) => Math.sin(2 * Math.PI * freq * x * (1 - 0.3 * k)) * env(x, 0.003, 0.07), gain, pan);
}
/** Metal clunk: a few inharmonic partials. */
function clunk(t, gain, base = 220, pan = 0) {
  const parts = [1, 2.3, 3.7, 5.1];
  add(t, 0.5, (k, x) => parts.reduce((s, p, i) => s + Math.sin(2 * Math.PI * base * p * x) * env(x, 0.001, 0.08 / (i + 1)) / (i + 1), 0), gain, pan);
}
/** Bell / chime. */
function bell(t, freq, gain, len = 1.6, pan = 0) {
  const parts = [[1, 1], [2.01, 0.5], [3.0, 0.25], [4.2, 0.12]];
  add(t, len, (k, x) => parts.reduce((s, [p, a]) => s + Math.sin(2 * Math.PI * freq * p * x) * a * env(x, 0.002, len / (2 + p)), 0), gain, pan);
}
/** Filtered noise with a shape (steam, wind, whoosh). */
function hiss(t, dur, gain, lo, hi, shape, pan = 0) {
  const hp = highpass(lo);
  const lp = lowpass(hi);
  add(t, dur, (k) => lp(hp(noise())) * shape(k), gain, pan);
}

// --- the score ---------------------------------------------------------------------------------

// scene 1–2: the machine ticks (tick, tock) while the king dozes
for (let i = 0; i * 0.5 < C.machineStart; i++) {
  const t = i * 0.5;
  const fade = Math.min(1, t / 0.6);
  tick(t, i % 2 ? 1750 : 2300, 0.22 * fade, -0.35);
}
// a soft snore-like breath of the machine's bellows (very quiet, low)
for (let t = 0.2; t < 6.5; t += 2.1) hiss(t, 1.2, 0.05, 80, 500, (k) => Math.sin(k * Math.PI), 0.1);
// the rivals land from the window sill and tiptoe
for (const [t, pan] of [[C.mocca + 0.45, 0.6], [C.buddel + 0.45, 0.7], [C.zuendi + 0.45, 0.6]]) thump(t, 0.35, 110, pan);
for (let t = C.zuendi + 0.55; t < C.tiptoeEnd; t += 0.17) tick(t, 3200, 0.06, 0.3);
// stumble and the fateful click
hiss(C.stumble, 0.3, 0.12, 400, 3000, (k) => Math.sin(k * Math.PI), -0.1);
tick(C.click, 2600, 0.7, -0.2);
clunk(C.click + 0.02, 0.35, 160, -0.2);
thump(C.click + 0.02, 0.4, 70, -0.2);

// scene 3: the machine spins up
{
  const a = C.machineStart;
  const b = 11.9;
  let phase = 0;
  add(a, b - a + 0.4, (k, x) => {
    const u = Math.min(1, x / 1.6);
    const f = 45 + 120 * u * u;
    phase += (2 * Math.PI * f) / RATE;
    const tone = Math.sin(phase) * 0.6 + Math.sin(phase * 2) * 0.25 + Math.sin(phase * 3.01) * 0.12;
    const fade = Math.min(1, x / 0.3) * (x > b - a - 0.5 ? Math.max(0, (b - a + 0.4 - x) / 0.9) : 1);
    return tone * fade;
  }, 0.16, -0.4);
  // ratchet clicks, faster and faster
  let t = a;
  while (t < b) {
    const u = Math.min(1, (t - a) / 1.6);
    tick(t, 1900 + u * 800, 0.18, -0.4);
    t += 1 / (3 + 22 * u);
  }
}
for (const t of C.steam) hiss(t, 0.8, 0.22, 1500, 9000, (k) => env(k, 0.05, 0.3), -0.45);
// the storm: a low rumble that stays until the title
hiss(C.stormOut, C.title - C.stormOut, 0.5, 20, 180, (k) => Math.min(1, k * 8) * Math.min(1, (1 - k) * 6) * (0.7 + 0.3 * Math.sin(k * 40)), -0.3);
hiss(C.stormOut, 1.2, 0.25, 300, 2500, (k) => Math.sin(k * Math.PI), -0.2);
// the crown pops off: a spring boing
add(C.crownPop, 0.9, (k, x) => {
  const f = 170 + 330 * Math.min(1, x * 6) + Math.sin(x * 55) * 60 * (1 - k);
  return Math.sin(2 * Math.PI * f * x) * env(x, 0.004, 0.25);
}, 0.3, 0.2);
bell(C.crownPop + 0.05, 1320, 0.08, 0.8, 0.3);
// everyone scrambles out
for (let t = C.runStart; t < C.chase; t += 0.13) tick(t, 900 + (t * 37 % 1) * 400, 0.1, 0.4);
hiss(C.chase - 0.25, 0.45, 0.35, 600, 6000, (k) => Math.sin(k * Math.PI), 0);

// scene 4: the chase – clockwork footsteps, whooshes over the saw
for (let t = C.chase; t < C.title - 0.1; t += 0.125) {
  const beat = Math.round((t - C.chase) / 0.125);
  tick(t, beat % 2 ? 1400 : 1100, beat % 4 === 0 ? 0.16 : 0.09, (beat % 3) * 0.2 - 0.2);
}
for (let t = C.chase; t < C.title - 0.2; t += 0.5) thump(t, 0.12, 60, 0);
for (let i = 0; i < 4; i++) hiss(C.sawJump - 0.1 + i * 0.22, 0.35, 0.16, 800, 5000, (k) => Math.sin(k * Math.PI), 0.1);
// the saw whirs past
add(C.sawJump - 0.8, 1.6, (k, x) => Math.sin(2 * Math.PI * 520 * x + Math.sin(x * 90) * 3) * Math.sin(k * Math.PI) * 0.4, 0.1, 0.2);
hiss(C.mine - 0.2, 0.4, 0.2, 500, 5000, (k) => Math.sin(k * Math.PI), 0);
hiss(C.sky - 0.2, 0.4, 0.2, 500, 5000, (k) => Math.sin(k * Math.PI), 0);
hiss(C.title - 0.25, 0.45, 0.35, 600, 7000, (k) => Math.sin(k * Math.PI), 0);

// scene 5: the title stamps in, the crown lands, a music box plays
thump(C.stamp, 0.6, 65);
clunk(C.stamp + 0.01, 0.3, 140);
for (let i = 0; i < 12; i++) tick(C.stamp + 0.05 + i * 0.045, 3000 + (i % 4) * 400, 0.05, (i % 5) * 0.3 - 0.6);
bell(C.crownLand, 1568, 0.22, 1.6, 0.2);
clunk(C.crownLand, 0.12, 400, 0.2);
// the tagline types itself like a little machine
for (let i = 0; i < 36; i++) tick(C.tagline + (i / 36) * 1.1, 2400 + (i % 3) * 300, 0.07, 0);
// music box: a gentle phrase in C major
const box = [[0, 1047], [0.22, 1319], [0.44, 1568], [0.66, 2093], [0.95, 1568], [1.17, 1760], [1.5, 2093]];
for (const [dt, f] of box) bell(18.25 + dt, f, 0.12, 1.4, 0);

// --- write -------------------------------------------------------------------------------------
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const gain = peak > 0 ? 0.7 / peak : 1;
// fade in/out at the very ends
const edge = Math.floor(0.05 * RATE);
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0);
buf.writeUInt32LE(36 + N * 4, 4);
buf.write('WAVEfmt ', 8);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(RATE, 24);
buf.writeUInt32LE(RATE * 4, 28);
buf.writeUInt16LE(4, 32);
buf.writeUInt16LE(16, 34);
buf.write('data', 36);
buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  const f = Math.min(1, i / edge, (N - i) / (edge * 10));
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * gain * f)) * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * gain * f)) * 32767), 46 + i * 4);
}
writeFileSync(process.argv[2] ?? 'intro.wav', buf);
console.log('peak before normalising', peak.toFixed(2));
