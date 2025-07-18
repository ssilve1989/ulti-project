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
    { timeout: 15_000 },
  );

  return response.data.values;
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
) {
  const payload = {
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: values,
    },
  };

  return type === 'update'
    ? client.spreadsheets.values.update(payload, options)
    : client.spreadsheets.values.append(payload, options);
}

export function batchUpdate(
  client: sheets_v4.Sheets,
  spreadsheetId: string,
  requests: sheets_v4.Schema$Request[],
  options: MethodOptions = { timeout: 30_000 },
) {
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
  const scope = Sentry.getCurrentScope();
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
    scope.captureMessage(msg, 'warning');
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
