import type { sheets_v4 } from '@googleapis/sheets';
import { describe, expect, it, vi } from 'vitest';
import { updateSheet } from './sheets.utils.js';

function createClient({
  update,
  append,
}: {
  update?: ReturnType<typeof vi.fn>;
  append?: ReturnType<typeof vi.fn>;
} = {}) {
  return {
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
  } as unknown as sheets_v4.Sheets;
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
