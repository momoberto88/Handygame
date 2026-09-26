import type Phaser from 'phaser';

/**
 * Hats, glasses and trails for the wardrobe. Everything is drawn in code (thick outlines like the
 * painted characters), so no extra images are needed. A trail uses the "outfit" slot of the save.
 */
export type CosmeticSlot = 'hat' | 'glasses' | 'outfit';

export interface CosmeticDef {
  id: string;
  slot: CosmeticSlot;
  name: string;
  price: number;
}

export const COSMETICS: CosmeticDef[] = [
  { id: 'party', slot: 'hat', name: 'Partyhut', price: 150 },
  { id: 'beanie', slot: 'hat', name: 'Kiffer-Mütze', price: 150 },
  { id: 'tinfoil', slot: 'hat', name: 'Aluhut', price: 200 },
  { id: 'hardhat', slot: 'hat', name: 'Bauhelm', price: 250 },
  { id: 'cowboy', slot: 'hat', name: 'Cowboyhut', price: 300 },
  { id: 'propeller', slot: 'hat', name: 'Propellermütze', price: 350 },
  { id: 'halo', slot: 'hat', name: 'Heiligenschein', price: 450 },
  { id: 'crown', slot: 'hat', name: 'Protz-Krone', price: 700 },
  { id: 'shades', slot: 'glasses', name: 'Sonnenbrille', price: 150 },
  { id: 'nerd', slot: 'glasses', name: 'Nerdbrille', price: 150 },
  { id: 'eyepatch', slot: 'glasses', name: 'Augenklappe', price: 200 },
  { id: 'hearts', slot: 'glasses', name: 'Herzbrille', price: 250 },
  { id: 'monocle', slot: 'glasses', name: 'Monokel', price: 300 },
  { id: 'pixel', slot: 'glasses', name: 'Deal-with-it-Brille', price: 450 },
  { id: 'fart', slot: 'outfit', name: 'Furzwolke', price: 200 },
  { id: 'sparkle', slot: 'outfit', name: 'Glitzerspur', price: 300 },
  { id: 'fire', slot: 'outfit', name: 'Feuerspur', price: 400 },
  { id: 'rainbow', slot: 'outfit', name: 'Regenbogen', price: 600 },
  { id: 'money', slot: 'outfit', name: 'Geldregen', price: 800 },
];

export function cosmeticById(id: string | null | undefined): CosmeticDef | undefined {
  return id ? COSMETICS.find((c) => c.id === id) : undefined;
}

const INK = 0x1d1a2f;

/** Draws every hat and pair of glasses into a texture once ("cos-<id>"). */
export function makeCosmeticTextures(scene: Phaser.Scene) {
  if (scene.textures.exists('cos-party')) return;
  const g = scene.add.graphics();
  const tex = (id: string, w: number, h: number, draw: () => void) => {
    g.clear();
    draw();
    g.generateTexture(`cos-${id}`, w, h);
  };
  // hats: 80×60, the brim sits at the bottom centre
  tex('party', 80, 60, () => {
    g.fillStyle(0xff5aa8).lineStyle(4, INK).fillTriangle(22, 56, 58, 56, 40, 6).strokeTriangle(22, 56, 58, 56, 40, 6);
    g.fillStyle(0xffe14a).fillCircle(33, 40, 4).fillCircle(45, 28, 4).fillCircle(40, 48, 3);
    g.fillStyle(0x5fd3ff).lineStyle(3, INK).fillCircle(40, 7, 6).strokeCircle(40, 7, 6);
  });
  tex('beanie', 80, 60, () => {
    g.fillStyle(0x3fa34d).lineStyle(4, INK).fillRoundedRect(16, 24, 48, 32, { tl: 24, tr: 24, bl: 4, br: 4 }).strokeRoundedRect(16, 24, 48, 32, { tl: 24, tr: 24, bl: 4, br: 4 });
    g.fillStyle(0xffd84a).fillRect(18, 44, 44, 5);
    g.fillStyle(0xe0463a).fillRect(18, 49, 44, 5);
    // a little leaf on the front
    g.fillStyle(0x9fe36a).lineStyle(2, INK).fillEllipse(40, 34, 10, 14).strokeEllipse(40, 34, 10, 14);
  });
  tex('tinfoil', 80, 60, () => {
    g.fillStyle(0xd8dde6).lineStyle(4, INK);
    g.fillTriangle(14, 56, 66, 56, 42, 4).strokeTriangle(14, 56, 66, 56, 42, 4);
    g.lineStyle(2, 0x8a93a6).lineBetween(30, 50, 40, 16).lineBetween(50, 52, 44, 20).lineBetween(22, 48, 58, 44);
  });
  tex('hardhat', 80, 60, () => {
    g.fillStyle(0xffc21a).lineStyle(4, INK).fillEllipse(40, 40, 50, 40).strokeEllipse(40, 40, 50, 40);
    g.fillStyle(0xffc21a).fillRect(8, 46, 64, 10).lineStyle(4, INK).strokeRect(8, 46, 64, 10);
    g.lineStyle(3, INK).lineBetween(40, 22, 40, 46);
  });
  tex('cowboy', 80, 60, () => {
    g.fillStyle(0x9a5a2a).lineStyle(4, INK);
    g.fillEllipse(40, 50, 76, 14).strokeEllipse(40, 50, 76, 14);
    g.fillRoundedRect(22, 20, 36, 30, 10).strokeRoundedRect(22, 20, 36, 30, 10);
    g.fillStyle(0x3a2010).fillRect(24, 40, 32, 5);
  });
  tex('propeller', 80, 60, () => {
    g.fillStyle(0xe0463a).lineStyle(4, INK).fillEllipse(40, 48, 44, 24).strokeEllipse(40, 48, 44, 24);
    g.fillStyle(0x4aa3ff).fillTriangle(40, 36, 40, 48, 18, 42);
    g.lineStyle(3, INK).lineBetween(40, 36, 40, 18);
    g.fillStyle(0xffd84a).lineStyle(3, INK).fillEllipse(28, 16, 26, 8).strokeEllipse(28, 16, 26, 8).fillEllipse(52, 16, 26, 8).strokeEllipse(52, 16, 26, 8);
  });
  tex('halo', 80, 60, () => {
    g.lineStyle(9, 0xffe98a).strokeEllipse(40, 30, 56, 18);
    g.lineStyle(3, 0xb88a20).strokeEllipse(40, 30, 66, 26);
  });
  tex('crown', 80, 60, () => {
    g.fillStyle(0xffd23a).lineStyle(4, INK);
    const pts = [12, 56, 12, 20, 26, 38, 40, 12, 54, 38, 68, 20, 68, 56];
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath();
    g.fillPath();
    g.strokePath();
    g.fillStyle(0xe0463a).fillCircle(40, 44, 5);
    g.fillStyle(0x4aa3ff).fillCircle(24, 46, 4).fillCircle(56, 46, 4);
  });
  // glasses: 60×30, centred on the eyes (character looks to the right)
  tex('shades', 60, 30, () => {
    g.fillStyle(0x151520).lineStyle(3, INK).fillRoundedRect(6, 8, 22, 14, 5).fillRoundedRect(32, 8, 22, 14, 5);
    g.lineBetween(26, 12, 34, 12);
    g.fillStyle(0xffffff, 0.6).fillRect(10, 11, 6, 3).fillRect(36, 11, 6, 3);
  });
  tex('nerd', 60, 30, () => {
    g.lineStyle(4, INK).strokeRect(6, 7, 20, 16).strokeRect(34, 7, 20, 16).lineBetween(26, 12, 34, 12);
    g.fillStyle(0xffffff, 0.35).fillRect(8, 9, 16, 12).fillRect(36, 9, 16, 12);
  });
  tex('eyepatch', 60, 30, () => {
    g.lineStyle(3, INK).lineBetween(0, 4, 60, 18);
    g.fillStyle(0x151520).lineStyle(3, INK).fillEllipse(40, 15, 20, 16).strokeEllipse(40, 15, 20, 16);
    g.fillStyle(0xffffff).fillCircle(40, 15, 2.5);
  });
  tex('hearts', 60, 30, () => {
    const heart = (x: number) => {
      g.fillStyle(0xff3a78).lineStyle(3, INK);
      g.fillCircle(x - 5, 11, 6).fillCircle(x + 5, 11, 6).fillTriangle(x - 11, 13, x + 11, 13, x, 26);
    };
    heart(16);
    heart(44);
    g.lineStyle(3, INK).lineBetween(26, 12, 34, 12);
  });
  tex('monocle', 60, 30, () => {
    g.lineStyle(4, 0xd8a83a).strokeCircle(42, 14, 10);
    g.fillStyle(0xffffff, 0.3).fillCircle(42, 14, 8);
    g.lineStyle(2, 0xd8a83a).lineBetween(42, 24, 30, 30);
  });
  tex('pixel', 60, 30, () => {
    g.fillStyle(0x111111);
    for (const [x, y, w] of [[2, 8, 56], [6, 12, 20], [34, 12, 20], [8, 16, 16], [36, 16, 16], [10, 20, 8], [38, 20, 8]] as const) g.fillRect(x, y, w, 4);
    g.fillStyle(0xffffff).fillRect(12, 12, 4, 4).fillRect(40, 12, 4, 4);
  });
  g.destroy();
}

/** Particle colours of a trail (outfit slot). */
export const TRAILS: Record<string, { colors: number[]; size: number; rate: number }> = {
  fart: { colors: [0x9ac04a, 0x7aa03a, 0xb8d06a], size: 11, rate: 0.09 },
  sparkle: { colors: [0xffffff, 0xfff2a0, 0xa0e8ff], size: 5, rate: 0.05 },
  fire: { colors: [0xff5a1a, 0xffb21a, 0xffe04a], size: 8, rate: 0.04 },
  rainbow: { colors: [0xff4a4a, 0xffa14a, 0xffe14a, 0x5fd35a, 0x4aa3ff, 0xa06aff], size: 7, rate: 0.03 },
  money: { colors: [0x5fd35a, 0x3fa34d, 0xffd84a], size: 7, rate: 0.06 },
};
