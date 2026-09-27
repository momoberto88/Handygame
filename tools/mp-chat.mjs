// Chat between two phones in the lobby (quick phrase + own text).
// Needs `npx vite preview --port 4173` and `npx peerjs --port 9000 --host 127.0.0.1` running.
// Usage: node tools/mp-chat.mjs [shotsDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const shots = process.argv[2] ?? 'test-results/mp-chat';
mkdirSync(shots, { recursive: true });
const base = 'http://localhost:4173/?peerhost=127.0.0.1&peerport=9000';
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium' });
const S = 390 / 540;
const W = 844 / S;
const tap = (page, x, y) => page.mouse.click(x * S, y * S);
async function phone(name, url, nick) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${name}] pageerror: ${e.stack}`));
  await page.goto('http://localhost:4173/?nothing');
  await page.evaluate((n) => localStorage.setItem('chaos-sprint-save-v1', JSON.stringify({ tutorialDone: true, name: n })), nick);
  await page.goto(url);
  await page.waitForTimeout(1500);
  return page;
}
const until = async (page, fn, ms = 15000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await page.evaluate(fn)) return true;
    await page.waitForTimeout(200);
  }
  return false;
};

const host = await phone('host', base, 'Momo');
await tap(host, W * 0.7, 320);
await host.waitForTimeout(400);
await tap(host, W / 2, 230);
await until(host, () => !!window.chaosRoom?.code);
const code = await host.evaluate(() => window.chaosRoom.code);
const client = await phone('client', `${base}&raum=${code}`, 'Kumpel');
await until(host, () => (window.chaosRoom?.players.length ?? 0) >= 2);

// client: 💬 → first phrase
await tap(client, W - 36, 34);
await client.waitForTimeout(500);
await client.screenshot({ path: `${shots}/1-client-picker.png` });
const vw = 844 / S;
const bw = Math.min(210, (vw - 80) / 3);
const rows = Math.ceil((await client.evaluate(() => 20)) / 3); // rude on: 20 phrases
const h = rows * 40 + 110;
await tap(client, vw / 2 - (bw + 8), 540 / 2 - h / 2 + 62);
const gotPhrase = await until(host, () => window.chaosRoom.chat.some((m) => m.name === 'Kumpel'));
console.log('phrase arrived at host:', gotPhrase, await host.evaluate(() => window.chaosRoom.chat.map((m) => `${m.name}: ${m.text}`)));

// host: 💬 → ✏️ own text
await host.waitForTimeout(1300);
await tap(host, W - 36, 34);
await host.waitForTimeout(400);
await tap(host, vw / 2, 540 / 2 + h / 2 - 26);
await host.waitForTimeout(300);
await host.keyboard.type('Noch eine Runde, ihr Nasen?');
await host.keyboard.press('Enter');
const gotText = await until(client, () => window.chaosRoom.chat.some((m) => m.text.includes('Nasen')));
console.log('own text arrived at client:', gotText, await client.evaluate(() => window.chaosRoom.chat.map((m) => `${m.name}: ${m.text}`)));
await client.waitForTimeout(500);
await client.screenshot({ path: `${shots}/2-client-lobby-feed.png` });
await browser.close();
