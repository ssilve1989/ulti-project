import { describe, expect, it } from 'vitest';
import { parseDiscordTime } from './discord-time.js';

describe('parseDiscordTime', () => {
  it.each([
    ['1760000000', 1760000000],
    ['<t:1760000000>', 1760000000],
    ['<t:1760000000:F>', 1760000000],
    [' <t:1760000000:R> ', 1760000000],
  ])('reads %s', (input, seconds) => {
    expect(parseDiscordTime(input)).toEqual(new Date(seconds * 1000));
  });

  it.each(['1760000000000', 'tomorrow', '<t:abc>', '<t:1760000000:Z>', ''])(
    'rejects %s',
    (input) => {
      expect(parseDiscordTime(input)).toBeUndefined();
    },
  );
});
