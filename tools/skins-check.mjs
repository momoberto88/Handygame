import { chromium } from 'playwright';
const out = process.argv[2];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack));
page.on('response', (r) => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
// old save with a hat, to check the refund
await page.goto('http://localhost:4173/?nothing');
await page.evaluate(() => localStorage.setItem('chaos-sprint-save-v1', JSON.stringify({ coins: 100, owned: ['crown', 'shades'], equipped: { hat: 'crown', glasses: 'shades', outfit: null }, tutorialDone: true, unlocked: ['hase','katze','ratte','otter','kraehe','dachs','maulwurf','chinchilla','schildkroete'] })));
await page.goto('http://localhost:4173/?lineup&skins');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/skins-lineup.png` });
await page.goto('http://localhost:4173/');
await page.waitForTimeout(2000);
console.log('coins after refund', await page.evaluate(() => JSON.parse(localStorage.getItem('chaos-sprint-save-v1')).coins));
await page.evaluate(() => { window.game.scene.getScene('menu').scene.start('wardrobe'); });
await page.waitForTimeout(800);
const S = 390 / 540, W = 844 / S;
const tabW = Math.min(170, (W * 0.58 - 16) / 3);
await page.mouse.click((W * 0.42 + tabW / 2 + (tabW + 8)) * S, 76 * S); // Skins tab
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/skins-shop.png` });
// buy the selected one
await page.mouse.click(W * 0.2 * S, 440 * S);
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/skins-bought.png` });
const save = await page.evaluate(() => JSON.parse(localStorage.getItem('chaos-sprint-save-v1')));
console.log('coins', save.coins, 'owned', save.owned, 'skins', save.skins, 'char', save.character);
// race with the skin
await page.goto('http://localhost:4173/?autoplay&seed=3');
await page.waitForTimeout(1500);
await page.mouse.click(844 * 0.7, (390 * 190) / 540);
await page.waitForTimeout(6500);
await page.screenshot({ path: `${out}/skins-race.png` });
console.log(errors.length ? errors.slice(0, 5) : 'no errors');
await browser.close();
