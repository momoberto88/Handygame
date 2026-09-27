import { rude } from './lines';

/** Quick-chat phrases; `rude` ones only show up with "Derb: an". Only ever append (ids are indices). */
export const CHAT_LINES: { text: string; rude?: boolean }[] = [
  { text: 'Noch eine Runde?' },
  { text: 'Revanche!' },
  { text: 'GG' },
  { text: 'Glückwunsch!' },
  { text: 'Warte, bin gleich da' },
  { text: 'Hol mir kurz was' },
  { text: 'Du Cheater!' },
  { text: 'Das war knapp!' },
  { text: 'Hahaha 😂' },
  { text: 'Bereit?' },
  { text: 'Los geht’s!' },
  { text: 'Muss los 👋' },
  { text: 'Revanche, du Lappen!', rude: true },
  { text: 'Das war Glück, du Arsch', rude: true },
  { text: 'Heul leise 😭', rude: true },
  { text: 'Hol mir kurz ein Bier 🍺', rude: true },
  { text: 'Scheiß Säge!', rude: true },
  { text: 'Deine Mutter fährt besser', rude: true },
  { text: 'Fick dich – nochmal!', rude: true },
  { text: 'Du Opfer 😂', rude: true },
];

/** Phrases to offer (their ids), depending on the rude setting. */
export function chatChoices(): number[] {
  const r = rude();
  return CHAT_LINES.map((l, i) => (!l.rude || r ? i : -1)).filter((i) => i >= 0);
}

export const CHAT_MAX = 80;

/** Free text as it may be sent: one line, no control characters, at most CHAT_MAX characters. */
export function cleanChat(text: string): string {
  return text
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CHAT_MAX);
}

/** The text of a chat message (a phrase id or free text). */
export function chatText(q: number | undefined, x: string | undefined): string {
  if (q !== undefined) return CHAT_LINES[q]?.text ?? '';
  return cleanChat(x ?? '');
}
