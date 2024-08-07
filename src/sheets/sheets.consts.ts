import { Encounter } from '../encounters/encounters.consts.js';

export const SHEETS_CLIENT = '@goolge/sheets-client';

export const PROG_SHEET_STARTING_ROW = 15; // the row where entries start on the prog sheet

// TODO: Should not allow arbitrary index access to return not undefined
// brittle, requires to be in sync with the sheet
export const ProgSheetRanges: Record<string, { start: string; end: string }> = {
  [Encounter.DSR]: {
    start: 'Q',
    end: 'T',
  },
  [Encounter.TEA]: {
    start: 'L',
    end: 'O',
  },
  [Encounter.TOP]: {
    start: 'V',
    end: 'Y',
  },
  [Encounter.UCOB]: {
    start: 'B',
    end: 'E',
  },
  [Encounter.UWU]: {
    start: 'G',
    end: 'J',
  },
};

export function columnToIndex(column: string) {
  let index = 0;
  for (let i = 0; i < column.length; i++) {
    index = index * 26 + column.charCodeAt(i) - 'A'.charCodeAt(0) + 1;
  }
  return index - 1; // Convert to zero-based index
}
