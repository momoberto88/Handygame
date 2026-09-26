import type { DeathKind } from '../sim/types';
import { loadSave } from './save';

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

export function goLine(): string {
  if (!rude()) return 'LOS!';
  return pick(['LOS!', 'LOS, IHR PFEIFEN!', 'RENNT, IHR SÄCKE!', 'LOS, VERDAMMT!', 'ABFAHRT!']);
}

/** Big toast when you cross the finish line. */
export function finishLine(place: number): string {
  if (!rude()) return place === 1 ? 'SIEG!' : `${place}. Platz!`;
  return [
    pick(['SIEG, BITCHES!', 'ERSTER! FUCK YEAH!', 'SIEG! Weint leise.']),
    pick(['2. – erster Verlierer.', '2. Platz. Knapp daneben ist auch vorbei.']),
    pick(['3. Platz. Naja.', '3. – immerhin nicht Letzter.']),
    pick(['Letzter. Peinlich, Digga.', 'Letzter. Die Bots lachen dich aus.']),
  ][Math.min(place, 4) - 1];
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

// --- character trash talk (speech bubbles over the runners) ------------------------------

interface Talk {
  /** When using the character ability. */
  ability: readonly string[];
  /** When dying. */
  death: readonly string[];
  /** When winning the race. */
  win: readonly string[];
}

const TALK: Record<string, Talk> = {
  hase: {
    ability: ['Hoch wie ich, Baby!', 'Chill mal, Digga.', 'Das Kraut gibt Flügel.'],
    death: ['Sorry, war high.', 'Scheiße, wo bin ich?', 'Mein Königreich für ’nen Snack.'],
    win: ['Ganz entspannt. Hab ich doch gesagt.', 'Der König hat gesprochen. Oder gelallt.'],
  },
  katze: {
    ability: ['NEUN ESPRESSO, FICK DICH!', 'Koffein > Talent.', 'Zu langsam, Schlafmütze!'],
    death: ['Verdammt, mein Becher!', 'Ich brauch mehr Kaffee. Und ’ne Waffe.', 'Fuck. Einfach nur fuck.'],
    win: ['Morgens halb zehn und du bist Letzter.', 'Wach sein ist ein Vorteil, du Penner.'],
  },
  ratte: {
    ability: ['BOOM, Bitch!', 'Geht hoch, meine Kleinen!', 'Hoppla, Lunte!'],
    death: ['Scheiße, falsches Kabel!', 'Upsi. Das war ein Körperteil.', 'Hab mich selbst gezündet. Klassiker.'],
    win: ['Alles in die Luft, nur ich nicht!', 'Wer zuletzt explodiert, gewinnt.'],
  },
  otter: {
    ability: ['Probier mal. Schmeckt nach Tod.', 'Frisch aus dem Labor, Baby.', 'Nicht legal, aber geil.'],
    death: ['Shit, die Dosis war zu hoch.', 'Nebenwirkungen: sterben.', 'Das war nicht das Gegengift.'],
    win: ['Chemie, du Opfer!', 'Doping? Nennen wir es Wissenschaft.'],
  },
  kraehe: {
    ability: ['Deine Mutter lutscht Schwänze in der Hölle!', 'Verflucht! Gegen Aufpreis doppelt.', 'Dein Pech ist mein Geschäftsmodell.'],
    death: ['Wer hat mich verflucht?! Ich will Provision!', 'Verdammter Mist, Rabattaktion vorbei.'],
    win: ['Glück kann man kaufen. Bei mir.', 'Eure Seelen gehören jetzt mir. AGB lesen!'],
  },
  dachs: {
    ability: ['Fass, ihr kleinen Scheißer!', 'Sitz. Platz. Verrecke.', 'Meine Ratten haben Tollwut. Viel Spaß.'],
    death: ['Böse Ratten! Kein Käse heute!', 'Verdammte Viecher, ihr solltet DIE beißen!'],
    win: ['Applaus für die Ratten. Und für mich.', 'Dressur ist alles, ihr Amateure.'],
  },
  maulwurf: {
    ability: ['Der Herr vergibt. Ich nicht.', 'Steine heilen. Dich nicht.', 'Unverwundbar durch Quarz, Bitch!'],
    death: ['Amen, Arschloch.', 'Der Stein war wohl gefälscht.', 'Scheiße, falsches Chakra.'],
    win: ['Gesegnet sei mein Vorsprung.', 'Gott ist mit mir. Ihr seid mit euch.'],
  },
  chinchilla: {
    ability: ['Das Orakel sagt: Fuck you.', 'Du wirst weich fallen. Oder auch nicht.', 'Die Sterne lügen nie, du Lappen.'],
    death: ['Das hab ich nicht kommen sehen. Peinlich.', 'Meine Kristallkugel ist kaputt, verdammt!'],
    win: ['Ich sah es voraus, Schätzchen.', 'Die Karten sagen: Ihr seid Opfer.'],
  },
  schildkroete: {
    ability: ['DAS WIRD FARBENFROH!', 'Feuerwerk ist Kunst, du Banause!', 'Ohren zu, Arsch auf!'],
    death: ['Oh shit, zu früh gezündet.', 'Panzer hilft auch nicht gegen alles.', 'Meine Augenbrauen! Schon wieder!'],
    win: ['Langsam? Ich? Fick dich, Hase!', 'Das große Finale, Baby!'],
  },
};

export type TalkMoment = keyof Talk;

/** A trash-talk line of a character, or null when rude lines are off. */
export function talk(character: string, moment: TalkMoment): string | null {
  if (!rude()) return null;
  const t = TALK[character];
  return t ? pick(t[moment]) : null;
}
