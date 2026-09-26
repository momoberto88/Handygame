import { chromium } from 'playwright';
const out = process.argv[2];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack));
await page.goto('http://localhost:4173/');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/tut-ask.png` });
const S = 390 / 540, W = 844 / S;
await page.mouse.click((W / 2 - 120) * S, (540 / 2 + 80) * S); // Los geht's
const step = () => page.evaluate(() => window.game.scene.getScene('hud')?.coach?.step ?? -1);
const t = () => page.evaluate(() => window.game.scene.getScene('race')?.session?.race.time ?? -9);
while ((await t()) < 0.5) await page.waitForTimeout(100);
await page.screenshot({ path: `${out}/tut-1.png` });
const key = async (k, ms = 80) => { await page.keyboard.down(k); await page.waitForTimeout(ms); await page.keyboard.up(k); };
await key('Space'); await page.waitForTimeout(150);            // jump
console.log('after jump', await step());
await key('Space'); await page.waitForTimeout(120); await key('Space'); // double
await page.waitForTimeout(900);
console.log('after double', await step());
await page.screenshot({ path: `${out}/tut-3.png` });
await key('ArrowDown', 500);                                   // slide
console.log('after slide', await step());
await key('Space', 100); await page.waitForTimeout(250); await key('ArrowDown', 400); // slam
await page.waitForTimeout(800);
console.log('after slam', await step());
for (let i = 0; i < 70 && (await step()) === 4; i++) { if (i % 6 === 0) await key('Space', 120); await page.waitForTimeout(250); }
console.log('after box', await step());
await page.screenshot({ path: `${out}/tut-6.png` });
for (let i = 0; i < 30 && (await step()) === 5; i++) { await key('e'); await page.waitForTimeout(300); }
console.log('after item', await step());
for (let i = 0; i < 20 && (await step()) === 6; i++) { await key('f'); await page.waitForTimeout(300); }
console.log('after ability', await step());
await page.screenshot({ path: `${out}/tut-done.png` });
await page.waitForTimeout(5000);
console.log('scene menu active', await page.evaluate(() => window.game.scene.isActive('menu')), 'coins', await page.evaluate(() => JSON.parse(localStorage.getItem('chaos-sprint-save-v1')).coins));
console.log(errors.length ? errors : 'no errors');
await browser.close();
