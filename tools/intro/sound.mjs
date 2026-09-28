// Sound track of the intro: the game's own world music follows the film (muffled night in the
// temple, silence on the click, the storm bursts in, jungle → mine → sky during the chase, a big
// ending), the game's sound effects for the big hits, and mechanical sounds synthesised in code
// (ticking, gears, steam, springs) with some body and room. No voices.
//   node tools/intro/sound.mjs out.wav
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { CUES as C, LENGTH } from './cues.mjs';

const FFMPEG = process.env.FFMPEG ?? '/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2';
const RATE = 48000;
const N = Math.ceil(LENGTH * RATE);
const AUDIO = new URL('../../public/assets/audio/', import.meta.url).pathname;

/** Decodes an mp3 of the game to stereo float samples. */
function load(path) {
  const raw = execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-i', AUDIO + path, '-f', 'f32le', '-ac', '2', '-ar', String(RATE), '-'], { maxBuffer: 1 << 28 });
  const f = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
  const n = f.length / 2;
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    l[i] = f[i * 2];
    r[i] = f[i * 2 + 1];
  }
  return { l, r, n };
}

// three buses: music, dry effects, and a send into the room (reverb)
const bus = () => ({ l: new Float32Array(N), r: new Float32Array(N) });
const music = bus();
const fx = bus();
const room = bus();

let seed = 12345;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const noise = () => rnd() * 2 - 1;
const env = (x, a, d) => (x < a ? x / a : Math.exp(-(x - a) / d));
function lowpass(cut) {
  let y = 0;
  const k = 1 - Math.exp((-2 * Math.PI * cut) / RATE);
  return (x) => (y += (x - y) * k);
}
function highpass(cut) {
  const lp = lowpass(cut);
  return (x) => x - lp(x);
}

/** Adds a synthesised sound to the effects (with `wet` of it into the room). */
function add(t, dur, fn, gain = 1, pan = 0, wet = 0.25) {
  const s0 = Math.floor(t * RATE);
  const n = Math.floor(dur * RATE);
  const gl = gain * Math.min(1, 1 - pan);
  const gr = gain * Math.min(1, 1 + pan);
  for (let i = 0; i < n; i++) {
    const j = s0 + i;
    if (j < 0 || j >= N) continue;
    const v = fn(i / n, i / RATE);
    fx.l[j] += v * gl;
    fx.r[j] += v * gr;
    room.l[j] += v * gl * wet;
    room.r[j] += v * gr * wet;
  }
}

/** Places one of the game's sound effects. */
function sample(name, t, gain = 1, pan = 0, wet = 0.2, rate = 1) {
  const s = load(`sfx/${name}.mp3`);
  const s0 = Math.floor(t * RATE);
  for (let i = 0; ; i++) {
    const src = i * rate;
    const k = Math.floor(src);
    if (k + 1 >= s.n) break;
    const j = s0 + i;
    if (j >= N) break;
    if (j < 0) continue;
    const f = src - k;
    const l = (s.l[k] * (1 - f) + s.l[k + 1] * f) * gain * Math.min(1, 1 - pan);
    const r = (s.r[k] * (1 - f) + s.r[k + 1] * f) * gain * Math.min(1, 1 + pan);
    fx.l[j] += l;
    fx.r[j] += r;
    room.l[j] += l * wet;
    room.r[j] += r * wet;
  }
}

// --- the music: one bed that follows the film ------------------------------------------------

/**
 * Lays a world's music from film time a to b (starting at `offset` in the track), with a gain
 * curve g(t) and an optional muffle curve m(t) (1 = night-time low-pass, 0 = open).
 */
function musicBed(world, a, b, offset, g, m = () => 0) {
  const s = load(`music/${world}.mp3`);
  const lpl = lowpass(700);
  const lpr = lowpass(700);
  for (let j = Math.floor(a * RATE); j < Math.min(N, Math.floor(b * RATE)); j++) {
    const t = j / RATE;
    const k = Math.floor((t - a + offset) * RATE) % s.n;
    const gain = g(t);
    const muf = m(t);
    const l = s.l[k];
    const r = s.r[k];
    const fl = lpl(l);
    const fr = lpr(r);
    music.l[j] += (l * (1 - muf) + fl * muf) * gain;
    music.r[j] += (r * (1 - muf) + fr * muf) * gain;
  }
}
const ramp = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));
const XF = 0.45; // cross-fade between the worlds

// scene 1–2: the jungle theme, muffled and quiet (night in the temple), fading into silence on the click
musicBed('jungle', 0, C.click + 0.1, 0, (t) => 0.75 * ramp(t, 0, 1.8) * (1 - ramp(t, C.click - 0.08, C.click + 0.05)), () => 1);
// scene 3–4: the storm bursts out – the jungle theme returns at full blast, then mine, then sky
musicBed('jungle', C.stormOut - 0.05, C.mine + XF, C.stormOut, (t) => 0.95 * ramp(t, C.stormOut - 0.05, C.stormOut + 0.25) * (1 - ramp(t, C.mine - XF, C.mine + XF)));
musicBed('mine', C.mine - XF, C.sky + XF, C.mine - XF, (t) => 0.95 * ramp(t, C.mine - XF, C.mine + XF) * (1 - ramp(t, C.sky - XF, C.sky + XF)));
// sky theme carries on under the title, then gently fades out
musicBed('sky', C.sky - XF, LENGTH, C.sky - XF, (t) => ramp(t, C.sky - XF, C.sky + XF) * (0.95 - 0.45 * ramp(t, C.title - 0.1, C.stamp) + 0.25 * ramp(t, C.stamp, C.stamp + 0.6)) * (1 - ramp(t, 18.9, LENGTH)));

// --- synthesised mechanics, now with body ----------------------------------------------------

/** Clock tick: click + woody resonance + a little low knock. */
function tick(t, pitch, gain, pan = 0, wet = 0.3) {
  const hp = highpass(1200);
  add(t, 0.12, (k, x) => hp(noise()) * env(x, 0.0005, 0.005) + Math.sin(2 * Math.PI * pitch * x) * env(x, 0.001, 0.025) * 0.6 + Math.sin(2 * Math.PI * 180 * x) * env(x, 0.001, 0.03) * 0.5, gain, pan, wet);
}
/** Deep thump with a sub. */
function thump(t, gain, freq = 80, pan = 0) {
  add(t, 0.5, (k, x) => Math.sin(2 * Math.PI * freq * x * (1 - 0.35 * k)) * env(x, 0.003, 0.11) + Math.sin(2 * Math.PI * freq * 0.5 * x) * env(x, 0.005, 0.16) * 0.7, gain, pan, 0.15);
}
/** Metal clunk. */
function clunk(t, gain, base = 180, pan = 0) {
  const parts = [1, 2.3, 3.7, 5.1, 6.8];
  add(t, 0.8, (k, x) => parts.reduce((s, p, i) => s + Math.sin(2 * Math.PI * base * p * x) * env(x, 0.001, 0.14 / (i + 1)) / (i + 1), 0), gain, pan, 0.45);
}
function bell(t, freq, gain, len = 2, pan = 0) {
  const parts = [[1, 1], [2.01, 0.5], [3.0, 0.25], [4.2, 0.12]];
  add(t, len, (k, x) => parts.reduce((s, [p, a]) => s + Math.sin(2 * Math.PI * freq * p * x) * a * env(x, 0.002, len / (2 + p)), 0), gain, pan, 0.5);
}
function hiss(t, dur, gain, lo, hi, shape, pan = 0, wet = 0.3) {
  const hp = highpass(lo);
  const lp = lowpass(hi);
  add(t, dur, (k) => lp(hp(noise())) * shape(k), gain, pan, wet);
}

// scene 1–2: the machine ticks
for (let i = 0; i * 0.5 < C.machineStart; i++) {
  const t = i * 0.5;
  tick(t, i % 2 ? 1750 : 2300, 0.3 * Math.min(1, t / 0.6 + 0.2), -0.35);
}
// the rivals land from the sill and tiptoe
for (const [t, pan] of [[C.mocca + 0.45, 0.6], [C.buddel + 0.45, 0.7], [C.zuendi + 0.45, 0.6]]) {
  thump(t, 0.5, 100, pan);
  sample('land', t, 0.35, pan);
}
for (let t = C.zuendi + 0.55; t < C.tiptoeEnd; t += 0.17) tick(t, 3200, 0.08, 0.3, 0.2);
// stumble – and the click, alone in the silence
hiss(C.stumble, 0.3, 0.18, 400, 3000, (k) => Math.sin(k * Math.PI), -0.1);
tick(C.click, 2600, 0.9, -0.2, 0.6);
clunk(C.click + 0.02, 0.55, 150, -0.2);
thump(C.click + 0.02, 0.6, 60, -0.2);

// scene 3: the machine spins up (rich, detuned motor + ratchet), steam, then the storm bursts
{
  const a = C.machineStart;
  const b = 11.9;
  let p1 = 0;
  let p2 = 0;
  add(a, b - a + 0.4, (k, x) => {
    const u = Math.min(1, x / 1.6);
    const f = 40 + 110 * u * u;
    p1 += (2 * Math.PI * f) / RATE;
    p2 += (2 * Math.PI * f * 1.01) / RATE;
    const tone = Math.sin(p1) * 0.5 + Math.sin(p2) * 0.4 + Math.sin(p1 * 2) * 0.25 + Math.sin(p2 * 3) * 0.12 + Math.sin(p1 * 0.5) * 0.4;
    const fade = Math.min(1, x / 0.3) * (x > b - a - 0.5 ? Math.max(0, (b - a + 0.4 - x) / 0.9) : 1);
    return tone * fade;
  }, 0.3, -0.35, 0.2);
  let t = a;
  while (t < b) {
    const u = Math.min(1, (t - a) / 1.6);
    tick(t, 1900 + u * 800, 0.22, -0.4, 0.25);
    t += 1 / (3 + 22 * u);
  }
}
for (const t of C.steam) hiss(t, 0.9, 0.35, 1200, 9000, (k) => env(k, 0.05, 0.3), -0.45, 0.35);
sample('boom', C.stormOut - 0.02, 0.9, -0.2, 0.35);
sample('lightning', C.stormOut + 0.1, 0.35, -0.3, 0.3);
hiss(C.stormOut, C.title - C.stormOut, 0.7, 20, 160, (k) => Math.min(1, k * 8) * Math.min(1, (1 - k) * 6) * (0.7 + 0.3 * Math.sin(k * 40)), -0.3, 0.1);
// the crown pops off: a spring boing and a little chime
add(C.crownPop, 0.9, (k, x) => {
  const f = 170 + 330 * Math.min(1, x * 6) + Math.sin(x * 55) * 60 * (1 - k);
  return Math.sin(2 * Math.PI * f * x) * env(x, 0.004, 0.25);
}, 0.45, 0.2, 0.3);
sample('pad', C.crownPop, 0.45, 0.2);
bell(C.crownPop + 0.05, 1320, 0.12, 1.0, 0.3);
// everyone scrambles out
sample('slam', C.runStart + 0.3, 0.45, 0.1);
for (let t = C.runStart; t < C.chase; t += 0.13) tick(t, 900 + ((t * 37) % 1) * 400, 0.12, 0.4, 0.15);
hiss(C.chase - 0.3, 0.5, 0.55, 500, 7000, (k) => Math.sin(k * Math.PI), 0, 0.4);

// scene 4: the chase
sample('turbo', C.chase, 0.45, 0, 0.2);
for (let t = C.chase; t < C.title - 0.1; t += 0.125) {
  const beat = Math.round((t - C.chase) / 0.125);
  tick(t, beat % 2 ? 1400 : 1100, beat % 4 === 0 ? 0.14 : 0.08, (beat % 3) * 0.2 - 0.2, 0.1);
}
for (let i = 0; i < 4; i++) {
  hiss(C.sawJump - 0.1 + i * 0.22, 0.35, 0.22, 800, 5000, (k) => Math.sin(k * Math.PI), 0.1);
  sample('jump-1', C.sawJump - 0.12 + i * 0.22, 0.2, (i % 2) * 0.4 - 0.2, 0.15);
}
add(C.sawJump - 0.8, 1.6, (k, x) => Math.sin(2 * Math.PI * 520 * x + Math.sin(x * 90) * 3) * Math.sin(k * Math.PI) * 0.4, 0.14, 0.2);
for (const t of [C.mine, C.sky]) hiss(t - 0.25, 0.5, 0.35, 500, 6000, (k) => Math.sin(k * Math.PI), 0, 0.35);
for (let i = 0; i < 4; i++) sample('pad', 15.9 + i * 0.11, 0.18, (i % 2) * 0.3 - 0.15);
hiss(C.title - 0.3, 0.55, 0.55, 500, 8000, (k) => Math.sin(k * Math.PI), 0, 0.4);

// scene 5: the title stamps in, the crown lands, the tagline types, a music box closes
sample('boom', C.stamp - 0.03, 0.8, 0, 0.45);
sample('slam', C.stamp, 0.6, 0, 0.3);
thump(C.stamp, 0.8, 55);
clunk(C.stamp + 0.01, 0.4, 120);
sample('finish', C.stamp + 0.15, 0.55, 0, 0.35);
for (let i = 0; i < 12; i++) tick(C.stamp + 0.05 + i * 0.045, 3000 + (i % 4) * 400, 0.06, (i % 5) * 0.3 - 0.6, 0.3);
bell(C.crownLand, 1568, 0.3, 2.0, 0.2);
clunk(C.crownLand, 0.18, 400, 0.2);
for (let i = 0; i < 36; i++) tick(C.tagline + (i / 36) * 1.1, 2400 + (i % 3) * 300, 0.07, 0, 0.2);
const box = [[0, 1047], [0.22, 1319], [0.44, 1568], [0.66, 2093], [0.95, 1568], [1.17, 1760], [1.5, 2093]];
for (const [dt, f] of box) bell(18.25 + dt, f, 0.16, 1.6, (dt * 0.6) - 0.4);

// --- the room: a small Schroeder reverb on the send bus ----------------------------------------
function reverb(inp, delays) {
  const out = new Float32Array(N);
  const combs = delays.map((d) => ({ buf: new Float32Array(Math.floor(d * RATE)), i: 0, lp: 0 }));
  const aps = [0.005, 0.0017].map((d) => ({ buf: new Float32Array(Math.floor(d * RATE)), i: 0 }));
  for (let j = 0; j < N; j++) {
    let s = 0;
    for (const c of combs) {
      const y = c.buf[c.i];
      c.lp = y * 0.7 + c.lp * 0.3;
      c.buf[c.i] = inp[j] + c.lp * 0.78;
      c.i = (c.i + 1) % c.buf.length;
      s += y;
    }
    s /= combs.length;
    for (const a of aps) {
      const y = a.buf[a.i];
      const v = s + y * 0.5;
      a.buf[a.i] = v;
      a.i = (a.i + 1) % a.buf.length;
      s = y - v * 0.5;
    }
    out[j] = s;
  }
  return out;
}
const revL = reverb(room.l, [0.0297, 0.0371, 0.0411, 0.0437]);
const revR = reverb(room.r, [0.0311, 0.0357, 0.0421, 0.0449]);

// --- mix: the music ducks under the big effects ------------------------------------------------
const outL = new Float32Array(N);
const outR = new Float32Array(N);
let level = 0;
const attack = 1 - Math.exp(-1 / (0.01 * RATE));
const release = 1 - Math.exp(-1 / (0.35 * RATE));
for (let j = 0; j < N; j++) {
  const e = Math.max(Math.abs(fx.l[j]), Math.abs(fx.r[j]));
  level += (e - level) * (e > level ? attack : release);
  const duck = 1 - Math.min(0.45, level * 0.9);
  outL[j] = music.l[j] * 0.8 * duck + fx.l[j] + revL[j] * 0.9;
  outR[j] = music.r[j] * 0.8 * duck + fx.r[j] + revR[j] * 0.9;
}

let peak = 0;
for (let j = 0; j < N; j++) peak = Math.max(peak, Math.abs(outL[j]), Math.abs(outR[j]));
const gain = peak > 0 ? 0.9 / peak : 1;
const edge = Math.floor(0.03 * RATE);
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
for (let j = 0; j < N; j++) {
  const f = Math.min(1, j / edge, (N - j) / (edge * 10));
  // soft clip keeps the loud moments round instead of crackling
  const sc = (v) => Math.tanh(v * gain * 1.2 * f) / Math.tanh(1.2);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sc(outL[j]))) * 32767), 44 + j * 4);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sc(outR[j]))) * 32767), 46 + j * 4);
}
writeFileSync(process.argv[2] ?? 'intro.wav', buf);
console.log('written, peak before normalising', peak.toFixed(2));
