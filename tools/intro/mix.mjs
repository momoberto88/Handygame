// The little mixing desk behind the film sound tracks: the game's music and sound effects,
// mechanical sounds synthesised in code (ticks, thumps, clunks, bells, hiss), a small room reverb,
// and music that ducks under the big effects. Used by sound.mjs (intro) and coronation-sound.mjs.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

export const FFMPEG = process.env.FFMPEG ?? '/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2';
export const RATE = 48000;
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

export const ramp = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));
export const env = (x, a, d) => (x < a ? x / a : Math.exp(-(x - a) / d));
export function lowpass(cut) {
  let y = 0;
  const k = 1 - Math.exp((-2 * Math.PI * cut) / RATE);
  return (x) => (y += (x - y) * k);
}
export function highpass(cut) {
  const lp = lowpass(cut);
  return (x) => x - lp(x);
}

/** A fresh mix of `length` seconds. */
export function createMix(length) {
  const N = Math.ceil(length * RATE);
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

  /** Mixes everything (the music ducks under the big effects) and writes a 16-bit stereo WAV. */
  function write(path) {
    const revL = reverb(room.l, [0.0297, 0.0371, 0.0411, 0.0437]);
    const revR = reverb(room.r, [0.0311, 0.0357, 0.0421, 0.0449]);
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
    writeFileSync(path, buf);
    console.log('written, peak before normalising', peak.toFixed(2));
  }

  return { add, sample, musicBed, tick, thump, clunk, bell, hiss, write };
}
