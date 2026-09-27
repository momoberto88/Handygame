import { cleanChat, CHAT_LINES } from '../meta/chat';
import { CHARACTERS } from '../meta/characters';
import { EMOTES } from '../meta/emotes';
import type { AgainAnswer, ClientMsg, HostMsg } from './protocol';

/**
 * Everything that arrives from another phone is checked before the game touches it: a phone
 * running a changed copy of the game must not be able to crash or break the others.
 */

export const NAME_MAX = 16;
const ANSWERS: AgainAnswer[] = ['again', 'cup', 'wait', 'leave'];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const isBit = (v: unknown): v is 0 | 1 => v === 0 || v === 1;

/** A player name as others may see it: one short, clean line. */
export function cleanName(v: unknown): string {
  const name = typeof v === 'string' ? cleanChat(v).slice(0, NAME_MAX) : '';
  return name || 'Spieler';
}

function cleanCharacter(v: unknown): string {
  return typeof v === 'string' && CHARACTERS.some((c) => c.id === v) ? v : CHARACTERS[0].id;
}

function cleanCosmetics(v: unknown): { skin?: string | null; outfit: string | null } | undefined {
  if (!isObj(v)) return undefined;
  const id = (x: unknown) => (typeof x === 'string' && /^[a-z0-9-]{1,32}$/.test(x) ? x : null);
  return { skin: id(v.skin), outfit: id(v.outfit) };
}

/** A message from a guest to the host, cleaned up, or null when it is broken or unknown. */
export function parseClientMsg(raw: unknown): ClientMsg | null {
  if (!isObj(raw) || typeof raw.t !== 'string') return null;
  switch (raw.t) {
    case 'hello':
      if (!Number.isInteger(raw.v)) return null;
      return {
        t: 'hello',
        v: raw.v as number,
        name: cleanName(raw.name),
        character: cleanCharacter(raw.character),
        cosmetics: cleanCosmetics(raw.cosmetics),
        k: typeof raw.k === 'string' && /^[a-z0-9]{16,40}$/.test(raw.k) ? raw.k : undefined,
      };
    case 'profile':
      return { t: 'profile', name: cleanName(raw.name), character: cleanCharacter(raw.character), cosmetics: cleanCosmetics(raw.cosmetics) };
    case 'in':
      return isInt(raw.s, 0, 2 ** 31) && isBit(raw.j) && isBit(raw.d) ? { t: 'in', s: raw.s, j: raw.j, d: raw.d } : null;
    case 'use':
      return raw.dir === 1 || raw.dir === -1 ? { t: 'use', dir: raw.dir } : null;
    case 'ab':
      return { t: 'ab' };
    case 'emote':
      return isInt(raw.e, 0, EMOTES.length - 1) ? { t: 'emote', e: raw.e } : null;
    case 'vote':
      return isInt(raw.i, 0, 2) ? { t: 'vote', i: raw.i } : null;
    case 'again':
      return ANSWERS.includes(raw.a as AgainAnswer) ? { t: 'again', a: raw.a as AgainAnswer } : null;
    case 'chat': {
      if (raw.q !== undefined) return isInt(raw.q, 0, CHAT_LINES.length - 1) ? { t: 'chat', q: raw.q } : null;
      const x = typeof raw.x === 'string' ? cleanChat(raw.x) : '';
      return x ? { t: 'chat', x } : null;
    }
    case 'talk':
      return typeof raw.on === 'boolean' ? { t: 'talk', on: raw.on } : null;
    default:
      return null;
  }
}

const HOST_TYPES = new Set(['welcome', 'reject', 'wait', 'lobby', 'toLobby', 'chat', 'talk', 'start', 'emote', 'snap']);

/**
 * A message from the host: only the outer shape is checked here (snapshots come 20 times a
 * second); names and texts are cleaned where they are shown, and handling errors are caught.
 */
export function parseHostMsg(raw: unknown): HostMsg | null {
  if (!isObj(raw) || typeof raw.t !== 'string' || !HOST_TYPES.has(raw.t)) return null;
  if (raw.t === 'lobby') {
    if (!Array.isArray(raw.players) || !isObj(raw.playlist)) return null;
    raw.players = (raw.players as unknown[]).filter(isObj).slice(0, 4).map((p) => ({
      seat: isInt(p.seat, 0, 3) ? p.seat : 0,
      name: cleanName(p.name),
      character: cleanCharacter(p.character),
      cosmetics: cleanCosmetics(p.cosmetics),
    }));
    if (raw.peers !== undefined && !Array.isArray(raw.peers)) delete raw.peers;
  }
  if (raw.t === 'reject' && typeof raw.reason !== 'string') raw.reason = 'Der Raum hat abgelehnt.';
  if (raw.t === 'reject') raw.reason = cleanChat(raw.reason as string).slice(0, 120);
  return raw as unknown as HostMsg;
}
