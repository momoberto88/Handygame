import { describe, expect, it } from 'vitest';
import { CHAT_LINES, CHAT_MAX, chatText, cleanChat } from '../src/meta/chat';

describe('chat', () => {
  it('free text becomes one short clean line', () => {
    expect(cleanChat('  hallo\n\tdu  Lappen  ')).toBe('hallo du Lappen');
    expect(cleanChat('x'.repeat(200)).length).toBe(CHAT_MAX);
    expect(cleanChat('   ')).toBe('');
  });

  it('phrases are sent as numbers, free text as text', () => {
    expect(chatText(1, undefined)).toBe(CHAT_LINES[1].text);
    expect(chatText(undefined, ' GG\u0007 ')).toBe('GG');
    expect(chatText(999, undefined)).toBe('');
  });
});
