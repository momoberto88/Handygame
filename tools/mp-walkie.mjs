// Walkie-talkie between two phones in the lobby (fake microphone that beeps).
// Needs `npx vite preview --port 4173` and `npx peerjs --port 9000 --host 127.0.0.1` running.
// Usage: node tools/mp-walkie.mjs [shotsDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const shots = process.argv[2] ?? 'test-results/mp-walkie';
mkdirSync(shots, { recursive: true });
const base = 'http://localhost:4173/?peerhost=127.0.0.1&peerport=9000';
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium',
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});
const S = 390 / 540;
const W = 844 / S;
const at = (x, y) => [x * S, y * S];
async function phone(name, url, nick) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true, permissions: ['microphone'] });
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
await host.mouse.click(...at(W * 0.7, 320));
await host.waitForTimeout(400);
await host.mouse.click(...at(W / 2, 230));
await until(host, () => !!window.chaosRoom?.code);
const code = await host.evaluate(() => window.chaosRoom.code);
const client = await phone('client', `${base}&raum=${code}`, 'Kumpel');
await until(host, () => (window.chaosRoom?.players.length ?? 0) >= 2);
await until(client, () => (window.chaosRoom?.peers.length ?? 0) >= 2);

// client holds 🎙️ (left of 💬)
await client.mouse.move(...at(W - 36 - 50, 34));
await client.mouse.down();
const heard = await until(host, () => window.chaosRoom.talking.has(1));
console.log('host sees client talking:', heard);
await host.waitForTimeout(2500);
const bytes = await host.evaluate(() => window.chaosWalkie.bytesIn());
console.log('host received audio bytes:', bytes);
await host.screenshot({ path: `${shots}/1-host-hears.png` });
await client.screenshot({ path: `${shots}/2-client-talks.png` });
await client.mouse.up();
const stopped = await until(host, () => !window.chaosRoom.talking.has(1));
console.log('talking label gone after letting go:', stopped);

// and back: host talks, client hears
await host.mouse.move(...at(W - 36 - 50, 34));
await host.mouse.down();
await until(client, () => window.chaosRoom.talking.has(0));
await client.waitForTimeout(2500);
console.log('client received audio bytes:', await client.evaluate(() => window.chaosWalkie.bytesIn()));
await host.mouse.up();

// during a race: the button sits next to 💬 in the HUD
await host.mouse.click(530, 275); // "Rennen starten!"
await until(client, () => window.chaosRoom.racing, 10000);
await client.waitForTimeout(6000);
const before = await host.evaluate(() => window.chaosWalkie.bytesIn());
const micOffBetween = await client.evaluate(() => !window.chaosWalkie.mic);
await client.mouse.move(...at(W - 222 - 50, 30));
await client.mouse.down();
const raceHeard = await until(host, () => window.chaosRoom.talking.has(1));
await host.waitForTimeout(2500);
const after = await host.evaluate(() => window.chaosWalkie.bytesIn());
console.log('mic fully off between presses:', micOffBetween, '· second press sends again:', after - before, 'bytes');
await host.screenshot({ path: `${shots}/3-host-race.png` });
await client.screenshot({ path: `${shots}/4-client-race.png` });
await client.mouse.up();
console.log('race: host sees client talking:', raceHeard);
console.log('ok:', heard && bytes > 1000 && stopped && raceHeard && micOffBetween && after - before > 1000);
await browser.close();
