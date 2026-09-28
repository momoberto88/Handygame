// Renders the intro film frame by frame (no real-time playback, so nothing stutters).
//   node tools/intro/render.mjs <outDir> [frame,frame,…]   – only these frames (preview)
//   node tools/intro/render.mjs <outDir>                   – all frames as PNG
// Needs the Vite dev server: npx vite --port 5174 (from the repo root).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { FPS, LENGTH } from './cues.mjs';

const [out = 'intro-frames', pick] = process.argv.slice(2);
const only = pick ? new Set(pick.split(',').map(Number)) : null;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()); });
await page.goto(`http://localhost:${process.env.PORT ?? 5174}/tools/intro/index.html`, { timeout: 120000 });
await page.waitForFunction(() => window.filmReady === true, null, { timeout: 120000 });
await page.evaluate(() => window.game.loop.stop());
const total = FPS * LENGTH;
const last = only ? Math.max(...only) : total - 1;
const t0 = Date.now();
for (let f = 0; f <= last; f++) {
  await page.evaluate((f) => window.game.step(1000 + f * (1000 / 30), 1000 / 30), f);
  if (!only || only.has(f)) {
    await page.screenshot({ path: `${out}/f${String(f).padStart(4, '0')}.png`, clip: { x: 0, y: 0, width: 1920, height: 1080 } });
  }
  if (f % 60 === 0) console.log('frame', f, `${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
await browser.close();
