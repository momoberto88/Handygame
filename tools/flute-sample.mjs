// Records the flute tunes into a WAV sample (needs `npx vite --port 5188` running).
// Usage: node tools/flute-sample.mjs out.wav
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const out = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage();
await p.goto('http://localhost:5188/?nothing');
const wav = await p.evaluate(async () => {
  const m = await import('/src/audio/flute.ts');
  const T = m.TUNES;
  const parts = [
    [T.ODE, 170, 1],
    [T.ELISE, 150, 1],
    [T.ENTERTAINER, 190, 1],
    [T.MOUNTAIN_KING, 150, 1],
    [[...T.ODE, ...T.ODE_END], 150, 1.4],
  ];
  const rate = 44100;
  const total = 50;
  const ctx = new OfflineAudioContext(1, rate * total, rate);
  const comp = ctx.createDynamicsCompressor();
  comp.connect(ctx.destination);
  // play them one after another, with a pause in between
  let at = 0.2;
  for (const [tune, bpm, slop] of parts) {
    const beats = tune.reduce((a, n) => a + n[1], 0);
    const shifted = new Proxy(ctx, { get: (t, k) => (k === 'currentTime' ? at : typeof t[k] === 'function' ? t[k].bind(t) : t[k]) });
    m.playOn(shifted, comp, tune, bpm, slop);
    at += (beats * 60) / bpm + 1.2;
  }
  const buf = await ctx.startRendering();
  const data = buf.getChannelData(0);
  const len = Math.min(data.length, Math.ceil((at + 0.5) * rate));
  const bytes = new DataView(new ArrayBuffer(44 + len * 2));
  const str = (o, s) => [...s].forEach((c, i) => bytes.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); bytes.setUint32(4, 36 + len * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  bytes.setUint32(16, 16, true); bytes.setUint16(20, 1, true); bytes.setUint16(22, 1, true);
  bytes.setUint32(24, rate, true); bytes.setUint32(28, rate * 2, true); bytes.setUint16(32, 2, true); bytes.setUint16(34, 16, true);
  str(36, 'data'); bytes.setUint32(40, len * 2, true);
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(data[i]));
  const gain = peak > 0 ? 0.9 / peak : 1;
  for (let i = 0; i < len; i++) bytes.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i] * gain)) * 32767, true);
  let bin = '';
  const u8 = new Uint8Array(bytes.buffer);
  for (let i = 0; i < u8.length; i += 8192) bin += String.fromCharCode(...u8.subarray(i, i + 8192));
  return { b64: btoa(bin), peak, seconds: at };
});
writeFileSync(out, Buffer.from(wav.b64, 'base64'));
console.log('peak', wav.peak.toFixed(3), 'seconds', wav.seconds.toFixed(1));
await b.close();
