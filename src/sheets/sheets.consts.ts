import { Encounter } from '../app.consts.js';

export const SHEETS_CLIENT = '@goolge/sheets-client';

// brittle, requires to be in sync with the sheet
export const ProgSheetRanges = {
  [Encounter.DSR]: {
    start: 'N',
    end: 'P',
  },
  [Encounter.TEA]: {
    start: 'J',
    end: 'L',
  },
  [Encounter.TOP]: {
    start: 'R',
    end: 'T',
  },
  [Encounter.UCOB]: {
    start: 'B',
    end: 'D',
  },
  [Encounter.UWU]: {
    start: 'F',
    end: 'H',
  },
};

export function columnToIndex(column: string) {
  let index = 0;
  for (let i = 0; i < column.length; i++) {
    index = index * 26 + column.charCodeAt(i) - 'A'.charCodeAt(0) + 1;
  }
  return index - 1; // Convert to zero-based index
}
