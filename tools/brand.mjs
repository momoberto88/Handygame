// Cuts the title logo and the app-icon emblem out of the designer images in tools/raw/brand/.
// Light, unsaturated background connected to the image border becomes transparent (flood fill).
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

mkdirSync('public/assets/brand', { recursive: true });

async function cutOut(src, crop, out, { width, blank = [], fill = null, seeds = [] } = {}) {
  const { data, info } = await sharp(src).extract(crop).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  for (const [x0, y0, x1, y1] of blank) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * W + x) * 4; data[i] = data[i + 1] = data[i + 2] = 235; }
  const isBg = (i) => {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    return max > 175 && max - min < 34;
  };
  const seen = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
  for (const [x, y] of seeds) stack.push(y * W + x); // enclosed background pockets
  while (stack.length) {
    const p = stack.pop();
    if (seen[p] || !isBg(p * 4)) continue;
    seen[p] = 1;
    const x = p % W, y = (p / W) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < W - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - W);
    if (y < H - 1) stack.push(p + W);
  }
  // soft edge: background pixels next to the artwork get partial alpha
  for (let p = 0; p < W * H; p++) {
    if (!seen[p]) continue;
    const x = p % W, y = (p / W) | 0;
    let near = 0;
    for (const q of [p - 1, p + 1, p - W, p + W]) if (q >= 0 && q < W * H && !seen[q] && Math.abs((q % W) - x) <= 1) near++;
    if (fill) { data[p * 4] = fill[0]; data[p * 4 + 1] = fill[1]; data[p * 4 + 2] = fill[2]; data[p * 4 + 3] = 255; }
    else data[p * 4 + 3] = near ? 110 : 0;
  }
  let img = sharp(data, { raw: { width: W, height: H, channels: 4 } }).png();
  if (width) img = sharp(await img.toBuffer()).resize(width);
  await img.toFile(out);
}

// Title "Runaway Rivals" (the screws of the glass plaque are painted over first)
await cutOut('tools/raw/brand/title-src.jpg', { left: 150, top: 150, width: 1150, height: 690 }, 'public/assets/brand/title.png', {
  width: 900,
  blank: [[0, 0, 90, 110], [1045, 0, 1150, 110]],
  seeds: [[575, 200], [470, 215], [690, 215]],
});
// Emblem as the app icon: square crop, background turned dark purple
const emblem = { left: 118, top: 278, width: 1000, height: 1000 };
await cutOut('tools/raw/brand/emblem-src.jpg', emblem, 'tools/raw/brand/emblem-dark.png', { fill: [42, 24, 52] });
for (const size of [192, 512]) await sharp('tools/raw/brand/emblem-dark.png').resize(size, size).toFile(`public/icons/icon-${size}.png`);
await sharp('tools/raw/brand/emblem-dark.png').resize(180, 180).toFile('public/icons/apple-touch-icon.png');
// emblem with transparent surroundings for the menu / loading screen
await cutOut('tools/raw/brand/emblem-src.jpg', emblem, 'public/assets/brand/emblem.png', { width: 400 });
console.log('done');
