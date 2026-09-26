// Screenshot of one URL in phone landscape: node tools/shot.mjs "<query>" out.png [waitMs]
import { chromium } from 'playwright';
const [query, out, wait] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium' });
const page = await (await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
page.on('pageerror', (e) => console.log('pageerror:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()); });
await page.goto(`${process.env.URL ?? 'http://localhost:4173/'}?${query}`);
await page.waitForTimeout(Number(wait ?? 2000));
await page.screenshot({ path: out });
await browser.close();
