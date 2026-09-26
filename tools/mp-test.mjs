// Two-phone multiplayer test: needs `npx vite preview --port 4173` and `npx peerjs --port 9000` running.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const shots = process.env.SHOTS ?? 'test-results/mp';
mkdirSync(shots, { recursive: true });
const url = 'http://localhost:4173/?peerhost=127.0.0.1&peerport=9000&autoplay';
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium' });
const S = 390 / 540; // logical → css px
async function phone(name) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${name}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') console.log(`[${name}] console: ${m.text()}`); });
  await page.goto(url);
  await page.waitForTimeout(1200);
  return page;
}
const W = 844 / S;
const tap = (page, x, y) => page.mouse.click(x * S, y * S);
const host = await phone('host');
const client = await phone('client');

await tap(host, W * 0.7, 272); // Mit Freunden
await host.waitForTimeout(400);
await tap(host, W / 2, 230); // Raum erstellen
let code = null;
for (let i = 0; i < 40 && !code; i++) {
  await host.waitForTimeout(250);
  code = await host.evaluate(() => window.chaosRoom?.code ?? null);
}
console.log('room code', code);
await host.screenshot({ path: `${shots}/host-lobby.png` });

await tap(client, W * 0.7, 272);
await client.waitForTimeout(400);
await tap(client, W / 2, 316); // Raum beitreten
await client.waitForTimeout(300);
for (const digit of code) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'];
  const i = keys.indexOf(digit);
  await tap(client, W * 0.72 + ((i % 3) - 1) * 84, 120 + Math.floor(i / 3) * 76);
  await client.waitForTimeout(120);
}
await client.screenshot({ path: `${shots}/client-code.png` });
await tap(client, W * 0.3, 290); // Beitreten
for (let i = 0; i < 40; i++) {
  await host.waitForTimeout(250);
  const n = await host.evaluate(() => window.chaosRoom?.players.length ?? 0);
  if (n >= 2) break;
}
await host.waitForTimeout(500);
await host.screenshot({ path: `${shots}/host-lobby-2.png` });
await client.screenshot({ path: `${shots}/client-lobby.png` });
await tap(host, W / 2 + 150, 380); // Rennen starten

const state = (page) =>
  page.evaluate(() => {
    const s = window.game.scene.getScene('race')?.session;
    if (!s) return null;
    return { t: +s.race.time.toFixed(2), me: s.localId, status: s.status(), runners: s.race.runners.map((r) => [Math.round(r.x), Math.round(r.y), r.mode, r.deaths]) };
  });
for (const t of [3, 10, 20, 30]) {
  for (let i = 0; i < 400; i++) {
    const st = await state(host);
    if (st && st.t >= t) break;
    await host.waitForTimeout(100);
  }
  const [a, b] = await Promise.all([state(host), state(client)]);
  console.log(`t=${t}\n host  ${JSON.stringify(a)}\n client ${JSON.stringify(b)}`);
  await Promise.all([host.screenshot({ path: `${shots}/host-${t}s.png` }), client.screenshot({ path: `${shots}/client-${t}s.png` })]);
}
for (let i = 0; i < 600; i++) {
  const over = await client.evaluate(() => window.game.scene.isActive('result'));
  if (over) break;
  await client.waitForTimeout(200);
}
await client.waitForTimeout(1000);
await Promise.all([host.screenshot({ path: `${shots}/host-result.png` }), client.screenshot({ path: `${shots}/client-result.png` })]);
const fin = (page) => page.evaluate(() => window.game.scene.getScene('race').session.race.standings().map((r) => [r.id, r.place, +r.finishTime.toFixed(2)]));
console.log('host standings  ', JSON.stringify(await fin(host)));
console.log('client standings', JSON.stringify(await fin(client)));
await browser.close();
