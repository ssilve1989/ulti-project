import { Encounter } from '../../encounters/encounters.consts.js';

export const TURBP_PROG_SHEET_STARTING_ROW = 4;

export const TurboProgSheetRanges = {
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
