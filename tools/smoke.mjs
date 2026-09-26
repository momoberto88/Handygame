import { chromium } from 'playwright';
const SP = process.env.SP;
const url = process.env.URL ?? 'http://localhost:4173/';
let browser;
try {
  browser = await chromium.launch();
} catch (e) {
  browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
}
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto(url);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SP}/shots/1-menu.png` });
// start quick race via scene manager (tap on button position is layout dependent)
await page.evaluate(() => {
  const g = window.game; const menu = g.scene.getScene('menu');
  menu.children.list; // noop
});
// click the "Schnelles Rennen" button: at 70% width, y=190 of 540 logical
await page.mouse.click(844 * 0.7, 390 * 190 / 540);
await page.waitForTimeout(1200);
await page.screenshot({ path: `${SP}/shots/2-countdown.png` });
await page.waitForTimeout(2500);
// run with random jumps via keyboard
for (let i = 0; i < 12; i++) {
  await page.keyboard.down('Space'); await page.waitForTimeout(250); await page.keyboard.up('Space');
  await page.waitForTimeout(500);
  if (i === 3) await page.screenshot({ path: `${SP}/shots/3-race.png` });
  if (i === 8) await page.screenshot({ path: `${SP}/shots/4-race.png` });
}
const state = await page.evaluate(() => {
  const s = window.game.scene.getScene('race').session;
  return { t: s.race.time, runners: s.race.runners.map(r => ({ x: Math.round(r.x), mode: r.mode, deaths: r.deaths, item: r.item })) , fps: window.game.loop.actualFps };
});
console.log(JSON.stringify(state));
console.log(errors.slice(0, 20).join('\n'));
await browser.close();
