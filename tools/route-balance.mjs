// Measures how long each bot personality needs per course when running alone without the chaos
// wall, i.e. the pure speed of the routes they prefer. Keeps the lanes fair (Fun Run balances its
// paths the same way: faster route = riskier, never a free win).
// Usage: node tools/route-balance.mjs [courseId…]
import { createServer } from 'vite';

const only = process.argv.slice(2);
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const L = (p) => vite.ssrLoadModule(p);
const { COURSES } = await L('/src/sim/track/courses.ts');
const { Race } = await L('/src/sim/race.ts');
const { BotBrain, botProfile } = await L('/src/sim/bot.ts');
const NAMES = ['mutig', 'vorsichtig', 'muenzen', 'allround'];
console.log('course'.padEnd(20), NAMES.map((n) => n.padStart(10)).join(''), '  spread');
for (const c of COURSES) {
  if (only.length && !only.includes(c.id)) continue;
  const times = NAMES.map((_, who) => {
    const race = new Race({ seed: c.seed, world: c.world, runnerCount: 1, courseId: c.id, noWall: true });
    const brain = new BotBrain(c.seed + who * 7919, botProfile('hard', who));
    let t = 0;
    while (!race.over && race.runners[0].mode !== 'finished' && t++ < 60 * 150) race.step([{ ...brain.think(race, 0), use: 0 }]);
    return race.runners[0].finishTime;
  });
  const ok = times.filter((t) => t > 0);
  const spread = ok.length ? Math.max(...ok) - Math.min(...ok) : NaN;
  console.log(c.id.padEnd(20), times.map((t) => (t > 0 ? t.toFixed(1) : 'DNF').padStart(10)).join(''), '  ' + spread.toFixed(1));
}
await vite.close();
