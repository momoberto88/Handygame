// Plays any melody on the "shitty flute": single recorder notes (the sample bank, cut from a clean
// ElevenLabs recording) are pitched and stretched to every note of the tune, then a beginner's
// mistakes are added per note: wrong fingers (steady), blown sharp, a few soft overblown cracks,
// squeaks when tonguing, late entries. A recorder can't slide, so nothing wobbles.
// Output is tamed for phone speakers (soft top end, limiter, no crack louder than the notes).
//
//   node tools/flute-play.mjs bank <clean.mp3>...          cut the note bank into tools/flute-bank/
//   node tools/flute-play.mjs play <tune> <out.mp3> [seed]  render a tune from tools/flute-tunes.mjs
//   node tools/flute-play.mjs list
// Needs ffmpeg (FFMPEG=/path/to/ffmpeg).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TUNES } from './flute-tunes.mjs';

const FF = process.env.FFMPEG ?? 'ffmpeg';
const RATE = 44100;
const HERE = dirname(fileURLToPath(import.meta.url));
const BANK_DIR = join(HERE, 'flute-bank');

const decode = (file) => {
  const raw = execFileSync(FF, ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length));
};
const filter = (samples, af) => {
  const raw = execFileSync(FF, ['-v', 'error', '-f', 'f32le', '-ar', String(RATE), '-ac', '1', '-i', '-', '-af', af, '-f', 'f32le', '-'], {
    input: Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength),
    maxBuffer: 1 << 28,
  });
  return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length));
};
const encode = (samples, out, af) => {
  const extra = af ? ['-af', af] : [];
  execFileSync(FF, ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(RATE), '-ac', '1', '-i', '-', ...extra, '-b:a', '128k', out], {
    input: Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength),
  });
};

// ---- pitch tracking (YIN) ------------------------------------------------------------------------
const WIN = 1024;
const HOP = 256;
function track(src) {
  const minLag = Math.floor(RATE / 2600);
  const maxLag = Math.ceil(RATE / 180);
  const frames = [];
  for (let start = 0; start + WIN + maxLag < src.length; start += HOP) {
    let energy = 0;
    for (let i = 0; i < WIN; i++) energy += src[start + i] ** 2;
    const d = new Float32Array(maxLag + 1);
    for (let lag = 1; lag <= maxLag; lag++) {
      let s = 0;
      for (let i = 0; i < WIN; i++) {
        const diff = src[start + i] - src[start + i + lag];
        s += diff * diff;
      }
      d[lag] = s;
    }
    let run = 0;
    let lag = -1;
    for (let l = 1; l <= maxLag; l++) {
      run += d[l];
      const v = run > 0 ? (d[l] * l) / run : 1;
      if (l >= minLag && v < 0.18) {
        let best = v;
        lag = l;
        while (l + 1 <= maxLag) {
          run += d[l + 1];
          const nv = (d[l + 1] * (l + 1)) / run;
          if (nv >= best) break;
          best = nv;
          lag = ++l;
        }
        break;
      }
    }
    frames.push({ t: start + WIN / 2, rms: Math.sqrt(energy / WIN), midi: lag > 0 ? 69 + 12 * Math.log2(RATE / lag / 440) : 0 });
  }
  return frames;
}

/** Steady notes of a recording: [{start, end, midi (exact, median), frames}] */
function findNotes(src) {
  const frames = track(src);
  const loud = Math.max(...frames.map((f) => f.rms));
  const notes = [];
  let cur = null;
  const close = () => {
    if (cur && cur.end - cur.start > MIN_NOTE * RATE) {
      const sorted = cur.frames.map((f) => f.midi).sort((a, b) => a - b);
      cur.midi = sorted[Math.floor(sorted.length / 2)];
      notes.push(cur);
    }
  };
  for (const f of frames) {
    const voiced = f.midi > 0 && f.rms > loud * 0.08;
    if (voiced && cur && Math.abs(f.midi - cur.midi) < 0.6) {
      cur.end = f.t;
      cur.frames.push(f);
      continue;
    }
    close();
    cur = voiced ? { start: f.t, end: f.t, midi: f.midi, frames: [f] } : null;
  }
  close();
  return notes;
}

// ---- bank ----------------------------------------------------------------------------------------
/** Shortest note worth keeping, and how many takes of each pitch (variety: no two notes alike). */
const MIN_NOTE = 0.14;
const TAKES = 4;
function makeBank(files) {
  mkdirSync(BANK_DIR, { recursive: true });
  for (const f of readdirSync(BANK_DIR)) rmSync(join(BANK_DIR, f));
  const best = new Map(); // semitone -> [{score, samples, midi, len, wobble}]
  for (const file of files) {
    const src = decode(file);
    for (const nt of findNotes(src)) {
      const semi = Math.round(nt.midi);
      const len = nt.end - nt.start;
      const wobble = Math.sqrt(nt.frames.reduce((a, f) => a + (f.midi - nt.midi) ** 2, 0) / nt.frames.length) * 100;
      const score = Math.min(len / RATE, 0.6) - wobble / 40;
      const takes = best.get(semi) ?? [];
      if (takes.length >= TAKES && takes[takes.length - 1].score >= score) continue;
      // straighten the note to its own pitch (a recorder holds steady), keep the natural attack
      const a = Math.max(0, nt.start - Math.floor(0.03 * RATE));
      const b = Math.min(src.length, nt.end + Math.floor(0.05 * RATE));
      const corr = new Float32Array(b - a);
      for (let k = 0; k + 1 < nt.frames.length; k++) {
        const f0 = nt.frames[k];
        const f1 = nt.frames[k + 1];
        for (let i = f0.t; i < f1.t; i++) {
          const m = f0.midi + ((f1.midi - f0.midi) * (i - f0.t)) / (f1.t - f0.t);
          if (i - a >= 0 && i - a < corr.length) corr[i - a] = Math.max(-0.6, Math.min(0.6, nt.midi - m));
        }
      }
      const out = [];
      let pos = 0;
      while (pos < corr.length - 1) {
        const i = Math.floor(pos);
        const fr = pos - i;
        out.push(src[a + i] * (1 - fr) + src[a + i + 1] * fr);
        pos += 2 ** (corr[i] / 12);
      }
      takes.push({ score, midi: nt.midi, samples: Float32Array.from(out), len: out.length / RATE, wobble });
      takes.sort((x, y) => y.score - x.score);
      best.set(semi, takes.slice(0, TAKES));
    }
  }
  const index = [];
  for (const [semi, takes] of [...best.entries()].sort((x, y) => x[0] - y[0])) {
    takes.forEach((b, k) => {
      const file = `note-${semi}-${k}.flac`;
      execFileSync(FF, ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(RATE), '-ac', '1', '-i', '-', '-c:a', 'flac', '-sample_fmt', 's16', join(BANK_DIR, file)], {
        input: Buffer.from(b.samples.buffer),
      });
      index.push({ file, midi: Number(b.midi.toFixed(3)), len: Number(b.len.toFixed(3)) });
    });
    const hz = (440 * 2 ** ((semi - 69) / 12)).toFixed(0);
    console.log(`bank: ${hz} Hz × ${takes.length} (${takes.map((b) => b.len.toFixed(2)).join(', ')} s)`);
  }
  writeFileSync(join(BANK_DIR, 'bank.json'), JSON.stringify(index, null, 1));
}

function loadBank() {
  const index = JSON.parse(readFileSync(join(BANK_DIR, 'bank.json'), 'utf8'));
  return index.map((b) => ({ ...b, samples: decode(join(BANK_DIR, b.file)) }));
}

// ---- tunes ---------------------------------------------------------------------------------------
const NAMES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** "C5:1 D#5:.5 R:1" -> [{midi|null, beats}] */
function parseTune(text) {
  return text
    .trim()
    .split(/\s+/)
    .filter((tok) => tok && tok !== '|')
    .map((tok) => {
      const [pitch, beats] = tok.split(':');
      const b = Number(beats ?? 1);
      if (pitch === 'R') return { midi: null, beats: b };
      const m = /^([A-G])(#|b)?(\d)$/.exec(pitch);
      if (!m) throw new Error(`bad note ${tok}`);
      const midi = 12 * (Number(m[3]) + 1) + NAMES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
      return { midi, beats: b };
    });
}

// ---- render --------------------------------------------------------------------------------------
function render(tuneId, out, seedArg) {
  const tune = TUNES[tuneId];
  if (!tune) throw new Error(`unknown tune ${tuneId}; see: node tools/flute-play.mjs list`);
  let seed = Number(seedArg ?? tune.seed ?? 7) >>> 0 || 1;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const between = (a, b) => a + rnd() * (b - a);
  const bank = loadBank();
  const notes = parseTune(tune.notes).map((n) => ({ ...n, midi: n.midi === null ? null : n.midi + (tune.transpose ?? 0) }));
  const beat = 60 / tune.bpm;
  const total = notes.reduce((a, n) => a + n.beats, 0) * beat + 0.8;
  const mix = new Float32Array(Math.ceil(total * RATE));
  const crackMask = new Float32Array(mix.length);
  const crackRanges = [];
  const highest = Math.max(...notes.filter((n) => n.midi !== null).map((n) => n.midi));
  const cache = new Map();

  /**
   * One bank note played at `midi`, `secs` long. The pitch is moved by plain resampling (a recorder
   * note shifted a semitone or two still sounds like a recorder, unlike a phase vocoder); a note
   * that must last longer loops its steady middle with crossfades. Different takes of the same
   * pitch are used in turn, so repeated notes aren't identical.
   */
  const voice = (midi, secs, soft = false, take = rnd()) => {
    const nearest = Math.min(...bank.map((x) => Math.abs(x.midi - midi)));
    const cands = bank.filter((x) => Math.abs(x.midi - midi) <= nearest + 0.6);
    const b = cands[Math.floor(take * cands.length) % cands.length];
    const ratio = 2 ** ((midi - b.midi) / 12);
    const key = `${b.file}|${ratio.toFixed(4)}|${secs.toFixed(3)}|${soft}`;
    if (cache.has(key)) return cache.get(key);
    const need = Math.ceil((secs + 0.04) * RATE * ratio) + 2;
    let src = b.samples;
    if (src.length < need) {
      // loop the steady middle (40–85 %) with 25 ms crossfades until it is long enough
      const a0 = Math.floor(src.length * 0.4);
      const a1 = Math.floor(src.length * 0.85);
      const fade = Math.min(Math.floor(0.025 * RATE), Math.floor((a1 - a0) / 3));
      const parts = [src.slice(0, a1)];
      let len = a1;
      while (len < need) {
        parts.push(src.slice(a0, a1));
        len += a1 - a0 - fade;
      }
      const out = new Float32Array(len + src.length - a1);
      out.set(parts[0], 0);
      let at = a1;
      for (let k = 1; k < parts.length; k++) {
        const seg = parts[k];
        const from = at - fade;
        for (let i = 0; i < seg.length; i++) {
          const w = i < fade ? i / fade : 1;
          out[from + i] = i < fade ? out[from + i] * (1 - w) + seg[i] * w : seg[i];
        }
        at = from + seg.length;
      }
      out.set(src.slice(a1), at);
      src = out.slice(0, at + src.length - a1);
    }
    const n = Math.floor(secs * RATE);
    let res = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const pos = i * ratio;
      const j = Math.floor(pos);
      const f = pos - j;
      res[i] = j + 1 < src.length ? src[j] * (1 - f) + src[j + 1] * f : 0;
    }
    if (soft) res = filter(res, 'lowpass=f=3200,lowpass=f=3200');
    cache.set(key, res);
    return res;
  };
  const rmsCache = new Map();
  const phoneRms = (samples) => {
    if (!rmsCache.has(samples)) {
      const hp = filter(samples, 'highpass=f=500');
      let s = 0;
      for (const v of hp) s += v * v;
      rmsCache.set(samples, Math.sqrt(s / Math.max(1, hp.length)) || 1e-6);
    }
    return rmsCache.get(samples);
  };
  const place = (samples, at, secs, gain, isCrack = 0) => {
    const len = Math.min(samples.length, Math.floor(secs * RATE));
    const rel = Math.min(Math.floor(0.03 * RATE), Math.floor(len / 3));
    for (let i = 0; i < len && at + i < mix.length; i++) {
      const env = Math.min(1, (len - i) / rel, i / 60);
      mix[at + i] += samples[i] * gain * env;
      if (isCrack) crackMask[at + i] = Math.max(crackMask[at + i], env);
    }
    // (squeaks sit on top of a note's start, so only real cracks are measured)
    if (isCrack === 1) crackRanges.push([at, at + len]);
  };

  let t = 0;
  let count = 0;
  const playable = notes.filter((n) => n.midi !== null).length;
  for (const n of notes) {
    const slot = n.beats * beat;
    if (n.midi === null) {
      t += slot;
      continue;
    }
    count++;
    const progress = count / playable;
    // ceremony pieces fall apart towards the end
    const mess = (tune.mess ?? 1) * (tune.escalate ? 0.5 + progress : 1);
    // the first notes stay clean, so everybody recognises the tune
    const hook = count <= (tune.cleanStart ?? 4);
    let midi = n.midi;
    const roll = rnd();
    let crack = false;
    if (!hook && n.midi >= highest - 4 && roll < 0.16 * mess) crack = true;
    else if (!hook && roll < 0.3 * mess) midi += (rnd() < 0.5 ? -1 : 1) * (rnd() < 0.75 ? 1 : 2); // wrong finger
    else if (roll < 0.45 * mess) midi += between(0.25, 0.4); // blown sharp
    const late = !hook && rnd() < 0.05 * mess ? between(0.05, 0.1) : 0;
    const start = t + late + between(-0.012, 0.012);
    const secs = Math.max(0.06, slot * (tune.legato ?? 0.85) - late);
    const at = Math.max(0, Math.floor(start * RATE));
    if (crack) {
      // overblown: flips an octave up for a moment, softer than the note itself, top end filed off
      const split = secs > 0.3 ? between(0.3, 0.6) : 0;
      if (split > 0) place(voice(midi, secs), at, secs * split, 1);
      const cAt = at + Math.floor(secs * split * RATE);
      const up = voice(midi + 12, secs * (1 - split), true);
      // on a phone speaker (no lows) the crack must stay quieter than the note it breaks out of
      const gain = Math.min(0.5, (0.6 * phoneRms(voice(midi, secs))) / phoneRms(up));
      place(up, cAt, secs * (1 - split), gain, 1);
    } else {
      place(voice(midi, secs), at, secs, 1);
      // squeak when tonguing
      if (!hook && rnd() < 0.08 * mess) {
        const sq = voice(midi + 19, 0.05, true);
        place(sq, at, 0.04, Math.min(0.22, (0.4 * phoneRms(voice(midi, secs))) / phoneRms(sq)), 2);
      }
    }
    t += slot;
  }

  // blown a bit too hard, breath noise under the tone
  let env = 0;
  let lastNoise = 0;
  for (let i = 0; i < mix.length; i++) {
    const x = mix[i];
    env = Math.max(Math.abs(x), env * 0.9995);
    const noise = rnd() * 2 - 1;
    const hiss = (noise - lastNoise) * 0.5;
    lastNoise = noise;
    mix[i] = Math.tanh(1.6 * x) / Math.tanh(1.6) + hiss * env * 0.12;
  }
  // loudness like the other sounds; limiter keeps the peaks well below clipping
  let sum = 0;
  for (const v of mix) sum += v * v;
  const g = 0.11 / Math.sqrt(sum / mix.length);
  for (let i = 0; i < mix.length; i++) mix[i] *= g;
  encode(mix, out, 'highpass=f=220,equalizer=f=3200:t=q:w=1.2:g=-4,lowpass=f=7500,alimiter=limit=0.6:attack=3:release=60:level=false');

  // phone speaker check: loudest crack vs. the normal notes, and the peak after the limiter
  const done = decode(out);
  const phone = filter(done, 'highpass=f=500');
  let peak = 0;
  for (const v of phone) peak = Math.max(peak, Math.abs(v));
  // every crack as a whole vs. the loud normal notes (rms per 50 ms window)
  const rmsOf = (a, b) => {
    let q = 0;
    for (let i = a; i < b; i++) q += phone[i] ** 2;
    return Math.sqrt(q / Math.max(1, b - a));
  };
  let crackMax = 0;
  for (const [a, b] of crackRanges) crackMax = Math.max(crackMax, rmsOf(a, Math.min(b, phone.length)));
  const win = Math.floor(0.05 * RATE);
  const normal = [];
  for (let i = 0; i + win < Math.min(phone.length, crackMask.length); i += win) {
    if (crackMask[i] > 0 || crackMask[i + win - 1] > 0) continue;
    const r = rmsOf(i, i + win);
    if (r > 0.01) normal.push(r);
  }
  normal.sort((a, b) => a - b);
  const loudNormal = normal[Math.floor(normal.length * 0.9)] ?? 1;
  const db = (v) => (20 * Math.log10(v)).toFixed(1);
  console.log(
    `${out}: "${tune.title}", ${(done.length / RATE).toFixed(1)} s · phone peak ${db(peak)} dB · loudest crack ${crackMax ? db(crackMax / loudNormal) : '–'} dB vs loud notes`,
  );
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'bank') makeBank(rest);
else if (cmd === 'play') render(rest[0], rest[1], rest[2]);
else if (cmd === 'list') for (const [id, t] of Object.entries(TUNES)) console.log(`${id.padEnd(14)} ${t.title}`);
else {
  console.error('usage: node tools/flute-play.mjs bank <files…> | play <tune> <out.mp3> [seed] | list');
  process.exit(1);
}
if (cmd === 'play' && !existsSync(rest[1])) process.exit(1);
