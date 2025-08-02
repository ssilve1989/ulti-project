import { describe, expect, it } from 'vitest';
import { columnToIndex } from './sheets.utils.js';

describe('#columnToIndex', () => {
  it('should convert an alphabetic column to an index', () => {
    const columns = ['A', 'Z', 'AA'];
    const results = columns.map(columnToIndex);

    expect(results).toEqual([0, 25, 26]);
  });
});
