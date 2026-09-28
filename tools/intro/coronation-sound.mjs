// Sound track of "Die Krönung" (src/scenes/CoronationScene.ts), timed to src/render/film/coronation.json:
// the jungle theme, muffled while the hall waits, a drum roll on the walk, a spring boing when the
// crown pops off, a bell when it lands, the loser's thunder, confetti pops, the stamp, a music box.
//   node tools/intro/coronation-sound.mjs out.wav
// then for the game: ffmpeg -i out.wav -af loudnorm=I=-19:TP=-2 -b:a 128k public/assets/audio/music/coronation.mp3
import { readFileSync } from 'node:fs';
import { createMix, env, ramp } from './mix.mjs';

const C = JSON.parse(readFileSync(new URL('../../src/render/film/coronation.json', import.meta.url), 'utf8'));
const L = C.length;
const { add, sample, musicBed, tick, thump, clunk, bell, hiss, write } = createMix(L);

// the jungle theme: muffled and quiet while the hall waits, opening up when the crown lands,
// a little quieter under the stamp and the music box, fading out into the podium
musicBed(
  'jungle',
  0,
  L,
  4,
  (t) => ramp(t, 0, 1.2) * (0.55 + 0.4 * ramp(t, C.crownLand - 0.3, C.crownLand + 0.2) - 0.25 * ramp(t, C.stamp + 0.8, C.stamp + 1.6)) * (1 - ramp(t, C.fade, L)),
  (t) => 1 - ramp(t, C.crownPop, C.crownLand + 0.2),
);

// the CHAOS-O-MAT ticks along
for (let t = 0; t < C.crownPop; t += 0.5) tick(t, Math.round(t * 2) % 2 ? 1750 : 2300, 0.22 * Math.min(1, t / 0.6 + 0.3), -0.45);

// the walk: soft steps on the carpet, then a drum roll that swells up to the crown
for (let t = C.walkStart + 0.1; t < C.walkEnd; t += 0.26) thump(t, 0.14, 140, -0.1);
{
  const a = C.walkEnd - 1.3;
  const b = C.crownPop;
  for (let t = a; t < b; t += 0.055) {
    const u = ramp(t, a, b);
    hiss(t, 0.05, 0.08 + 0.3 * u * u, 900, 6000, (k) => env(k, 0.02, 0.25), -0.05, 0.25);
    if (Math.round((t - a) / 0.055) % 2 === 0) thump(t, 0.05 + 0.12 * u, 180, 0);
  }
}

// the crown pops off the cushion: a spring boing, a pad and a little chime while it flies
add(C.crownPop, 0.9, (k, x) => {
  const f = 170 + 330 * Math.min(1, x * 6) + Math.sin(x * 55) * 60 * (1 - k);
  return Math.sin(2 * Math.PI * f * x) * env(x, 0.004, 0.25);
}, 0.45, -0.1, 0.3);
sample('pad', C.crownPop, 0.4, -0.1);
hiss(C.crownPop + 0.1, C.crownLand - C.crownPop, 0.25, 900, 7000, (k) => Math.sin(k * Math.PI), 0.1, 0.4);
// it lands on the winner's head
bell(C.crownLand, 1568, 0.32, 2.0, 0);
bell(C.crownLand + 0.08, 2093, 0.16, 1.6, 0.1);
clunk(C.crownLand, 0.2, 420, 0);
sample('coin', C.crownLand + 0.02, 0.35, 0, 0.3);

// a little storm cloud over the last one: rumble, then the bolt
hiss(C.cloud, L - C.cloud, 0.35, 30, 220, (k) => Math.min(1, k * 10) * (1 - k) * (0.7 + 0.3 * Math.sin(k * 30)), 0.6, 0.2);
sample('lightning', C.bolt, 0.3, 0.65, 0.3);
sample('zap', C.bolt + 0.02, 0.25, 0.65, 0.2);

// confetti out of the machine's chimney: a pop and a crackle of little pops
sample('box-1', C.confetti, 0.35, -0.5, 0.3);
for (let i = 0; i < 14; i++) {
  const t = C.confetti + 0.05 + i * 0.07 + ((i * 37) % 10) * 0.004;
  hiss(t, 0.04, 0.22 - i * 0.01, 1500, 9000, (k) => env(k, 0.01, 0.2), -0.6 + (i % 5) * 0.2, 0.35);
}

// the winner hops onto the throne
sample('jump-1', C.throneJump, 0.3, 0.1);
sample('land', C.onThrone, 0.3, 0.1);
thump(C.onThrone, 0.35, 90, 0.1);

// the stamp: LANG LEBE …!
sample('boom', C.stamp - 0.03, 0.75, 0, 0.45);
sample('slam', C.stamp, 0.55, 0, 0.3);
thump(C.stamp, 0.8, 55);
clunk(C.stamp + 0.01, 0.35, 120);
sample('finish', C.stamp + 0.15, 0.5, 0, 0.35);
for (let i = 0; i < 10; i++) tick(C.stamp + 0.05 + i * 0.045, 3000 + (i % 4) * 400, 0.05, (i % 5) * 0.3 - 0.6, 0.3);

// a music box closes it (the same little tune as the intro's ending)
const box = [[0, 1047], [0.22, 1319], [0.44, 1568], [0.66, 2093], [0.95, 1568], [1.17, 1760], [1.5, 2093]];
for (const [dt, f] of box) bell(C.stamp + 0.9 + dt, f, 0.14, 1.5, dt * 0.6 - 0.4);

write(process.argv[2] ?? 'coronation.wav');
