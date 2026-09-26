import type { DeathKind } from '../sim/types';
import { loadSave } from './save';
import voiceLines from './voice-lines.json';

/**
 * All the trash talk of Runaway Rivals. The game looks cute on purpose; the texts are the dirty
 * contrast. With the "derbe Sprüche" setting off, the clean texts are used instead.
 */

const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

export function rude(): boolean {
  return loadSave().settings.rude !== false;
}

/** Toast when your own runner dies. */
const DEATH: Record<DeathKind, readonly string[]> = {
  squash: ['Platt wie deine Witze.', 'Pfannkuchen-Style. Fuck.', 'Zermatscht. Shit happens.', 'Jetzt bist du ein Bierdeckel.'],
  slice: ['Zwei Hälften, null Würde.', 'Au, verdammte Scheiße!', 'Das wächst nicht mehr nach.', 'Sauber filetiert, du Wurst.'],
  zap: ['Gegrillt. Riecht nach Hähnchen.', 'Frisur im Arsch!', 'Tja, Strom kostet.', 'Durchgebrutzelt, Digga.'],
  trap: ['Reingetreten wie ein Vollidiot.', 'Scheißfalle!', 'Fuß ab, Laune auch.', 'Wer guckt, ist klar im Vorteil.'],
  boom: ['BUMM. Das war dein Arsch.', 'Einmal Konfetti aus dir, bitte.', 'Fuck, war das eine Rakete?', 'In Einzelteilen. Schon wieder.'],
  spike: ['Aufgespießt wie ein Schaschlik.', 'Stacheln 1, du 0.', 'Autsch, direkt in die Kronjuwelen.', 'Das piekst, du Pflaume.'],
  fall: ['Tschüss, du Flachpfeife!', 'Schwerkraft 1, Hirn 0.', 'Damn, das war tief.', 'Guter Sprung. Nur halt ins Nichts.'],
};
export function deathLine(kind: DeathKind): string | null {
  return rude() ? pick(DEATH[kind]) : null;
}

export function swallowedLine(): string {
  if (!rude()) return 'Vom Chaos verschluckt!';
  return pick(['Vom Chaos gefressen und wieder ausgekotzt.', 'Zu langsam, du Schnecke!', 'Das Chaos hat dich gefickt.', 'Hinten ist scheiße, oder?']);
}

export function stunnedLine(): string {
  if (!rude()) return 'Benommen!';
  return pick(['Benommen. Wie Montagmorgen.', 'Wat? Wo? Scheiße!', 'Sterne sehen, ganz ohne Drogen.', 'Kopf kaputt, Beine auch.']);
}

export function shieldLine(): string {
  if (!rude()) return 'Schild hält!';
  return pick(['Schild hält – ätsch!', 'Abgeprallt, du Pfeife!', 'Nice try, Arschgeige.']);
}

export function stoleLine(from: string): string {
  return rude() ? pick([`Geklaut von ${from}. Danke, Opfer!`, `${from} ist jetzt ärmer. Hehe.`]) : `Geklaut von ${from}!`;
}

export function robbedLine(by: string): string {
  return rude() ? pick([`${by} hat dein Power-Up geklaut, der Bastard!`, `${by} klaut wie ein Rabe. Scheiße!`]) : `${by} hat dein Power-Up geklaut!`;
}

export function goLine(): Line {
  if (!rude()) return { text: 'LOS!', clip: '' };
  return announce('go')!;
}

/** Big toast when you cross the finish line. */
export function finishLine(place: number): Line {
  if (!rude()) return { text: place === 1 ? 'SIEG!' : `${place}. Platz!`, clip: '' };
  return announce(`place${Math.min(place, 4)}`)!;
}

/** Title of the result board. */
export function resultTitle(place: number): string {
  if (!rude()) return place === 1 ? 'SIEG!' : 'SIEGERTAFEL';
  return ['SIEG, BITCHES!', 'ERSTER VERLIERER', 'BRONZE, IMMERHIN', 'LETZTER, DU LAPPEN'][Math.min(place, 4) - 1] ?? 'SIEGERTAFEL';
}

/** A dry comment under the result board, by place and deaths. */
export function resultComment(place: number, deaths: number): string {
  if (!rude()) return '';
  if (deaths >= 6) return pick([`${deaths} Tode. Bist du betrunken?`, `${deaths}× gestorben. Neuer Rekord an Dummheit.`]);
  if (place === 1) return pick(['Die anderen dürfen jetzt heulen.', 'Zu geil für diese Welt.', 'Ehrenrunde? Nee, Bier.']);
  if (place === 4) return pick(['Deine Mutter wäre enttäuscht. Schon wieder.', 'Sogar die Chaos-Wand hat Mitleid.', 'Nächstes Mal einfach nach rechts laufen.']);
  if (deaths === 0) return 'Nicht einmal gestorben. Respekt, du Streber.';
  return pick(['Geht so. Wie dein Liebesleben.', 'Mittelmaß ist auch ein Platz.', 'Da war mehr drin, du Nudel.']);
}

/** Line under the cup title at the award ceremony. */
export function podiumLine(place: number): string {
  if (!rude()) return place === 1 ? 'Du hast den Cup gewonnen!' : place > 0 ? `Du bist ${place}. im Cup` : 'Siegerehrung';
  if (place === 1) return pick(['Cup gewonnen! Der Rest kann nach Hause gehen.', 'Champion! Die anderen dürfen dir die Füße küssen.']);
  if (place === 2) return 'Zweiter im Cup. So nah dran, so scheiße.';
  if (place === 3) return 'Dritter. Für ein Foto reicht’s.';
  if (place === 4) return 'Letzter im ganzen Cup. Respekt vor so viel Talentlosigkeit.';
  return 'Siegerehrung';
}

// --- character trash talk and the announcer (texts + recorded voices) ---------------------

type Moment = 'ability' | 'death' | 'win' | 'hit' | 'pass' | 'passed' | 'swallowed' | 'stunned' | 'start';
const TALK = (voiceLines as unknown as { talk: Record<string, Record<Moment, string[]>> }).talk;
const ANNOUNCER = (voiceLines as unknown as { announcer: Record<string, string[]> }).announcer;

export type TalkMoment = Moment;

export interface Line {
  text: string;
  /** Recorded voice clip (public/assets/audio/…, without .mp3). */
  clip: string;
}

/** A trash-talk line of a character, or null when rude lines are off. */
export function talk(character: string, moment: TalkMoment): Line | null {
  if (!rude()) return null;
  const list = TALK[character]?.[moment];
  if (!list?.length) return null;
  const i = Math.floor(Math.random() * list.length);
  return { text: list[i], clip: `voice/${character}/${moment}-${i}` };
}

/** A line of the announcer (key as in voice-lines.json, e.g. "go", "place1", "lead"). */
export function announce(key: string): Line | null {
  // family mode: the announcer only counts down
  if (!rude() && !key.startsWith('count')) return null;
  const list = ANNOUNCER[key];
  if (!list?.length) return null;
  const i = Math.floor(Math.random() * list.length);
  return { text: list[i], clip: `voice/announcer/${key}-${i}` };
}
