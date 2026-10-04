import type { FlowApp } from '../flow-app.js';

/** The DMU tab of the test spreadsheet. */
const DMU_TAB_ID = 695983618;

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
 * The row after the last filled one in `section` when the app first read it:
 * where the app should add a new signup.
 */
export function nextFreeRow(flow: FlowApp, section: Section): number {
  const [values] = flow.sheets.valuesRead(
    `DMU!${section.start}:${section.end}`,
  );
  if (!Array.isArray(values)) {
    throw new Error(
      `The app never read section ${section.start}:${section.end}`,
    );
  }
  return values.length + 1;
}

/** `row` of `section` as a grid range (Sheets indexes are zero-based, end-exclusive). */
const gridRow = (section: Section, row: number) => ({
  sheetId: DMU_TAB_ID,
  startRowIndex: row - 1,
  endRowIndex: row,
  startColumnIndex: section.from,
  endColumnIndex: section.to,
});

/** One `batchUpdate`, which Sheets applies atomically, made of `requests`. */
export const batchUpdated = (flow: FlowApp, ...requests: object[]) => ({
  method: 'POST',
  path: `/v4/spreadsheets/${flow.sheets.spreadsheetId}:batchUpdate`,
  body: { requests },
});

/** A batch request emptying `row` of `section`. */
export const clearRow = (section: Section, row: number) => ({
  updateCells: { range: gridRow(section, row), fields: 'userEnteredValue' },
});

/** A batch request writing `values` into `row` of `section`, as literal text. */
export const writeRow = (section: Section, row: number, values: string[]) => ({
  updateCells: {
    range: gridRow(section, row),
    rows: [
      {
        values: values.map((value) => ({
          userEnteredValue: { stringValue: value },
        })),
      },
    ],
    fields: 'userEnteredValue',
  },
});

/** The request clearing `row` of `section`, on its own. */
export const rowCleared = (flow: FlowApp, section: Section, row: number) =>
  batchUpdated(flow, clearRow(section, row));
