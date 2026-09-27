import type { FlowApp } from '../flow-app.js';

/** The DMU tab of the test spreadsheet. */
export const DMU_TAB_ID = 695983618;

/** The DMU tab's party sections: their columns, and those as zero-based indexes. */
export const PROG_PARTY: Section = Object.freeze({
  start: 'I',
  end: 'L',
  from: 8,
  to: 12,
});
export const CLEAR_PARTY: Section = Object.freeze({
  start: 'C',
  end: 'F',
  from: 2,
  to: 6,
});
export interface Section {
  readonly start: string;
  readonly end: string;
  readonly from: number;
  readonly to: number;
}

/**
 * The row after the last filled one in `section` when the app read it (its
 * `read`-th read): where the app should add a new signup.
 */
export function nextFreeRow(flow: FlowApp, section: Section, read = 0): number {
  const values = flow.sheets.valuesRead(`DMU!${section.start}:${section.end}`)[
    read
  ];
  if (!Array.isArray(values)) {
    throw new Error(
      `The app never read section ${section.start}:${section.end}`,
    );
  }
  return values.length + 1;
}

/** The request clearing `row` of `section` (Sheets indexes are zero-based, end-exclusive). */
export const rowCleared = (flow: FlowApp, section: Section, row: number) => ({
  method: 'POST',
  path: `/v4/spreadsheets/${flow.sheets.spreadsheetId}:batchUpdate`,
  body: {
    requests: [
      {
        updateCells: {
          range: {
            sheetId: DMU_TAB_ID,
            startRowIndex: row - 1,
            endRowIndex: row,
            startColumnIndex: section.from,
            endColumnIndex: section.to,
          },
          fields: 'userEnteredValue',
        },
      },
    ],
  },
});
