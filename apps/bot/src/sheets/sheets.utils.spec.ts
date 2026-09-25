import type { sheets_v4 } from '@googleapis/sheets';
import { describe, expect, it, vi } from 'vitest';
import { mockOf } from '../test-utils/mock-factory.js';
import { getSheetIdByName, updateSheet } from './sheets.utils.js';

function createClient({
  update,
  append,
}: {
  update?: ReturnType<typeof vi.fn>;
  append?: ReturnType<typeof vi.fn>;
} = {}) {
  return mockOf<sheets_v4.Sheets>({
    spreadsheets: {
      get: vi.fn().mockResolvedValue({
        data: { sheets: [{ properties: { title: 'DMU', sheetId: 42 } }] },
      }),
      batchUpdate: vi.fn().mockResolvedValue({ data: {}, status: 200 }),
      values: {
        update: update ?? vi.fn().mockResolvedValue({ data: {}, status: 200 }),
        append: append ?? vi.fn().mockResolvedValue({ data: {}, status: 200 }),
      },
    },
  });
}

const VALUES = Object.freeze([
  Object.freeze(['Character', 'World', 'Role', '']),
]);

/** What updateSheet sends Google for DMU!I359:L359. */
const write = () => ({
  spreadsheetId: 'sheet-id',
  range: 'DMU!I359:L359',
  valueInputOption: 'USER_ENTERED',
  requestBody: { values: VALUES.map((row) => [...row]) },
});

/** The request growing the DMU tab by 50 rows. */
const grow = () => ({
  spreadsheetId: 'sheet-id',
  requestBody: {
    requests: [
      { appendDimension: { sheetId: 42, dimension: 'ROWS', length: 50 } },
    ],
  },
});

/** A fresh error per use: production and Sentry may add properties to it. */
const gridLimitError = () =>
  new Error(
    'Range (DMU!I359:L) exceeds grid limits. Max rows: 358, max columns: 42',
  );

describe('updateSheet', () => {
  it('grows the sheet by 50 rows and retries when the update range exceeds grid limits', async () => {
    const update = vi
      .fn()
      .mockRejectedValueOnce(gridLimitError())
      .mockResolvedValueOnce({ data: { updatedRows: 1 }, status: 200 });
    const client = createClient({ update });

    const result = await updateSheet(client, {
      spreadsheetId: 'sheet-id',
      range: 'DMU!I359:L359',
      type: 'update',
      values: VALUES.map((row) => [...row]),
    });

    expect(vi.mocked(client.spreadsheets.batchUpdate).mock.calls).toEqual([
      [grow(), { timeout: 30_000 }],
    ]);
    expect(update.mock.calls).toEqual([
      [write(), undefined],
      [write(), undefined],
    ]);
    expect(result).toEqual({ data: { updatedRows: 1 }, status: 200 });
  });

  it('grows the sheet and retries when an append range exceeds grid limits', async () => {
    const append = vi
      .fn()
      .mockRejectedValueOnce(gridLimitError())
      .mockResolvedValueOnce({ data: { updates: {} }, status: 200 });
    const client = createClient({ append });

    const result = await updateSheet(client, {
      spreadsheetId: 'sheet-id',
      range: 'DMU!I359:L359',
      type: 'append',
      values: VALUES.map((row) => [...row]),
    });

    expect(vi.mocked(client.spreadsheets.batchUpdate).mock.calls).toEqual([
      [grow(), { timeout: 30_000 }],
    ]);
    expect(append.mock.calls).toEqual([
      [write(), undefined],
      [write(), undefined],
    ]);
    expect(result).toEqual({ data: { updates: {} }, status: 200 });
  });

  it('does not swallow unrelated errors', async () => {
    const otherError = new Error('some other API failure');
    const update = vi.fn().mockRejectedValueOnce(otherError);
    const client = createClient({ update });

    await expect(
      updateSheet(client, {
        spreadsheetId: 'sheet-id',
        range: 'DMU!I10:L10',
        type: 'update',
        values: [['Character', 'World', 'Role', '']],
      }),
    ).rejects.toThrow('some other API failure');

    expect(client.spreadsheets.batchUpdate).not.toHaveBeenCalled();
  });
});

describe('getSheetIdByName', () => {
  it("asks Google only for the tabs' ids and titles, not the whole spreadsheet", async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        sheets: [
          { properties: { title: 'TOP', sheetId: 7 } },
          { properties: { title: 'DSR', sheetId: 42 } },
        ],
      },
    });
    const client = mockOf<sheets_v4.Sheets>({ spreadsheets: { get } });

    await expect(
      getSheetIdByName(client, 'spreadsheet-1', 'DSR'),
    ).resolves.toBe(42);
    expect(get).toHaveBeenCalledExactlyOnceWith({
      spreadsheetId: 'spreadsheet-1',
      includeGridData: false,
      fields: 'sheets.properties(sheetId,title)',
    });
  });
});
