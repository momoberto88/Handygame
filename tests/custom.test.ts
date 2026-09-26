import { describe, expect, it } from 'vitest';
import { checkTrack } from '../src/sim/track/check';
import { courseById } from '../src/sim/track/courses';
import { customId, decodeTrack, encodeTrack, type CustomTrack } from '../src/sim/track/customTrack';
import { generateTrack } from '../src/sim/track/generator';

const track: CustomTrack = {
  name: 'Mein Mix ü',
  world: 'neon',
  pieces: [
    { world: 'jungle', name: 'canopy', dy: 0 },
    { world: 'mine', name: 'rails', dy: 2 },
    { world: 'sky', name: 'islands', dy: -3 },
    { world: 'desert', name: 'dunes', dy: -1 },
  ],
};

describe('editor tracks', () => {
  it('survive the round trip through a short code', () => {
    const code = encodeTrack(track);
    expect(code.length).toBeLessThan(40);
    expect(decodeTrack(code)).toEqual(track);
  });

  it('reject broken codes', () => {
    expect(decodeTrack('')).toBeNull();
    expect(decodeTrack('9AAA~x')).toBeNull();
    expect(decodeTrack('1A!!~x')).toBeNull();
  });

  it('build like a course, with their own heights and art world', () => {
    const id = customId(track);
    const course = courseById(id);
    expect(course.name).toBe('Mein Mix ü');
    const t = generateTrack({ seed: 1, world: 'jungle', courseId: id });
    expect(t.world).toBe('neon');
    expect(t.chunks.map((c) => c.name)).toEqual(['start', 'canopy', 'rails', 'islands', 'dunes', 'finish']);
    expect(generateTrack({ seed: 2, world: 'jungle', courseId: id }).tiles).toEqual(t.tiles);
  });

  it('the bot check passes a normal track', () => {
    const res = checkTrack(customId(track));
    expect(res.ok, JSON.stringify(res)).toBe(true);
  }, 60000);
});
