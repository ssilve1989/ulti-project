import { PartyStatus } from '../firebase/models/signup.model.js';

export const SHEETS_CLIENT = '@goolge/sheets-client';

export interface SheetRangeConfig {
  columnStart: string;
  columnEnd: string;
  rowStart: number;
}

export const SheetRanges: {
  [PartyStatus.ClearParty]: SheetRangeConfig;
  [PartyStatus.ProgParty]: SheetRangeConfig;
  [PartyStatus.EarlyProgParty]: SheetRangeConfig;
} = {
  [PartyStatus.ClearParty]: {
    columnStart: 'C',
    columnEnd: 'F',
    rowStart: 9,
  },
  [PartyStatus.ProgParty]: {
    columnStart: 'I',
    columnEnd: 'L',
    rowStart: 9,
  },
  [PartyStatus.EarlyProgParty]: {
    columnStart: 'I',
    columnEnd: 'L',
    rowStart: 9,
  },
};
