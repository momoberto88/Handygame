// Draws an overview map of every fixed course (seen from the side, squeezed) with the routes
// four bots with different personalities actually ran. Handy for judging a layout without playing.
// Usage: node tools/course-map.mjs [outDir] [courseId…]
import { createServer } from 'vite';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const outDir = process.argv[2] ?? 'test-results/course-maps';
const only = process.argv.slice(3);
mkdirSync(outDir, { recursive: true });

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const load = (p) => vite.ssrLoadModule(p);
const { COURSES } = await load('/src/sim/track/courses.ts');
const { Race } = await load('/src/sim/race.ts');
const { BotBrain, botProfile } = await load('/src/sim/bot.ts');
const { Tile } = await load('/src/sim/types.ts');
const { TILE, DT } = await load('/src/sim/constants.ts');

const PX = 5; // pixels per tile
const BANDS = 3;
const ROUTES = [
  { name: 'Mutig (oben)', color: '#e8322a' },
  { name: 'Vorsichtig (unten)', color: '#2a7de8' },
  { name: 'Münzsammler', color: '#f2b705' },
  { name: 'Allrounder', color: '#2fb84a' },
];
const SKY = {
  jungle: '#cfe9c4', mine: '#d9c8b4', sky: '#cfe6fb', neon: '#d6cdf0',
  water: '#bfe3ea', pirates: '#f3e1c2', desert: '#f6e3b5', shroom: '#e4d3ef',
};

function drawCourse(course) {
  const race = new Race({ seed: course.seed, world: course.world, runnerCount: 4, courseId: course.id });
  const t = race.track;
  const brains = [0, 1, 2, 3].map((i) => new BotBrain(course.seed + i * 7919, botProfile('hard', i)));
  const trails = [[], [], [], []];
  let tick = 0;
  while (!race.over && tick < 60 * 150) {
    race.step(race.runners.map((_, i) => brains[i].think(race, i)));
    if (tick % 4 === 0) race.runners.forEach((r, i) => r.mode === 'run' && trails[i].push([r.x, r.y - 12]));
    tick++;
  }
  const times = race.runners.map((r) => (r.finishTime > 0 ? r.finishTime.toFixed(1) + ' s' : '–'));

  const bandCols = Math.ceil(t.cols / BANDS);
  const bandH = t.rows * PX;
  const head = 64;
  const gap = 18;
  const W = bandCols * PX + 20;
  const H = head + BANDS * (bandH + gap) + 30;
  const s = (v) => (v / TILE) * PX; // world px → map px
  const parts = [];
  parts.push(`<rect width="${W}" height="${H}" fill="#fffdf6"/>`);
  parts.push(
    `<text x="10" y="28" font-family="sans-serif" font-size="22" font-weight="bold">${course.name}</text>` +
      `<text x="10" y="50" font-family="sans-serif" font-size="13">Welt: ${course.world} · Schwierigkeit: ${'★'.repeat(course.difficulty)} · Länge: ${t.cols} Kacheln</text>`,
  );
  let lx = W - 4 * 170;
  ROUTES.forEach((r, i) => {
    parts.push(`<rect x="${lx}" y="16" width="16" height="6" fill="${r.color}"/><text x="${lx + 22}" y="24" font-family="sans-serif" font-size="12">${r.name}: ${times[i]}</text>`);
    lx += 170;
  });

  for (let b = 0; b < BANDS; b++) {
    const c0 = b * bandCols;
    const c1 = Math.min(t.cols, c0 + bandCols);
    const oy = head + b * (bandH + gap);
    const g = [];
    const X = (px) => 10 + s(px) - c0 * PX;
    g.push(`<rect x="10" y="${oy}" width="${(c1 - c0) * PX}" height="${bandH}" fill="${SKY[course.world]}"/>`);
    for (const z of t.zones) {
      if (s(z.x1) < c0 * PX || s(z.x0) > c1 * PX) continue;
      const fill = z.kind === 'water' ? 'rgba(40,120,220,0.3)' : 'rgba(255,255,255,0.6)';
      g.push(`<rect x="${X(z.x0)}" y="${oy + s(z.y0)}" width="${s(z.x1 - z.x0)}" height="${s(z.y1 - z.y0)}" fill="${fill}"/>`);
    }
    for (let row = 0; row < t.rows; row++) {
      for (let col = c0; col < c1; col++) {
        const v = t.tiles[row * t.cols + col];
        if (v === Tile.Empty) continue;
        const x = 10 + (col - c0) * PX;
        const y = oy + row * PX;
        if (v === Tile.Platform) g.push(`<rect x="${x}" y="${y}" width="${PX}" height="2" fill="#8a5a2b"/>`);
        else if (v === Tile.SlopeUp) g.push(`<polygon points="${x},${y + PX} ${x + PX},${y} ${x + PX},${y + PX}" fill="#6b4a2e"/>`);
        else if (v === Tile.SlopeDown) g.push(`<polygon points="${x},${y} ${x + PX},${y + PX} ${x},${y + PX}" fill="#6b4a2e"/>`);
        else {
          const fill = { [Tile.Spikes]: '#d11', [Tile.ConveyorFwd]: '#2b6fd6', [Tile.ConveyorBack]: '#7a3bd6', [Tile.Mud]: '#5d5a1d', [Tile.Crumble]: '#e08a2c' }[v] ?? '#6b4a2e';
          g.push(`<rect x="${x}" y="${y}" width="${PX}" height="${PX}" fill="${fill}"/>`);
        }
      }
    }
    const inBand = (px) => s(px) >= c0 * PX - 4 && s(px) <= c1 * PX + 4;
    for (const m of t.movers) if (inBand(m.x)) g.push(`<rect x="${X(m.x - m.w / 2)}" y="${oy + s(m.y)}" width="${s(m.w)}" height="2.5" fill="#555"/>`);
    for (const l of t.lasers) if (inBand(l.x)) g.push(`<line x1="${X(l.x)}" y1="${oy + s(l.y0)}" x2="${X(l.x)}" y2="${oy + s(l.y1)}" stroke="#e01fd0" stroke-width="2"/>`);
    for (const sw of t.saws) if (inBand(sw.x)) g.push(`<circle cx="${X(sw.x)}" cy="${oy + s(sw.y)}" r="3" fill="#999" stroke="#d11"/>`);
    for (const cr of t.crushers) if (inBand(cr.x)) g.push(`<rect x="${X(cr.x) - 3}" y="${oy + s(cr.anchorY)}" width="6" height="${s(cr.drop)}" fill="rgba(80,80,80,0.5)"/>`);
    for (const c of t.cannons) if (inBand(c.x)) g.push(`<circle cx="${X(c.x)}" cy="${oy + s(c.y)}" r="3.5" fill="#111"/>`);
    for (const p of t.pads) if (inBand(p.x)) g.push(`<rect x="${X(p.x) - 3}" y="${oy + s(p.y) - 2}" width="6" height="2" fill="${p.kind === 'boost' ? '#f90' : '#1c1'}"/>`);
    for (const bx of t.boxes) if (inBand(bx.x)) g.push(`<rect x="${X(bx.x) - 3}" y="${oy + s(bx.y) - 3}" width="6" height="6" fill="#3c3" stroke="#060" stroke-width="0.8"/>`);
    for (const cn of t.coins) if (inBand(cn.x)) g.push(`<circle cx="${X(cn.x)}" cy="${oy + s(cn.y)}" r="1" fill="#d9a400"/>`);
    trails.forEach((tr, i) => {
      let d = '';
      let prev = null;
      for (const [x, y] of tr) {
        if (!inBand(x)) { prev = null; continue; }
        const jump = prev && (Math.abs(prev[0] - x) > 200 || Math.abs(prev[1] - y) > 200);
        d += `${!prev || jump ? 'M' : 'L'}${X(x).toFixed(1)},${(oy + s(y) + (i - 1.5) * 0.8).toFixed(1)} `;
        prev = [x, y];
      }
      if (d) g.push(`<path d="${d}" fill="none" stroke="${ROUTES[i].color}" stroke-width="1.6" stroke-opacity="0.9"/>`);
    });
    const fx = t.finishX;
    if (inBand(fx)) g.push(`<line x1="${X(fx)}" y1="${oy}" x2="${X(fx)}" y2="${oy + bandH}" stroke="#000" stroke-dasharray="4 3" stroke-width="2"/>`);
    parts.push(`<g>${g.join('')}</g>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${parts.join('')}</svg>`;
  return { svg, times };
}

for (const course of COURSES) {
  if (only.length && !only.includes(course.id)) continue;
  const { svg, times } = drawCourse(course);
  await sharp(Buffer.from(svg), { density: 144 }).png().toFile(`${outDir}/${course.id}.png`);
  console.log(course.id.padEnd(20), times.join('  '));
}
await vite.close();
