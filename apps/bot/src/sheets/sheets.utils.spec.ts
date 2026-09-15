import type { sheets_v4 } from '@googleapis/sheets';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockOf } from '../test-utils/mock-factory.js';
import { batchUpdateWithRetry, updateSheet } from './sheets.utils.js';

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

const GRID_LIMIT_ERROR = new Error(
  'Range (DMU!I359:L) exceeds grid limits. Max rows: 358, max columns: 42',
);

describe('updateSheet', () => {
  it('grows the sheet by 50 rows and retries when the update range exceeds grid limits', async () => {
    const update = vi
      .fn()
      .mockRejectedValueOnce(GRID_LIMIT_ERROR)
      .mockResolvedValueOnce({ data: { updatedRows: 1 }, status: 200 });
    const client = createClient({ update });

    const result = await updateSheet(client, {
      spreadsheetId: 'sheet-id',
      range: 'DMU!I359:L359',
      type: 'update',
      values: [['Character', 'World', 'Role', '']],
    });

    expect(client.spreadsheets.batchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        spreadsheetId: 'sheet-id',
        requestBody: {
          requests: [
            { appendDimension: { sheetId: 42, dimension: 'ROWS', length: 50 } },
          ],
        },
      }),
      expect.anything(),
    );
    expect(update).toHaveBeenCalledTimes(2);
    expect(result.data).toEqual({ updatedRows: 1 });
  });

  it('grows the sheet and retries when an append range exceeds grid limits', async () => {
    const append = vi
      .fn()
      .mockRejectedValueOnce(GRID_LIMIT_ERROR)
      .mockResolvedValueOnce({ data: { updates: {} }, status: 200 });
    const client = createClient({ append });

    await updateSheet(client, {
      spreadsheetId: 'sheet-id',
      range: 'DMU!I359:L359',
      type: 'append',
      values: [['Character', 'World', 'Role', '']],
    });

    expect(client.spreadsheets.batchUpdate).toHaveBeenCalledTimes(1);
    expect(append).toHaveBeenCalledTimes(2);
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

describe('batchUpdateWithRetry', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('grows the sheet and retries once when the batch update exceeds grid limits', async () => {
    const batchUpdate = vi
      .fn()
      .mockRejectedValueOnce(GRID_LIMIT_ERROR)
      .mockResolvedValueOnce({ data: {}, status: 200 })
      .mockResolvedValueOnce({ data: {}, status: 200 });
    const client = createClient({ batchUpdate });

    const result = await batchUpdateWithRetry(
      client,
      'sheet-id',
      [{ updateCells: { fields: 'userEnteredValue' } }],
      'DMU!A1',
    );

    expect(result).toEqual({ data: {}, status: 200 });
    // original request fails, grow request goes out, original is retried once
    expect(client.spreadsheets.batchUpdate).toHaveBeenCalledTimes(3);
    expect(client.spreadsheets.batchUpdate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        spreadsheetId: 'sheet-id',
        requestBody: {
          requests: [{ updateCells: { fields: 'userEnteredValue' } }],
        },
      }),
      expect.anything(),
    );
    expect(client.spreadsheets.batchUpdate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        spreadsheetId: 'sheet-id',
        requestBody: {
          requests: [
            { appendDimension: { sheetId: 42, dimension: 'ROWS', length: 50 } },
          ],
        },
      }),
      expect.anything(),
    );
    expect(client.spreadsheets.batchUpdate).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        spreadsheetId: 'sheet-id',
        requestBody: {
          requests: [{ updateCells: { fields: 'userEnteredValue' } }],
        },
      }),
      expect.anything(),
    );
  });

  it('retries once on a transient error that resolves on the next attempt', async () => {
    vi.useFakeTimers();

    const transientError = Object.assign(new Error('quota'), {
      code: 429,
      response: { data: { error: { status: 'RESOURCE_EXHAUSTED' } } },
    });
    const batchUpdate = vi
      .fn()
      .mockRejectedValueOnce(transientError)
      .mockResolvedValueOnce({ data: {}, status: 200 });
    const client = createClient({ batchUpdate });

    const result = batchUpdateWithRetry(
      client,
      'sheet-id',
      [{ updateCells: { fields: 'userEnteredValue' } }],
      'DMU!A1',
    );

    await vi.advanceTimersByTimeAsync(1000);

    await expect(result).resolves.toEqual({ data: {}, status: 200 });
    expect(client.spreadsheets.batchUpdate).toHaveBeenCalledTimes(2);
  });

  it('retries transient errors up to the bound and then rethrows', async () => {
    vi.useFakeTimers();

    const transientError = Object.assign(new Error('quota'), {
      code: 503,
      response: { data: { error: { status: 'UNAVAILABLE' } } },
    });
    const batchUpdate = vi.fn().mockRejectedValue(transientError);
    const client = createClient({ batchUpdate });

    const result = batchUpdateWithRetry(
      client,
      'sheet-id',
      [{ updateCells: { fields: 'userEnteredValue' } }],
      'DMU!A1',
    );
    const settled = result.then(
      () => {
        throw new Error('expected the transient retries to be exhausted');
      },
      (error: unknown) => error,
    );

    await vi.advanceTimersByTimeAsync(5000);

    await expect(settled).resolves.toBe(transientError);
    // MAX_TRANSIENT_RETRIES (2) retries on top of the initial attempt
    expect(client.spreadsheets.batchUpdate).toHaveBeenCalledTimes(3);
  });

  it('does not retry permanent errors', async () => {
    const otherError = new Error('some other API failure');
    const batchUpdate = vi.fn().mockRejectedValueOnce(otherError);
    const client = createClient({ batchUpdate });

    await expect(
      batchUpdateWithRetry(
        client,
        'sheet-id',
        [{ updateCells: { fields: 'userEnteredValue' } }],
        'DMU!A1',
      ),
    ).rejects.toThrow('some other API failure');

    expect(client.spreadsheets.batchUpdate).toHaveBeenCalledTimes(1);
    expect(client.spreadsheets.get).not.toHaveBeenCalled();
  });
});
