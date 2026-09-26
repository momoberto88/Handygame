// Browser smoke test: opens the built game in headless Chromium (phone landscape),
// starts a race with the local runner on autopilot and saves screenshots.
// Usage: npx vite preview --port 4173 &  then  SHOTS=dir node tools/smoke.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const shots = process.env.SHOTS ?? 'test-results/smoke';
mkdirSync(shots, { recursive: true });
const base = process.env.URL ?? 'http://localhost:4173/';
const params = process.env.PARAMS ?? 'autoplay';
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto(`${base}?${params}`);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${shots}/1-menu.png` });
await page.mouse.click(844 * 0.7, (390 * 190) / 540);
const snap = async (name) => page.screenshot({ path: `${shots}/${name}.png` });
const raceTime = () => page.evaluate(() => window.game.scene.getScene('race')?.session?.race.time ?? -99);
await page.waitForTimeout(800);
await snap('2-countdown');
const marks = [2, 8, 15, 25, 35];
let i = 0;
const deadline = Date.now() + 1000 * Number(process.env.MAX_SECONDS ?? 400);
while (Date.now() < deadline) {
  const t = await raceTime();
  if (i < marks.length && t >= marks[i]) await snap(`3-race-${marks[i++]}s`);
  const over = await page.evaluate(() => window.game.scene.isActive('result'));
  if (over) break;
  await page.waitForTimeout(250);
}
await page.waitForTimeout(1200);
await snap('9-result');
const summary = await page.evaluate(() => {
  const s = window.game.scene.getScene('race').session;
  return s.race.standings().map((r) => ({ id: r.id, t: +r.finishTime.toFixed(2), deaths: r.deaths, coins: r.coins }));
});
console.log(JSON.stringify(summary));
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
await browser.close();
