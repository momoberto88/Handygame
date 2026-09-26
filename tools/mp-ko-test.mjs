// Two phones play a full K.-o. cup; prints who is out and whether each phone spectates.
import { chromium } from 'playwright';
const shots = process.argv[2];
const url = 'http://localhost:4173/?peerhost=127.0.0.1&peerport=9000&autoplay';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const S = 390 / 540; const W = 844 / S;
async function phone(name) {
  const page = await (await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true })).newPage();
  page.on('pageerror', (e) => console.log(`[${name}] pageerror: ${e.message}`));
  await page.goto(url); await page.waitForTimeout(1200); return page;
}
const tap = (p, x, y) => p.mouse.click(x * S, y * S);
const host = await phone('host'); const client = await phone('client');
await tap(host, W * 0.7, 320); await host.waitForTimeout(400); await tap(host, W / 2, 230);
let code = null; for (let i = 0; i < 40 && !code; i++) { await host.waitForTimeout(250); code = await host.evaluate(() => window.chaosRoom?.code ?? null); }
await tap(client, W * 0.7, 320); await client.waitForTimeout(400); await tap(client, W / 2, 316); await client.waitForTimeout(300);
for (const d of code) { const k = ['1','2','3','4','5','6','7','8','9','⌫','0','OK'].indexOf(d); await tap(client, W * 0.72 + ((k % 3) - 1) * 84, 120 + Math.floor(k / 3) * 76); await client.waitForTimeout(120); }
await tap(client, W * 0.3, 290);
for (let i = 0; i < 40; i++) { await host.waitForTimeout(250); if ((await host.evaluate(() => window.chaosRoom?.players.length ?? 0)) >= 2) break; }
await host.evaluate(() => { window.chaosRoom.playlist = { name: 'K.-o.-Cup', courses: ['lianen-lauf', 'zahnrad-express', 'wolkenhuepfer'], ko: true }; window.chaosRoom.broadcastLobby(); });
await host.waitForTimeout(500);
await tap(host, W / 2 + 150, 380);
const info = (p) => p.evaluate(() => { const s = window.game.scene.getScene('race')?.session; return s && { n: s.race.runners.length, spect: !!s.spectator, course: s.race.courseId, over: s.race.over }; });
for (let race = 1; race <= 3; race++) {
  await host.waitForTimeout(3000);
  console.log(`race ${race} host`, JSON.stringify(await info(host)), 'client', JSON.stringify(await info(client)));
  for (let i = 0; i < 700; i++) { if (await client.evaluate(() => window.game.scene.isActive('result'))) break; await client.waitForTimeout(200); }
  await host.waitForTimeout(1500);
  const out = (p) => p.evaluate(() => JSON.stringify(window.chaosCup?.out));
  console.log(`  out host ${await out(host)} client ${await out(client)}`);
  await Promise.all([host.screenshot({ path: `${shots}/ko-host-${race}.png` }), client.screenshot({ path: `${shots}/ko-client-${race}.png` })]);
  if (race < 3) { await tap(host, W / 2 - 110, 430); }
}
await tap(client, W / 2 - 110, 430); await client.waitForTimeout(3000);
await client.screenshot({ path: `${shots}/ko-client-podium.png` });
await browser.close();
