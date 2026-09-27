import { describe, expect, it } from 'vitest';
import { NAME_MAX, parseClientMsg, parseHostMsg } from '../src/net/validate';
import { isRoomCode, randomRoomCode, ROOM_CODE_LENGTH } from '../src/net/protocol';
import { CHARACTERS } from '../src/meta/characters';

describe('messages from other phones', () => {
  it('drops broken and unknown messages', () => {
    for (const raw of [null, 42, 'hello', [], {}, { t: 'hack' }, { t: 'in', s: -1, j: 1, d: 0 }, { t: 'in', s: 1, j: 2, d: 0 }]) {
      expect(parseClientMsg(raw)).toBeNull();
    }
    expect(parseClientMsg({ t: 'emote', e: 999 })).toBeNull();
    expect(parseClientMsg({ t: 'vote', i: 7 })).toBeNull();
    expect(parseClientMsg({ t: 'again', a: 'boom' })).toBeNull();
    expect(parseClientMsg({ t: 'talk', on: 'yes' })).toBeNull();
    expect(parseClientMsg({ t: 'chat', q: 9999 })).toBeNull();
    expect(parseClientMsg({ t: 'chat', x: '   ' })).toBeNull();
  });

  it('cleans names, characters and texts', () => {
    const hello = parseClientMsg({ t: 'hello', v: 5, name: 'x'.repeat(5000) + '\n<script>', character: '../../evil', cosmetics: { skin: '<img>', outfit: 'fire' } });
    expect(hello).not.toBeNull();
    if (hello?.t !== 'hello') throw new Error();
    expect(hello.name.length).toBe(NAME_MAX);
    expect(hello.character).toBe(CHARACTERS[0].id);
    expect(hello.cosmetics).toEqual({ skin: null, outfit: 'fire' });
    const chat = parseClientMsg({ t: 'chat', x: 'a'.repeat(1000), extra: 'ignored' });
    expect(chat).toEqual({ t: 'chat', x: 'a'.repeat(80) });
    expect(parseClientMsg({ t: 'in', s: 5, j: 1, d: 0, junk: {} })).toEqual({ t: 'in', s: 5, j: 1, d: 0 });
  });

  it('checks the host messages too', () => {
    expect(parseHostMsg({ t: 'nope' })).toBeNull();
    expect(parseHostMsg({ t: 'lobby', players: 'x', playlist: {} })).toBeNull();
    const lobby = parseHostMsg({ t: 'lobby', players: [{ seat: 9, name: 5, character: 'x' }, 'junk'], playlist: { name: 'Z', courses: [] }, racing: false });
    if (lobby?.t !== 'lobby') throw new Error();
    expect(lobby.players).toEqual([{ seat: 0, name: 'Spieler', character: CHARACTERS[0].id, cosmetics: undefined }]);
  });
});

describe('room codes', () => {
  it('are six digits', () => {
    for (let i = 0; i < 200; i++) expect(isRoomCode(randomRoomCode())).toBe(true);
    expect(ROOM_CODE_LENGTH).toBe(6);
    expect(isRoomCode('1234')).toBe(false);
    expect(isRoomCode('12345a')).toBe(false);
  });
});
