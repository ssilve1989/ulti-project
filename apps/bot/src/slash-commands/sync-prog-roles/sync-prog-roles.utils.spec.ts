import { describe, expect, it } from 'vitest';
import { buildDetailFields } from './sync-prog-roles.utils.js';

/** Change line `n`, 400 characters long: two fit in a 1024-character field. */
const line = (n: number) => `change ${n} `.padEnd(400, '.');
const lines = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => line(from + i));

const field = (name: string, value: string) => ({
  name,
  value,
  inline: false,
});

describe('buildDetailFields', () => {
  it('puts lines that fit in one field', () => {
    expect(buildDetailFields(lines(1, 2))).toEqual([
      field('Changes', lines(1, 2).join('\n')),
    ]);
  });

  it('continues in further fields when lines overflow one', () => {
    expect(buildDetailFields(lines(1, 3))).toEqual([
      field('Changes', lines(1, 2).join('\n')),
      field('Changes (cont.)', line(3)),
    ]);
  });

  it('stops at five fields and counts the lines left out', () => {
    expect(buildDetailFields(lines(1, 12))).toEqual([
      field('Changes', lines(1, 2).join('\n')),
      field('Changes (cont.)', lines(3, 4).join('\n')),
      field('Changes (cont.)', lines(5, 6).join('\n')),
      field('Changes (cont.)', lines(7, 8).join('\n')),
      field('Changes (cont.)', `${lines(9, 10).join('\n')}\n… and 2 more`),
    ]);
  });

  it('adds no field for no changes', () => {
    expect(buildDetailFields([])).toEqual([]);
  });
});
