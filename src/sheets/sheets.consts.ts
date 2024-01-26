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
