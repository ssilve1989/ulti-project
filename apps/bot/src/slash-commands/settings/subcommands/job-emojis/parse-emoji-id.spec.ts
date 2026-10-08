import { describe, expect, it } from 'vitest';
import { parseEmojiId } from './parse-emoji-id.js';

describe('parseEmojiId', () => {
  it.each([
    ['<:sge:123456789012345678>', '123456789012345678'],
    ['123456789012345678', '123456789012345678'],
    ['  <:sge:123456789012345678> ', '123456789012345678'],
  ])('reads %s as %s', (input, id) => {
    expect(parseEmojiId(input)).toBe(id);
  });

  it.each(['🙂', 'sge', '<:sge:>', '12', '<a:spin:123456789012345678>'])(
    'rejects %s',
    (input) => {
      expect(parseEmojiId(input)).toBeUndefined();
    },
  );
});
