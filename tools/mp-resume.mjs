// The phone reloads the game while a room is open (e.g. after sharing the invitation in WhatsApp):
// the room must come back with the same code, the friend back in without knocking; back button.
// Needs `npx vite preview --port 4173` and `npx peerjs --port 9000 --host 127.0.0.1` running.
// Usage: node tools/mp-resume.mjs [shotsDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const shots = process.argv[2] ?? 'test-results/mp-resume';
mkdirSync(shots, { recursive: true });
const base = 'http://localhost:4173/?peerhost=127.0.0.1&peerport=9000';
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium' });
const S = 390 / 540;
const W = 844 / S;
async function phone(name, url, nick) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${name}] pageerror: ${e.stack}`));
  await page.goto('http://localhost:4173/?nothing');
  await page.evaluate((n) => localStorage.setItem('chaos-sprint-save-v1', JSON.stringify({ tutorialDone: true, name: n })), nick);
  await page.goto(url);
  await page.waitForTimeout(1500);
  return page;
}
const until = async (page, fn, ms = 20000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await page.evaluate(fn).catch(() => false)) return true;
    await page.waitForTimeout(250);
  }
  return false;
};
const info = (p) => p.evaluate(() => ({ code: window.chaosRoom?.code ?? null, players: window.chaosRoom?.players.map((x) => x.name) ?? [], requests: window.chaosRoom?.requests?.length ?? 0 }));

const host = await phone('host', base, 'Momo');
await host.mouse.click(W * 0.7 * S, 320 * S);
await host.waitForTimeout(400);
await host.mouse.click((W / 2) * S, 230 * S);
await until(host, () => !!window.chaosRoom?.code);
const code = (await info(host)).code;
const client = await phone('client', `${base}&raum=${code}`, 'Kumpel');
await until(host, () => { window.chaosRoom?.requests[0]?.admit(true); return (window.chaosRoom?.players.length ?? 0) >= 2; });
console.log('room', code, 'players', (await info(host)).players);

// 1) the host's phone reloads the game (back from WhatsApp)
await host.reload();
const reopened = await until(host, () => window.chaosRoom?.code && (window.chaosRoom?.players.length ?? 0) >= 2, 45000);
const h = await info(host);
console.log('host reloaded -> same code:', h.code === code, '| friend back in by himself:', reopened, h.players, '| knocking:', h.requests);
await host.screenshot({ path: `${shots}/1-host-after-reload.png` });
await client.screenshot({ path: `${shots}/2-client-after-host-reload.png` });

// 2) the friend's phone reloads
await client.reload();
const back = await until(client, () => (window.chaosRoom?.mySeat ?? -1) >= 1, 30000);
console.log('friend reloaded -> back in without knocking:', back, (await info(host)).players, '| knocking:', (await info(host)).requests);

// 3) back button in the lobby
await host.goBack().catch(() => {});
await host.waitForTimeout(800);
console.log('back button -> still in the room:', (await info(host)).code === code);
console.log('ok:', h.code === code && reopened && back && (await info(host)).code === code);
await browser.close();
