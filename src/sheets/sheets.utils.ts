import { sheets_v4 } from '@googleapis/sheets';
import * as Sentry from '@sentry/node';

type GetSheetValuesProps = {
  spreadsheetId: string;
  range: string;
};

type FindCharacterRowProps = GetSheetValuesProps & {
  predicate: (values: Set<any>) => boolean;
};

type SheetValues = string[][] | null | undefined;

type UpdateSheetProps = {
  values: string[];
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
  const response = await client.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

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
) {
  const payload = {
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [values],
    },
  };

  return type === 'update'
    ? client.spreadsheets.values.update(payload)
    : client.spreadsheets.values.append(payload);
}

export function batchUpdate(
  client: sheets_v4.Sheets,
  spreadsheetId: string,
  requests: any[],
) {
  return client.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests,
    },
  });
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
