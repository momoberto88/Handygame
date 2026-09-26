// Cuts AI-generated sprite sheets into separate transparent PNGs.
//
//   node tools/process-art.mjs <sheet.png> <outDir> <name1,name2,...> [--rows=3 --cols=4] [--max=256]
//
// The sheet must have a flat background colour (we use pure magenta). Every connected blob of
// non-background pixels becomes one part; parts are ordered like the grid cells they sit in and
// named in that order ("-" skips a cell). Parts are trimmed, keyed out with soft edges and scaled
// so the longest side is at most --max pixels.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [sheetPath, outDir, namesArg, ...rest] = process.argv.slice(2);
if (!sheetPath || !outDir || !namesArg) {
  console.error('usage: node tools/process-art.mjs <sheet.png> <outDir> <names,comma,separated> [--rows=3 --cols=4 --max=256 --key=ff00ff]');
  process.exit(1);
}
const opt = Object.fromEntries(rest.map((a) => a.replace(/^--/, '').split('=')));
const rows = Number(opt.rows ?? 3);
const cols = Number(opt.cols ?? 4);
const maxSide = Number(opt.max ?? 256);
const keyHex = opt.key ?? 'ff00ff';
const names = namesArg.split(',');
mkdirSync(outDir, { recursive: true });

const { data, info } = await sharp(sheetPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const key = [parseInt(keyHex.slice(0, 2), 16), parseInt(keyHex.slice(2, 4), 16), parseInt(keyHex.slice(4, 6), 16)];

// 1) key out the background: distance to key colour → alpha, and remove magenta spill.
const alpha = new Float32Array(W * H);
for (let i = 0; i < W * H; i++) {
  const r = data[i * 4];
  const g = data[i * 4 + 1];
  const b = data[i * 4 + 2];
  const d = Math.hypot(r - key[0], g - key[1], b - key[2]);
  // Magenta-ish pixels (high red+blue, low green) are background; fade the anti-aliased rim.
  const magentaness = Math.min(r, b) - g;
  let a = 1;
  if (d < 90) a = 0;
  else if (d < 170 && magentaness > 60) a = (d - 90) / 80;
  alpha[i] = a;
  if (a > 0 && a < 1) {
    // despill: pull the colour away from magenta
    const m = Math.min(r, b);
    data[i * 4] = Math.max(0, r - (m - g) * (1 - a));
    data[i * 4 + 2] = Math.max(0, b - (m - g) * (1 - a));
  }
  data[i * 4 + 3] = Math.round(a * 255);
}

// 2) connected components on alpha > 0.5 (8-neighbourhood).
const label = new Int32Array(W * H).fill(-1);
const blobs = [];
const stack = [];
for (let start = 0; start < W * H; start++) {
  if (label[start] !== -1 || alpha[start] <= 0.5) continue;
  const id = blobs.length;
  let minX = W, minY = H, maxX = 0, maxY = 0, count = 0, sx = 0, sy = 0;
  stack.push(start);
  label[start] = id;
  while (stack.length) {
    const p = stack.pop();
    const x = p % W;
    const y = (p - x) / W;
    count++;
    sx += x;
    sy += y;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const q = ny * W + nx;
        if (label[q] === -1 && alpha[q] > 0.5) {
          label[q] = id;
          stack.push(q);
        }
      }
    }
  }
  blobs.push({ id, minX, minY, maxX, maxY, count, cx: sx / count, cy: sy / count });
}

// 3) group blobs by grid cell (small specks join the biggest blob in their cell).
const cellW = W / cols;
const cellH = H / rows;
const cells = new Map();
for (const b of blobs) {
  if (b.count < 40) continue;
  const c = Math.min(cols - 1, Math.floor(b.cx / cellW));
  const r = Math.min(rows - 1, Math.floor(b.cy / cellH));
  const k = r * cols + c;
  if (!cells.has(k)) cells.set(k, []);
  cells.get(k).push(b);
}

const manifest = {};
let nameIndex = 0;
for (let k = 0; k < rows * cols; k++) {
  const group = cells.get(k);
  if (!group) continue;
  const name = names[nameIndex++];
  if (!name || name === '-') continue;
  const main = group.reduce((a, b) => (b.count > a.count ? b : a));
  // include other blobs of the cell that are reasonably big (e.g. separate highlights)
  const members = group.filter((b) => b === main || b.count > main.count * 0.02);
  const minX = Math.max(0, Math.min(...members.map((b) => b.minX)) - 2);
  const minY = Math.max(0, Math.min(...members.map((b) => b.minY)) - 2);
  const maxX = Math.min(W - 1, Math.max(...members.map((b) => b.maxX)) + 2);
  const maxY = Math.min(H - 1, Math.max(...members.map((b) => b.maxY)) + 2);
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const out = Buffer.alloc(w * h * 4);
  const ids = new Set(members.map((b) => b.id));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = (minY + y) * W + (minX + x);
      const dst = (y * w + x) * 4;
      // keep pixels of the part (and its soft rim), drop pixels that belong to other parts
      const l = label[src];
      if (l !== -1 && !ids.has(l)) continue;
      out[dst] = data[src * 4];
      out[dst + 1] = data[src * 4 + 1];
      out[dst + 2] = data[src * 4 + 2];
      out[dst + 3] = data[src * 4 + 3];
    }
  }
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const file = join(outDir, `${name}.png`);
  await sharp(out, { raw: { width: w, height: h, channels: 4 } })
    .resize(Math.round(w * scale), Math.round(h * scale), { kernel: 'lanczos3' })
    .png({ compressionLevel: 9 })
    .toFile(file);
  manifest[name] = { w: Math.round(w * scale), h: Math.round(h * scale), srcW: w, srcH: h };
}
console.log(JSON.stringify({ sheet: `${W}x${H}`, blobs: blobs.filter((b) => b.count >= 40).length, parts: manifest }, null, 1));
