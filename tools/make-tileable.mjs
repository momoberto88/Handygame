// Makes an image repeat seamlessly by cross-fading its edges.
//   node tools/make-tileable.mjs in.png out.png [--x] [--y] [--blend=0.18] [--width=1024] [--height=540]
// --x: seamless left/right, --y: seamless top/bottom. Optionally resizes first.
import sharp from 'sharp';

const [input, output, ...rest] = process.argv.slice(2);
const opt = Object.fromEntries(rest.map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const blend = Number(opt.blend ?? 0.18);

let img = sharp(input).ensureAlpha();
if (opt.width || opt.height) {
  img = img.resize(opt.width ? Number(opt.width) : null, opt.height ? Number(opt.height) : null, { fit: 'fill' });
}
if (opt.crop) {
  const [l, t, w, h] = String(opt.crop).split(',').map(Number);
  img = sharp(await img.png().toBuffer()).extract({ left: l, top: t, width: w, height: h });
}
const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const out = Buffer.from(data);

function mix(axis) {
  const n = axis === 'x' ? W : H;
  const band = Math.round(n * blend);
  // The first `band` pixels are blended with the pixels just beyond the far edge, then the far
  // band is dropped so the result wraps around smoothly.
  const newN = n - band;
  const res = Buffer.alloc((axis === 'x' ? newN * H : W * newN) * 4);
  const w2 = axis === 'x' ? newN : W;
  const h2 = axis === 'x' ? H : newN;
  for (let y = 0; y < h2; y++) {
    for (let x = 0; x < w2; x++) {
      const i = axis === 'x' ? x : y;
      const src = (y * W + x) * 4;
      const dst = (y * w2 + x) * 4;
      if (i < band) {
        const t = i / band; // 0 at the seam → use the far side, 1 → use this side
        const far = axis === 'x' ? (y * W + (x + newN)) * 4 : ((y + newN) * W + x) * 4;
        for (let c = 0; c < 4; c++) res[dst + c] = Math.round(out[src + c] * t + out[far + c] * (1 - t));
      } else {
        for (let c = 0; c < 4; c++) res[dst + c] = out[src + c];
      }
    }
  }
  return { res, w2, h2 };
}

let buf = out;
let w = W;
let h = H;
if (opt.x) {
  const r = mix('x');
  buf = r.res;
  w = r.w2;
  h = r.h2;
}
if (opt.y) {
  // re-run on the new buffer
  const tmp = await sharp(buf, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  const again = await sharp(tmp).raw().toBuffer({ resolveWithObject: true });
  const band = Math.round(h * blend);
  const newH = h - band;
  const res = Buffer.alloc(w * newH * 4);
  for (let y = 0; y < newH; y++) {
    for (let x = 0; x < w; x++) {
      const src = (y * w + x) * 4;
      const dst = src;
      if (y < band) {
        const t = y / band;
        const far = ((y + newH) * w + x) * 4;
        for (let c = 0; c < 4; c++) res[dst + c] = Math.round(again.data[src + c] * t + again.data[far + c] * (1 - t));
      } else for (let c = 0; c < 4; c++) res[dst + c] = again.data[src + c];
    }
  }
  buf = res;
  h = newH;
}
let final = sharp(buf, { raw: { width: w, height: h, channels: 4 } });
if (opt.outw) final = final.resize(Number(opt.outw), opt.outh ? Number(opt.outh) : null, { fit: 'fill' });
if (output.endsWith('.jpg')) await final.jpeg({ quality: 84 }).toFile(output);
else await final.png({ compressionLevel: 9 }).toFile(output);
console.log(`${output}: ${w}x${h}`);
