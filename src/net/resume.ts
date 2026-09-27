import type { Playlist } from './protocol';

/**
 * Phones like to reload a page that was in the background (e.g. while you share the invitation
 * in WhatsApp), and the back button can close the whole app. The open room is remembered here, so
 * after such a restart the game opens the same room again (same code, so the link still works)
 * and friends who were already in get back in without knocking.
 */

const ROOM_KEY = 'rr-room';
const PLAYER_KEY = 'rr-player-key';
/** A remembered room is only reopened within this time. */
const FRESH_MS = 15 * 60 * 1000;

export interface SavedRoom {
  role: 'host' | 'client';
  code: string;
  /** Last time the room was known to be open (ms). */
  at: number;
  /** Host: player keys of everybody who was let in. */
  known?: string[];
  /** Host: the chosen courses. */
  playlist?: Playlist;
}

export function saveRoom(room: SavedRoom) {
  try {
    localStorage.setItem(ROOM_KEY, JSON.stringify(room));
  } catch {
    // private mode: no resuming, everything else works
  }
}

/** The room that was open when the game was closed, if it was recently. */
export function loadRoom(): SavedRoom | null {
  try {
    const raw = localStorage.getItem(ROOM_KEY);
    if (!raw) return null;
    const room = JSON.parse(raw) as SavedRoom;
    if (!room || (room.role !== 'host' && room.role !== 'client') || typeof room.code !== 'string') return null;
    if (!(Date.now() - room.at < FRESH_MS)) return null;
    return room;
  } catch {
    return null;
  }
}

/** Left on purpose: don't reopen it. */
export function forgetRoom() {
  try {
    localStorage.removeItem(ROOM_KEY);
  } catch {
    // ignore
  }
}

/** A random id of this phone, so a host recognises a friend who comes back after a restart. */
export function playerKey(): string {
  try {
    let key = localStorage.getItem(PLAYER_KEY);
    if (!key || !/^[a-z0-9]{16,40}$/.test(key)) {
      key = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(PLAYER_KEY, key);
    }
    return key;
  } catch {
    return '';
  }
}
