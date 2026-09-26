/**
 * Wardrobe items: painted skins (a second look per character, drawn like the characters
 * themselves) and trails. A trail uses the "outfit" slot of the save.
 */
export type CosmeticSlot = 'outfit';

export interface CosmeticDef {
  id: string;
  slot: CosmeticSlot;
  name: string;
  price: number;
}

export const COSMETICS: CosmeticDef[] = [
  { id: 'fart', slot: 'outfit', name: 'Furzwolke', price: 200 },
  { id: 'sparkle', slot: 'outfit', name: 'Glitzerspur', price: 300 },
  { id: 'fire', slot: 'outfit', name: 'Feuerspur', price: 400 },
  { id: 'rainbow', slot: 'outfit', name: 'Regenbogen', price: 600 },
  { id: 'money', slot: 'outfit', name: 'Geldregen', price: 800 },
];

export function cosmeticById(id: string | null | undefined): CosmeticDef | undefined {
  return id ? COSMETICS.find((c) => c.id === id) : undefined;
}

/** A painted second look for one character; its parts live in assets/characters/<id>/. */
export interface SkinDef {
  id: string;
  character: string;
  name: string;
  price: number;
}

export const SKINS: SkinDef[] = [
  { id: 'hase-pleite', character: 'hase', name: 'Pleite-Hoppel', price: 500 },
  { id: 'katze-nachtschicht', character: 'katze', name: 'Nachtschicht-Mocca', price: 500 },
  { id: 'ratte-explosion', character: 'ratte', name: 'Explosions-Zündi', price: 500 },
  { id: 'otter-tiefsee', character: 'otter', name: 'Tiefsee-Otto', price: 600 },
  { id: 'kraehe-disco', character: 'kraehe', name: 'Disco-Vinz', price: 600 },
  { id: 'dachs-bademeister', character: 'dachs', name: 'Bademeister Dax', price: 700 },
  { id: 'maulwurf-rave', character: 'maulwurf', name: 'Rave-Buddel', price: 700 },
  { id: 'chinchilla-gewitter', character: 'chinchilla', name: 'Gewitter-Flausch', price: 800 },
  { id: 'schildkroete-rentner', character: 'schildkroete', name: 'Rentner-Bert', price: 800 },
];

export function skinById(id: string | null | undefined): SkinDef | undefined {
  return id ? SKINS.find((s) => s.id === id) : undefined;
}

/** Coins paid back for hats and glasses, which were taken out of the shop. */
export const RETIRED_PRICES: Record<string, number> = {
  party: 150, beanie: 150, tinfoil: 200, hardhat: 250, cowboy: 300, propeller: 350, halo: 450, crown: 700,
  shades: 150, nerd: 150, eyepatch: 200, hearts: 250, monocle: 300, pixel: 450,
};

/** Particle colours of a trail (outfit slot). */
export const TRAILS: Record<string, { colors: number[]; size: number; rate: number }> = {
  fart: { colors: [0x9ac04a, 0x7aa03a, 0xb8d06a], size: 11, rate: 0.09 },
  sparkle: { colors: [0xffffff, 0xfff2a0, 0xa0e8ff], size: 5, rate: 0.05 },
  fire: { colors: [0xff5a1a, 0xffb21a, 0xffe04a], size: 8, rate: 0.04 },
  rainbow: { colors: [0xff4a4a, 0xffa14a, 0xffe14a, 0x5fd35a, 0x4aa3ff, 0xa06aff], size: 7, rate: 0.03 },
  money: { colors: [0x5fd35a, 0x3fa34d, 0xffd84a], size: 7, rate: 0.06 },
};
