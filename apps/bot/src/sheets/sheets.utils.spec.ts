import type { sheets_v4 } from '@googleapis/sheets';
import { describe, expect, it, vi } from 'vitest';
import { mockOf } from '#src/test-utils/mock-factory.js';
import {
  batchWrite,
  findRowIndex,
  getSheetIdByName,
  updateSheet,
} from './sheets.utils.js';

function createClient({
  update,
  append,
  batchUpdate,
}: {
  update?: ReturnType<typeof vi.fn>;
  append?: ReturnType<typeof vi.fn>;
  batchUpdate?: ReturnType<typeof vi.fn>;
} = {}) {
  return mockOf<sheets_v4.Sheets>({
    spreadsheets: {
      get: vi.fn().mockResolvedValue({
        data: { sheets: [{ properties: { title: 'DMU', sheetId: 42 } }] },
      }),
      batchUpdate:
        batchUpdate ?? vi.fn().mockResolvedValue({ data: {}, status: 200 }),
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

describe('batchWrite', () => {
  const REQUESTS = Object.freeze([
    Object.freeze({ updateCells: { fields: 'userEnteredValue' } }),
  ]);

  /** What batchWrite sends Google: the requests, with POST opted into the client's retries. */
  const batchWritten = () => [
    {
      spreadsheetId: 'sheet-id',
      requestBody: { requests: REQUESTS.map((request) => ({ ...request })) },
    },
    { timeout: 30_000, retryConfig: { httpMethodsToRetry: ['POST'] } },
  ];

  it('sends every request in one batch update, retrying rate limits and server errors', async () => {
    const client = createClient();

    const result = await batchWrite(
      client,
      'sheet-id',
      REQUESTS.map((request) => ({ ...request })),
      'DMU!I:L',
    );

    expect(vi.mocked(client.spreadsheets.batchUpdate).mock.calls).toEqual([
      batchWritten(),
    ]);
    expect(result).toEqual({ data: {}, status: 200 });
  });

  it('grows the sheet by 50 rows and sends the batch again when it exceeds grid limits', async () => {
    const batchUpdate = vi
      .fn()
      .mockRejectedValueOnce(gridLimitError())
      .mockResolvedValue({ data: { replies: [] }, status: 200 });
    const client = createClient({ batchUpdate });

    const result = await batchWrite(
      client,
      'sheet-id',
      REQUESTS.map((request) => ({ ...request })),
      'DMU!I:L',
    );

    expect(batchUpdate.mock.calls).toEqual([
      batchWritten(),
      [grow(), { timeout: 30_000 }],
      batchWritten(),
    ]);
    expect(result).toEqual({ data: { replies: [] }, status: 200 });
  });

  it('does not swallow unrelated errors', async () => {
    const batchUpdate = vi
      .fn()
      .mockRejectedValueOnce(new Error('some other API failure'));
    const client = createClient({ batchUpdate });

    await expect(
      batchWrite(
        client,
        'sheet-id',
        REQUESTS.map((request) => ({ ...request })),
        'DMU!I:L',
      ),
    ).rejects.toThrow('some other API failure');
    expect(batchUpdate).toHaveBeenCalledTimes(1);
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

describe('findRowIndex', () => {
  const isMe = (cells: Set<string>) => cells.has('me') && cells.has('server');

  it('finds the row whose cells match regardless of case', () => {
    expect(
      findRowIndex(
        [
          ['Other', 'Server'],
          ['ME', 'sErVeR'],
        ],
        isMe,
      ),
    ).toBe(1);
  });

  it('returns the first matching row', () => {
    expect(
      findRowIndex(
        [
          ['Me', 'Server'],
          ['Me', 'Server'],
        ],
        isMe,
      ),
    ).toBe(0);
  });

  it('returns -1 when no row matches', () => {
    expect(findRowIndex([['Other', 'Server']], isMe)).toBe(-1);
  });

  it.each([null, undefined, []])('returns -1 for %j values', (values) => {
    expect(findRowIndex(values, isMe)).toBe(-1);
  });
});
