import { chromium } from 'playwright';
const [out, ...pairs] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
await Promise.all(pairs.map(async (p) => {
  const [w, c] = p.split(':');
  const page = await (await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
  page.on('pageerror', (e) => console.log(w, 'pageerror:', e.message));
  await page.goto(`http://localhost:4173/?autoplay&course=${c}&seed=3`, { timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.mouse.click(844 * 0.7, (390 * 190) / 540);
  const dl = Date.now() + 90000;
  while (Date.now() < dl && (await page.evaluate(() => window.game.scene.getScene('race')?.session?.race.time ?? 0)) < 14) await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}/w-${w}.png` });
}));
await browser.close();
