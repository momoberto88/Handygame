export type EarStyle = 'long' | 'pointy' | 'round' | 'none' | 'frog' | 'feathers' | 'ponytail';
export type TailStyle = 'puff' | 'bushy' | 'ringed' | 'none';
export type HeadStyle = 'round' | 'cap' | 'gnome' | 'mask' | 'wide';

export interface CharacterDef {
  id: string;
  name: string;
  species: string;
  price: number;
  colors: {
    fur: string;
    belly: string;
    accent: string;
    hands: string;
    feet: string;
    outline: string;
  };
  head: HeadStyle;
  ears: EarStyle;
  tail: TailStyle;
  /** Tint of the rival marker / progress bar head. */
  marker: number;
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: 'hase',
    name: 'Hoppel',
    species: 'Hase',
    price: 0,
    colors: { fur: '#d9a066', belly: '#fbe7c6', accent: '#f7a1b5', hands: '#fbe7c6', feet: '#fbe7c6', outline: '#3b2314' },
    head: 'round',
    ears: 'long',
    tail: 'puff',
    marker: 0xd9a066,
  },
  {
    id: 'pilz',
    name: 'Pilzi',
    species: 'Pilzmännchen',
    price: 0,
    colors: { fur: '#f3dfbf', belly: '#fff3dc', accent: '#d8332f', hands: '#f3dfbf', feet: '#8a5a3c', outline: '#3b2314' },
    head: 'cap',
    ears: 'none',
    tail: 'none',
    marker: 0xd8332f,
  },
  {
    id: 'fuchs',
    name: 'Flinki',
    species: 'Fuchs',
    price: 0,
    colors: { fur: '#ef7d2d', belly: '#fff1e0', accent: '#2b1a12', hands: '#2b1a12', feet: '#2b1a12', outline: '#3b1c0c' },
    head: 'round',
    ears: 'pointy',
    tail: 'bushy',
    marker: 0xef7d2d,
  },
  {
    id: 'frosch',
    name: 'Quaki',
    species: 'Frosch',
    price: 400,
    colors: { fur: '#6cc04a', belly: '#e2f5a8', accent: '#f25f7a', hands: '#6cc04a', feet: '#6cc04a', outline: '#1f3d17' },
    head: 'wide',
    ears: 'frog',
    tail: 'none',
    marker: 0x6cc04a,
  },
  {
    id: 'waschbaer',
    name: 'Rocco',
    species: 'Waschbär',
    price: 600,
    colors: { fur: '#8e8e9a', belly: '#e4e4ea', accent: '#2c2c36', hands: '#2c2c36', feet: '#2c2c36', outline: '#1c1c24' },
    head: 'round',
    ears: 'round',
    tail: 'ringed',
    marker: 0x8e8e9a,
  },
  {
    id: 'zwerg',
    name: 'Grumbold',
    species: 'Zwerg',
    price: 800,
    colors: { fur: '#f2c9a0', belly: '#3a6fb0', accent: '#c8302a', hands: '#f2c9a0', feet: '#5a3a22', outline: '#2a1a10' },
    head: 'gnome',
    ears: 'none',
    tail: 'none',
    marker: 0xc8302a,
  },
  {
    id: 'kobold',
    name: 'Tiki',
    species: 'Masken-Kobold',
    price: 1000,
    colors: { fur: '#7a9b3c', belly: '#b08a4f', accent: '#2fb7c4', hands: '#7a9b3c', feet: '#7a9b3c', outline: '#23300f' },
    head: 'mask',
    ears: 'feathers',
    tail: 'none',
    marker: 0x2fb7c4,
  },
  {
    id: 'kriegerin',
    name: 'Kira',
    species: 'Kriegerin',
    price: 1200,
    colors: { fur: '#f0c8a8', belly: '#6b4a8a', accent: '#5a2e1a', hands: '#f0c8a8', feet: '#4a2a18', outline: '#2a160c' },
    head: 'round',
    ears: 'ponytail',
    tail: 'none',
    marker: 0x9b59d0,
  },
];

export function characterById(id: string): CharacterDef {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}
