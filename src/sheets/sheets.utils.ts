import { sheets_v4 } from '@googleapis/sheets';

type GetSheetValuesProps = {
  spreadsheetId: string;
  range: string;
};

export async function getSheetValues(
  client: sheets_v4.Sheets,
  { range, spreadsheetId }: GetSheetValuesProps,
) {
  const response = await client.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  return response.data.values;
}

type UpdateSheetProps = {
  values: string[];
  type: 'update' | 'append';
} & GetSheetValuesProps;

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

type FindCharacterRowProps = GetSheetValuesProps & {
  predicate: (values: Set<any>) => boolean;
};

export async function findCharacterRowIndex(
  client: sheets_v4.Sheets,
  { range, spreadsheetId, predicate }: FindCharacterRowProps,
) {
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
