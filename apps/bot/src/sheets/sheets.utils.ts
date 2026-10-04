import { type MethodOptions, sheets_v4 } from '@googleapis/sheets';
import * as Sentry from '@sentry/nestjs';

type GetSheetValuesProps = {
  spreadsheetId: string;
  range: string;
};

type FindCharacterRowProps<T = unknown> = GetSheetValuesProps & {
  predicate: (values: Set<T>) => boolean;
};

type SheetValues = string[][] | null | undefined;

type UpdateSheetProps = {
  values: string[][];
  type: 'update' | 'append';
} & GetSheetValuesProps;

/**
 * Portable subset of the Gaxios response returned by the Sheets client.
 * Declaration emit (composite project) can't name the inferred
 * `GaxiosResponseWithHTTP2` type from the transitive `googleapis-common`
 * package (TS2883), so the exported helpers annotate with this instead.
 */
type SheetsResponse<T> = { data: T; status: number };

const GRID_LIMIT_EXCEEDED_PATTERN = /exceeds grid limits/i;
const ROWS_TO_ADD_ON_GRID_LIMIT = 50;

function isGridLimitExceededError(error: unknown): boolean {
  return (
    Error.isError(error) && GRID_LIMIT_EXCEEDED_PATTERN.test(error.message)
  );
}

/**
 * `values.update`/`values.append` reject any range past the sheet's current
 * row count instead of growing it, so a full signup sheet throws
 * "exceeds grid limits" rather than writing the row.
 */
async function growSheetRows(
  client: sheets_v4.Sheets,
  spreadsheetId: string,
  range: string,
): Promise<void> {
  const sheetName = range.split('!')[0];
  const sheetId = await getSheetIdByName(client, spreadsheetId, sheetName);

  if (sheetId == null) {
    return;
  }

  await batchUpdate(client, spreadsheetId, [
    {
      appendDimension: {
        sheetId,
        dimension: 'ROWS',
        length: ROWS_TO_ADD_ON_GRID_LIMIT,
      },
    },
  ]);
}

/** Sends a write, and when it exceeds the sheet's grid limits, grows the sheet once and sends it again. */
async function growingRowsIfFull<T>(
  client: sheets_v4.Sheets,
  spreadsheetId: string,
  range: string,
  send: () => Promise<T>,
): Promise<T> {
  try {
    return await send();
  } catch (error) {
    if (!isGridLimitExceededError(error)) {
      throw error;
    }

    await growSheetRows(client, spreadsheetId, range);
    return send();
  }
}

/**
 * Gets the row values of a given sheet and range
 * @param client
 * @param param1
 * @returns
 */
export async function getSheetValues(
  client: sheets_v4.Sheets,
  { range, spreadsheetId }: GetSheetValuesProps,
): Promise<SheetValues> {
  const response = await client.spreadsheets.values.get(
    {
      spreadsheetId,
      range,
    },
    { timeout: 30_000 },
  );

  return response.data.values;
}

/**
 * Gets the row values of several ranges of one spreadsheet in a single request
 * @param client
 * @param param1
 * @returns the values of each range, in the order the ranges were given
 */
export async function getSheetValuesBatch(
  client: sheets_v4.Sheets,
  { ranges, spreadsheetId }: { spreadsheetId: string; ranges: string[] },
): Promise<SheetValues[]> {
  const response = await client.spreadsheets.values.batchGet(
    {
      spreadsheetId,
      ranges,
    },
    { timeout: 30_000 },
  );

  return ranges.map((_, index) => response.data.valueRanges?.[index]?.values);
}

/**
 * Updates a given sheet with the provided values
 * @param client
 * @param props
 * @returns
 */
export function updateSheet(
  client: sheets_v4.Sheets,
  { spreadsheetId, type, values, range }: UpdateSheetProps,
  options?: MethodOptions,
): Promise<
  SheetsResponse<
    | sheets_v4.Schema$UpdateValuesResponse
    | sheets_v4.Schema$AppendValuesResponse
  >
> {
  const payload = {
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: values,
    },
  };

  const sendRequest = () =>
    type === 'update'
      ? client.spreadsheets.values.update(payload, options)
      : client.spreadsheets.values.append(payload, options);

  return growingRowsIfFull(client, spreadsheetId, range, sendRequest);
}

export function batchUpdate(
  client: sheets_v4.Sheets,
  spreadsheetId: string,
  requests: sheets_v4.Schema$Request[],
  options: MethodOptions = { timeout: 30_000 },
): Promise<SheetsResponse<sheets_v4.Schema$BatchUpdateSpreadsheetResponse>> {
  return client.spreadsheets.batchUpdate(
    {
      spreadsheetId,
      requestBody: {
        requests,
      },
    },
    options,
  );
}

/**
 * Sends `requests` as one `batchUpdate`, which Google applies atomically: all
 * of them or none. Grows the sheet when they exceed its grid limits.
 *
 * The client only retries rate limits and server errors for idempotent HTTP
 * methods, and `batchUpdate` is a POST. Its cell writes target fixed
 * coordinates, so resending them is safe, and this opts POST into those
 * retries.
 * @param range an A1 range on the tab the requests write to, to grow it if needed
 */
export function batchWrite(
  client: sheets_v4.Sheets,
  spreadsheetId: string,
  requests: sheets_v4.Schema$Request[],
  range: string,
): Promise<SheetsResponse<sheets_v4.Schema$BatchUpdateSpreadsheetResponse>> {
  return growingRowsIfFull(client, spreadsheetId, range, () =>
    batchUpdate(client, spreadsheetId, requests, {
      timeout: 30_000,
      retryConfig: { httpMethodsToRetry: ['POST'] },
    }),
  );
}

/**
 * Finds the first row whose lowercased cells satisfy the predicate
 * @param values the sheet values to search
 * @param predicate a function that determines if a character is found in the given set of values
 * @returns the row index or -1 if not found
 */
export function findRowIndex(
  values: SheetValues,
  predicate: (values: Set<string>) => boolean,
): number {
  if (!values) {
    return -1;
  }

  return values.findIndex((row) =>
    predicate(new Set(row.map((cell) => cell.toLowerCase()))),
  );
}

/**
 * Finds the row index of a character in a given sheet
 * @param client
 * @param param1
 * @returns The rowIndex if found along with the sheetValues found on the spreadsheet
 */
export async function findCharacterRowIndex(
  client: sheets_v4.Sheets,
  { range, spreadsheetId, predicate }: FindCharacterRowProps,
): Promise<{ rowIndex: number; sheetValues: SheetValues }> {
  const sheetValues = await getSheetValues(client, { range, spreadsheetId });

  return { rowIndex: findRowIndex(sheetValues, predicate), sheetValues };
}

/**
 * Gets the sheet id by name for a given spreadsheetId
 * @param client
 * @param spreadsheetId
 * @param label
 * @returns
 */
export async function getSheetIdByName(
  client: sheets_v4.Sheets,
  spreadsheetId: string,
  label: string,
): Promise<number | null> {
  const response = await client.spreadsheets.get({
    spreadsheetId,
    includeGridData: false,
    // only what's needed to find the tab; the full metadata is ~40 KB
    fields: 'sheets.properties(sheetId,title)',
  });

  const sheet = response.data.sheets?.find((sheet) => {
    const title = sheet.properties?.title;
    return title === label;
  });

  const sheetId = sheet?.properties?.sheetId;

  if (sheetId == null) {
    const msg = `sheet not found ${label}`;
    Sentry.captureMessage(msg, 'warning');
    return null;
  }

  return sheetId;
}
export function columnToIndex(column: string) {
  let index = 0;
  for (let i = 0; i < column.length; i++) {
    index = index * 26 + column.charCodeAt(i) - 'A'.charCodeAt(0) + 1;
  }
  return index - 1; // Convert to zero-based index
}
