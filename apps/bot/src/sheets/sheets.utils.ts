import { setTimeout as delay } from 'node:timers/promises';
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

// HTTP statuses that Google's servers flag as transient and safe to retry
// (502/503/504 gateways, 429/500 rate/server errors).
const TRANSIENT_ERROR_CODES = new Set<number>([429, 500, 502, 503, 504]);
const MAX_TRANSIENT_RETRIES = 2;
const RETRY_DELAY_MS = 100;

function isGridLimitExceededError(error: unknown): boolean {
  return (
    Error.isError(error) && GRID_LIMIT_EXCEEDED_PATTERN.test(error.message)
  );
}

function isTransientError(error: unknown): boolean {
  if (!Error.isError(error)) {
    return false;
  }
  const code = 'code' in error ? error.code : undefined;
  return typeof code === 'number' && TRANSIENT_ERROR_CODES.has(code);
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
 * Updates a given sheet with the provided values
 * @param client
 * @param props
 * @returns
 */
export async function updateSheet(
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

  try {
    return await sendRequest();
  } catch (error) {
    if (!isGridLimitExceededError(error)) {
      throw error;
    }

    await growSheetRows(client, spreadsheetId, range);
    return sendRequest();
  }
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
 * Sends a single (atomic) `spreadsheets.batchUpdate` for all requests.
 *
 * Retries bounded transient failures (rate limits / 5xx) with a short backoff
 * and grows the sheet once when the requests exceed the current grid limits,
 * then re-sends the original requests unchanged.
 */
export function batchUpdateWithRetry(
  client: sheets_v4.Sheets,
  spreadsheetId: string,
  requests: sheets_v4.Schema$Request[],
  range: string,
  options: MethodOptions = { timeout: 30_000 },
): Promise<SheetsResponse<sheets_v4.Schema$BatchUpdateSpreadsheetResponse>> {
  const attempt = async (
    retriesLeft: number,
  ): Promise<
    SheetsResponse<sheets_v4.Schema$BatchUpdateSpreadsheetResponse>
  > => {
    try {
      return await batchUpdate(client, spreadsheetId, requests, options);
    } catch (error) {
      if (isGridLimitExceededError(error)) {
        await growSheetRows(client, spreadsheetId, range);
        return batchUpdate(client, spreadsheetId, requests, options);
      }

      if (isTransientError(error) && retriesLeft > 0) {
        await delay(RETRY_DELAY_MS);
        return attempt(retriesLeft - 1);
      }

      throw error;
    }
  };

  return attempt(MAX_TRANSIENT_RETRIES);
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
  if (!sheetValues) {
    return { rowIndex: -1, sheetValues };
  }

  const rowIndex = sheetValues.findIndex((row: string[]) => {
    const set = new Set(row.map((values) => values.toLowerCase()));
    return predicate(set);
  });

  return { rowIndex, sheetValues };
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
