// Sound track of the intro: the game's own world music follows the film (muffled night in the
// temple, silence on the click, the storm bursts in, jungle → mine → sky during the chase, a big
// ending), the game's sound effects for the big hits, and mechanical sounds synthesised in code
// (ticking, gears, steam, springs) with some body and room. No voices.
//   node tools/intro/sound.mjs out.wav
import { RATE, createMix, env, ramp } from './mix.mjs';
import { CUES as C, LENGTH } from './cues.mjs';

const { add, sample, musicBed, tick, thump, clunk, bell, hiss, write } = createMix(LENGTH);

// --- the music: one bed that follows the film ------------------------------------------------

const XF = 0.45; // cross-fade between the worlds

// scene 1–2: the jungle theme, muffled and quiet (night in the temple), fading into silence on the click
musicBed('jungle', 0, C.click + 0.1, 0, (t) => 0.75 * ramp(t, 0, 1.8) * (1 - ramp(t, C.click - 0.08, C.click + 0.05)), () => 1);
// scene 3–4: the storm bursts out – the jungle theme returns at full blast, then mine, then sky
musicBed('jungle', C.stormOut - 0.05, C.mine + XF, C.stormOut, (t) => 0.95 * ramp(t, C.stormOut - 0.05, C.stormOut + 0.25) * (1 - ramp(t, C.mine - XF, C.mine + XF)));
musicBed('mine', C.mine - XF, C.sky + XF, C.mine - XF, (t) => 0.95 * ramp(t, C.mine - XF, C.mine + XF) * (1 - ramp(t, C.sky - XF, C.sky + XF)));
// sky theme carries on under the title, then gently fades out
musicBed('sky', C.sky - XF, LENGTH, C.sky - XF, (t) => ramp(t, C.sky - XF, C.sky + XF) * (0.95 - 0.45 * ramp(t, C.title - 0.1, C.stamp) + 0.25 * ramp(t, C.stamp, C.stamp + 0.6)) * (1 - ramp(t, 18.9, LENGTH)));

// --- synthesised mechanics, now with body ----------------------------------------------------

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

write(process.argv[2] ?? 'intro.wav');
