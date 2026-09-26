import type { AbilityKind } from '../sim/types';

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
  ability: AbilityKind;
  /** Catchphrase shown in the menu. */
  quote: string;
}

/** Name and short explanation of every ability (menu, HUD). */
export const ABILITIES: Record<AbilityKind, { name: string; icon: string; text: string }> = {
  megajump: { name: 'Höhenflug', icon: '🌿', text: 'Ein gewaltiger Satz nach oben – sogar mitten in der Luft.' },
  sprint: { name: 'Espresso-Schlag', icon: '☕', text: '1,6 Sekunden Koffein-Turbo.' },
  spores: { name: 'Zündschnur', icon: '🧨', text: 'Knallt hinter dir: Wer dicht dran ist, taumelt kurz.' },
  tongue: { name: 'Blubber-Köder', icon: '🎣', text: 'Angelt dir sofort ein Power-Up.' },
  steal: { name: 'Fluch-Abo', icon: '🪆', text: 'Verflucht den Nächsten vor dir und kassiert sein Power-Up.' },
  quake: { name: 'Stampede', icon: '🐀', text: 'Eine Horde Ratten fegt über den Boden und wirft Gegner aus dem Tritt.' },
  mask: { name: 'Heilquarz', icon: '🔮', text: '2,5 Sekunden lang unverwundbar. Steine heilen, glaub mir!' },
  bash: { name: 'Flausch-Prophezeiung', icon: '☁️', text: 'Wolkenschild plus ein sanfter Schubs nach vorn. „Du wirst weich fallen …“' },
  fireworks: { name: 'Große Bumm-Schau', icon: '🎆', text: 'Feuert eine Feuerwerksrakete auf den Nächsten vor dir.' },
};

export const CHARACTERS: CharacterDef[] = [
  {
    id: 'hase',
    name: 'King Hoppel',
    species: 'Hasenkönig',
    quote: 'Ganz entspannt, ich bin eh gleich vorne.',
    price: 0,
    colors: { fur: '#b98a52', belly: '#e9d2a8', accent: '#e8b53a', hands: '#b98a52', feet: '#b98a52', outline: '#3b2314' },
    head: 'round',
    ears: 'long',
    tail: 'puff',
    marker: 0xe8b53a,
    ability: 'megajump',
  },
  {
    id: 'katze',
    name: 'Mocca',
    species: 'Koffein-Kriegerin',
    quote: 'Morgens, halb zehn in Deutschland!',
    price: 0,
    colors: { fur: '#a8703a', belly: '#e9c9a0', accent: '#7a4a2a', hands: '#8a8f98', feet: '#6a4a2a', outline: '#2a160c' },
    head: 'round',
    ears: 'none',
    tail: 'bushy',
    marker: 0xa8703a,
    ability: 'sprint',
  },
  {
    id: 'ratte',
    name: 'Zündi',
    species: 'Detonations-Ratte',
    quote: 'Geht hoch, meine Kleinen!',
    price: 0,
    colors: { fur: '#8a6440', belly: '#c9a47a', accent: '#d8332f', hands: '#e8a0a0', feet: '#6a4a2a', outline: '#2a160c' },
    head: 'round',
    ears: 'round',
    tail: 'none',
    marker: 0xd8332f,
    ability: 'spores',
  },
  {
    id: 'otter',
    name: 'Doc Otto',
    species: 'Alchemie-Angler',
    quote: 'Gibt es hier auch seltene Substanzen?',
    price: 400,
    colors: { fur: '#6a4428', belly: '#b08a60', accent: '#6b7a3a', hands: '#6b8a3a', feet: '#6b7a3a', outline: '#24140a' },
    head: 'round',
    ears: 'none',
    tail: 'none',
    marker: 0x6bb04a,
    ability: 'tongue',
  },
  {
    id: 'kraehe',
    name: 'Voodoo-Vinz',
    species: 'Fluch-Verkäufer',
    quote: 'Brauchst du Glück? Pech? Beides im Angebot.',
    price: 600,
    colors: { fur: '#23243a', belly: '#4a2a5a', accent: '#8a8a90', hands: '#23243a', feet: '#8a8a90', outline: '#0c0c14' },
    head: 'round',
    ears: 'none',
    tail: 'none',
    marker: 0x7a4ab0,
    ability: 'steal',
  },
  {
    id: 'dachs',
    name: 'Dompteur Dax',
    species: 'Rattenbändiger',
    quote: 'Sitz. Platz. Angriff!',
    price: 800,
    colors: { fur: '#5a5a60', belly: '#e8e8e8', accent: '#1a1a1a', hands: '#1a1a1a', feet: '#4a3020', outline: '#101010' },
    head: 'round',
    ears: 'none',
    tail: 'none',
    marker: 0x9a9aa4,
    ability: 'quake',
  },
  {
    id: 'maulwurf',
    name: 'Bruder Buddel',
    species: 'Geo-Geistlicher',
    quote: 'Steine heilen, glaub mir!',
    price: 1000,
    colors: { fur: '#3a3a44', belly: '#7a5a3a', accent: '#2fd0c4', hands: '#f0a0b0', feet: '#7a5a3a', outline: '#141418' },
    head: 'round',
    ears: 'none',
    tail: 'none',
    marker: 0x2fd0c4,
    ability: 'mask',
  },
  {
    id: 'chinchilla',
    name: 'Madame Flausch',
    species: 'Wolken-Orakel',
    quote: 'Du wirst weich fallen …',
    price: 1200,
    colors: { fur: '#b8bac4', belly: '#e8e8ee', accent: '#a07ad0', hands: '#b8bac4', feet: '#b8bac4', outline: '#2a2a34' },
    head: 'round',
    ears: 'round',
    tail: 'none',
    marker: 0xa07ad0,
    ability: 'bash',
  },
  {
    id: 'schildkroete',
    name: 'Bumm-Bert',
    species: 'Panzer-Pyrotechniker',
    quote: 'Das wird farbenfroh!',
    price: 1500,
    colors: { fur: '#6a8a3a', belly: '#8a6a3a', accent: '#c89a3a', hands: '#6a8a3a', feet: '#6a8a3a', outline: '#1a2410' },
    head: 'round',
    ears: 'none',
    tail: 'none',
    marker: 0xc89a3a,
    ability: 'fireworks',
  },
];

/** Ability of every racer, in racer order (for the race simulation). */
export function abilitiesOf(racers: { character: string }[]): AbilityKind[] {
  return racers.map((r) => characterById(r.character).ability);
}

export function characterById(id: string): CharacterDef {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}
