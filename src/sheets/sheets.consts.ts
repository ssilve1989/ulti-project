import { PartyStatus } from '../firebase/models/signup.model.js';

export const SHEETS_CLIENT = '@goolge/sheets-client';

export interface SheetRangeConfig {
  columnStart: string;
  columnEnd: string;
  rowStart: number;
  format: {
    fontSize: number;
    horizontalAlignment: 'LEFT' | 'CENTER' | 'RIGHT';
    fontFamily: string;
    defaultBackgroundColor?: { red: number; green: number; blue: number };
    borders?: {
      left?: { style: 'SOLID' | 'NONE' };
      right?: { style: 'SOLID' | 'NONE' };
    };
  };
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
    format: {
      fontSize: 8,
      horizontalAlignment: 'CENTER',
      fontFamily: 'Arial',
      defaultBackgroundColor: { red: 0.8, green: 0.8, blue: 0.8 }, // #ccc in RGB
      borders: {
        left: { style: 'SOLID' },
        right: { style: 'SOLID' },
      },
    },
  },
  [PartyStatus.ProgParty]: {
    columnStart: 'I',
    columnEnd: 'L',
    rowStart: 9,
    format: {
      fontSize: 8,
      horizontalAlignment: 'CENTER',
      fontFamily: 'Arial',
      defaultBackgroundColor: { red: 0.8, green: 0.8, blue: 0.8 }, // #ccc in RGB
      borders: {
        left: { style: 'SOLID' },
        right: { style: 'SOLID' },
      },
    },
  },
  [PartyStatus.EarlyProgParty]: {
    columnStart: 'I',
    columnEnd: 'L',
    rowStart: 9,
    format: {
      fontSize: 8,
      horizontalAlignment: 'CENTER',
      fontFamily: 'Arial',
    },
  },
};
