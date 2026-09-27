// Invitation link + "again?" vote with two phones.
// Needs `npx vite preview --port 4173` and `npx peerjs --port 9000 --host 127.0.0.1` running.
// Usage: node tools/mp-again.mjs [shotsDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const shots = process.argv[2] ?? 'test-results/mp-again';
mkdirSync(shots, { recursive: true });
const base = 'http://localhost:4173/?peerhost=127.0.0.1&peerport=9000&autoplay';
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium' });
const S = 390 / 540;
const W = 844 / S;
const tap = (page, x, y) => page.mouse.click(x * S, y * S);
async function phone(name, url) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${name}] pageerror: ${e.stack}`));
  await page.goto('http://localhost:4173/?nothing');
  await page.evaluate(() => localStorage.setItem('chaos-sprint-save-v1', JSON.stringify({ tutorialDone: true, name: 'P' + Math.floor(Math.random() * 90 + 10) })));
  await page.goto(url);
  await page.waitForTimeout(1500);
  return page;
}
const until = async (page, fn, ms = 20000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await page.evaluate(fn)) return true;
    await page.waitForTimeout(250);
  }
  return false;
};
const active = (page) => page.evaluate(() => window.game.scene.getScenes(true).map((s) => s.scene.key).join(','));

const host = await phone('host', base);
await tap(host, W * 0.7, 320); // Mit Freunden
await host.waitForTimeout(400);
await tap(host, W / 2, 230); // Raum erstellen
await until(host, () => !!window.chaosRoom?.code);
const code = await host.evaluate(() => window.chaosRoom.code);
console.log('room', code);
await host.waitForTimeout(400);
await host.screenshot({ path: `${shots}/1-host-lobby.png` });

// the friend opens the invitation link
const client = await phone('client', `${base}&raum=${code}`);
const joined = await until(host, () => { window.chaosRoom?.requests[0]?.admit(true); return (window.chaosRoom?.players.length ?? 0) >= 2; });
console.log('joined via link:', joined, '| client url cleaned:', !(await client.evaluate(() => location.search.includes('raum='))));
await client.screenshot({ path: `${shots}/2-client-lobby.png` });

// a short race
await host.evaluate(() => {
  window.chaosRoom.playlist = { name: 'Test', courses: ['wolkenhuepfer'] };
  window.chaosRoom.broadcastLobby();
});
await host.waitForTimeout(400);
await tap(host, W / 2 + 150, 380); // Rennen starten
const inResult = async () => (await until(host, () => window.game.scene.isActive('result'), 180000)) && (await until(client, () => window.game.scene.isActive('result'), 20000));
console.log('race 1 finished:', await inResult());
await host.waitForTimeout(1500);
await host.screenshot({ path: `${shots}/3-host-result.png` });

// both say "again": the next race starts by itself
await client.evaluate(() => window.chaosRoom.sendAgain('again'));
await host.waitForTimeout(600);
await host.screenshot({ path: `${shots}/4-host-one-yes.png` });
await host.evaluate(() => window.chaosRoom.sendAgain('again'));
await host.waitForTimeout(1500);
await client.screenshot({ path: `${shots}/5-client-countdown.png` });
const restarted = (await until(host, () => window.game.scene.isActive('race') && !window.game.scene.isActive('result'), 12000)) && (await until(client, () => window.game.scene.isActive('race'), 8000));
console.log('race 2 started by itself:', restarted, '|', await active(host), '|', await active(client));

// after race 2 the client wants a new cup: everybody goes to the lobby
console.log('race 2 finished:', await inResult());
await client.evaluate(() => window.chaosRoom.sendAgain('cup'));
const lobby = (await until(host, () => window.game.scene.isActive('lobby'), 8000)) && (await until(client, () => window.game.scene.isActive('lobby'), 8000));
console.log('both in lobby after "new cup":', lobby);
await client.screenshot({ path: `${shots}/6-client-lobby-again.png` });
await browser.close();
