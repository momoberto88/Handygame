// Renders "Die Krönung" from the real game, frame by frame, with a made-up cup result.
//   node tools/intro/coronation-render.mjs <outDir> [winner] [frames]
//     winner: a character id (default katze), or "team" for a 2 vs 2 cup
//     frames: comma-separated frame numbers to save only those (preview); default all 360
//   env W/H: viewport size in CSS pixels (default 1920×1080; a phone is e.g. 844×390 with DPR=3)
// Needs the Vite dev server: npx vite --port 5174 (from the repo root).
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';

const CUE = JSON.parse(readFileSync(new URL('../../src/render/film/coronation.json', import.meta.url), 'utf8'));
const FPS = 30;
const [out = 'coronation-frames', winner = 'katze', pick] = process.argv.slice(2);
const only = pick ? new Set(pick.split(',').map(Number)) : null;
const W = Number(process.env.W ?? 1920);
const H = Number(process.env.H ?? 1080);
const DPR = Number(process.env.DPR ?? 1);
mkdirSync(out, { recursive: true });

const NAMES = { hase: 'King Hoppel', katze: 'Mocca', ratte: 'Zündi', otter: 'Doc Otto', kraehe: 'Voodoo-Vinz', dachs: 'Dompteur Dax', maulwurf: 'Bruder Buddel', chinchilla: 'Madame Flausch', schildkroete: 'Bumm-Bert' };
const entry = (character, points, extra = {}) => ({ key: `b:${character}`, name: NAMES[character], character, isBot: true, points, last: 0, ...extra });
const team = winner === 'team';
const order = team ? ['katze', 'maulwurf', 'ratte', 'hase'] : [winner, ...['ratte', 'maulwurf', 'hase', 'katze'].filter((c) => c !== winner)].slice(0, 4);
const points = [34, 22, 12, 4];
const table = order.map((c, i) => entry(c, points[i], team ? { team: i < 2 ? 0 : 1 } : {}));
const cup = { id: 'pilz', name: 'Pilz-Cup', courses: ['a', 'b', 'c', 'd'], index: 3, table, counted: 3, seed: 1, ...(team ? { teams: true } : {}) };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('console', m.text());
});
await page.goto(`http://localhost:${process.env.PORT ?? 5174}/`, { timeout: 120000 });
await page.waitForFunction(() => window.game?.scene.isActive('menu'), null, { timeout: 120000 });
await page.evaluate(() => Promise.all(['40px "Patrick Hand"', '40px "Permanent Marker"'].map((f) => document.fonts.load(f))));
await page.evaluate((cup) => {
  const mgr = window.game.scene;
  mgr.stop('menu');
  mgr.start('coronation', { cup, me: '', online: false });
}, cup);
await page.waitForFunction(() => window.game.scene.isActive('coronation'), null, { timeout: 30000 });
await page.evaluate(() => window.game.loop.stop());
const total = Math.round(FPS * CUE.length) - 1;
const last = only ? Math.max(...only) : total - 1;
const t0 = Date.now();
for (let f = 0; f <= last; f++) {
  await page.evaluate(([f, fps]) => window.game.step(100000 + f * (1000 / fps), 1000 / fps), [f, FPS]);
  if (!only || only.has(f)) await page.screenshot({ path: `${out}/f${String(f).padStart(4, '0')}.png`, timeout: 120000 });
  if (f % 60 === 0) console.log('frame', f, `${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
await browser.close();
