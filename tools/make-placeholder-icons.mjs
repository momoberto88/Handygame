// Creates simple app icons until the AI-generated icon replaces them.
import sharp from 'sharp';

const svg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="#1d1a2f"/>
  <circle cx="50" cy="55" r="30" fill="#d9a066" stroke="#3b2314" stroke-width="4"/>
  <ellipse cx="38" cy="20" rx="7" ry="18" fill="#d9a066" stroke="#3b2314" stroke-width="4"/>
  <ellipse cx="60" cy="20" rx="7" ry="18" fill="#d9a066" stroke="#3b2314" stroke-width="4"/>
  <circle cx="58" cy="50" r="6" fill="#fff" stroke="#3b2314" stroke-width="2"/>
  <circle cx="60" cy="50" r="3" fill="#1a1210"/>
  <ellipse cx="68" cy="64" rx="10" ry="7" fill="#fbe7c6"/>
  <path d="M8 88 L30 80 L22 94 Z" fill="#ffd84a"/>
</svg>`;

for (const size of [192, 512]) {
  await sharp(Buffer.from(svg(size))).png().toFile(`public/icons/icon-${size}.png`);
}
console.log('icons written');
