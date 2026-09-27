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

await tap(host, W * 0.7, 320); // Mit Freunden
await host.waitForTimeout(400);
await tap(host, W / 2, 230); // Raum erstellen
let code = null;
for (let i = 0; i < 40 && !code; i++) {
  await host.waitForTimeout(250);
  code = await host.evaluate(() => window.chaosRoom?.code ?? null);
}
console.log('room code', code);
await host.screenshot({ path: `${shots}/host-lobby.png` });

await tap(client, W * 0.7, 320);
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
// the host lets the guest in (✅ on the doorbell)
for (let i = 0; i < 40; i++) {
  await host.waitForTimeout(250);
  if (await host.evaluate(() => (window.chaosRoom?.requests.length ?? 0) > 0)) break;
}
await host.waitForTimeout(300);
await tap(host, W / 2 - 104, 270 + 50);
for (let i = 0; i < 40; i++) {
  await host.waitForTimeout(250);
  const n = await host.evaluate(() => window.chaosRoom?.players.length ?? 0);
  if (n >= 2) break;
}
await host.waitForTimeout(500);
await host.screenshot({ path: `${shots}/host-lobby-2.png` });
await client.screenshot({ path: `${shots}/client-lobby.png` });
if (process.env.PLAYLIST) {
  // e.g. PLAYLIST='{"name":"Mix","courses":["custom:…"]}'
  await host.evaluate((p) => {
    window.chaosRoom.playlist = JSON.parse(p);
    window.chaosRoom.broadcastLobby();
  }, process.env.PLAYLIST);
  await host.waitForTimeout(500);
}
if (process.env.CUP) {
  // a two-race cup, set the way the course screen would
  await host.evaluate(() => {
    window.chaosRoom.playlist = { name: 'Test-Cup', courses: ['lianen-lauf', 'zahnrad-express'] };
    window.chaosRoom.broadcastLobby();
  });
  await host.waitForTimeout(500);
  await client.screenshot({ path: `${shots}/client-lobby-cup.png` });
}
if (process.env.VOTE) {
  await tap(host, W / 2 - 150, 450); // Abstimmung: an
  await host.waitForTimeout(400);
}
await tap(host, W / 2 + 150, 380); // Rennen starten
if (process.env.VOTE) {
  // both phones vote for the third course
  await host.waitForTimeout(1200);
  const options = await client.evaluate(() => window.chaosRoom?.vote?.options);
  console.log('vote options', JSON.stringify(options));
  const cw = Math.min(290, (W - 80) / 3);
  await client.screenshot({ path: `${shots}/client-vote.png` });
  await tap(client, W / 2 + (cw + 20), 250);
  await tap(host, W / 2 + (cw + 20), 250);
  await host.waitForTimeout(700);
  await client.screenshot({ path: `${shots}/client-voted.png` });
  console.log('votes', JSON.stringify(await host.evaluate(() => window.chaosRoom.vote?.votes)));
  console.log('expected course', options?.[2]);
}

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
const courseOf = (page) => page.evaluate(() => window.game.scene.getScene('race').session.race.courseId);
console.log('course host/client', await courseOf(host), await courseOf(client));
const table = (page) => page.evaluate(() => window.chaosCup && { i: window.chaosCup.index, t: window.chaosCup.table.map((e) => [e.name, e.points]) });
if (process.env.CUP) {
  console.log('cup after race 1 host  ', JSON.stringify(await table(host)));
  console.log('cup after race 1 client', JSON.stringify(await table(client)));
  await tap(host, W / 2 - 110, 430); // Weiter
  for (let i = 0; i < 100; i++) {
    const k = await client.evaluate(() => window.chaosCup?.index ?? -1);
    if (k === 1 && !(await client.evaluate(() => window.game.scene.isActive('result')))) break;
    await client.waitForTimeout(200);
  }
  for (let i = 0; i < 600; i++) {
    if (await client.evaluate(() => window.game.scene.isActive('result'))) break;
    await client.waitForTimeout(200);
  }
  await client.waitForTimeout(1500);
  await Promise.all([host.screenshot({ path: `${shots}/host-result-2.png` }), client.screenshot({ path: `${shots}/client-result-2.png` })]);
  console.log('cup after race 2 host  ', JSON.stringify(await table(host)));
  console.log('cup after race 2 client', JSON.stringify(await table(client)));
  await tap(client, W / 2 - 110, 430); // Siegerehrung
  await client.waitForTimeout(3500);
  await client.screenshot({ path: `${shots}/client-podium.png` });
}
await browser.close();
