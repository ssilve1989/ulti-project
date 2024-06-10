import { sheets_v4 } from '@googleapis/sheets';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { titleCase } from 'title-case';
import { AsyncQueue } from '../../common/async-queue/async-queue.js';
import { Encounter } from '../../encounters/encounters.consts.js';
import { TurboProgEntry } from '../../turboprog/turbo-prog.interfaces.js';
import { sheetsConfig } from '../sheets.config.js';
import { columnToIndex } from '../sheets.consts.js';
import { InjectSheetsClient } from '../sheets.decorators.js';
import {
  findCharacterRowIndex,
  getSheetIdByName,
  updateSheet,
} from '../sheets.utils.js';
import {
  TURBP_PROG_SHEET_STARTING_ROW,
  TurboProgSheetRanges,
} from './turbo-prog-sheets.consts.js';

@Injectable()
class TurboProgSheetsService {
  private readonly queue = new AsyncQueue();

  constructor(
    @InjectSheetsClient() private readonly client: sheets_v4.Sheets,
    @Inject(sheetsConfig.KEY)
    private readonly config: ConfigType<typeof sheetsConfig>,
  ) {}

  public upsert(entry: TurboProgEntry, spreadsheetId: string) {
    return this.queue.add(() => this.upsertEntry(entry, spreadsheetId));
  }

  public async removeSignup(
    { encounter, character }: Pick<TurboProgEntry, 'encounter' | 'character'>,
    spreadsheetId: string,
  ) {
    const range = TurboProgSheetRanges[encounter];

    const sheetName = this.config.TURBO_PROG_SHEET_NAME;
    const { rowIndex } = await findCharacterRowIndex(this.client, {
      spreadsheetId,
      range: `${sheetName}!${range.start}:${range.end}`,
      predicate: (values) => values.has(character.toLowerCase()),
    });

    if (rowIndex !== -1) {
      const sheetId = await getSheetIdByName(
        this.client,
        spreadsheetId,
        sheetName,
      );

      const request: sheets_v4.Schema$Request = {
        updateCells: {
          range: {
            sheetId,
            startRowIndex: rowIndex,
            endRowIndex: rowIndex + 1,
            startColumnIndex: columnToIndex(range.start),
            endColumnIndex: columnToIndex(range.end) + 1,
          },
          fields: 'userEnteredValue',
        },
      };

      await this.client.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [request],
        },
      });
    }
  }

  private async upsertEntry(
    { encounter, character, job, progPoint, availability }: TurboProgEntry,
    spreadsheetId: string,
  ) {
    // TODO: Figure out what to do about world
    const sheetName = this.config.TURBO_PROG_SHEET_NAME;
    const range = TurboProgSheetRanges[encounter as Encounter];

    const { rowIndex, sheetValues } = await findCharacterRowIndex(this.client, {
      spreadsheetId,
      range: `${sheetName}!${range.start}:${range.end}`,
      predicate: (values) => values.has(character.toLowerCase()),
    });

    const rowOffset = sheetValues
      ? sheetValues.length + 1
      : TURBP_PROG_SHEET_STARTING_ROW;

    const values = [titleCase(character), job, progPoint, availability];

    const updateRange =
      rowIndex === -1
        ? `${sheetName}!${range.start}${rowOffset}:${range.end}`
        : `${sheetName}!${range.start}${rowIndex + 1}:${range.end}${
            rowIndex + 1
          }`;

    await updateSheet(this.client, {
      spreadsheetId,
      range: updateRange,
      values,
      type: 'update',
    });
  }
}

export { TurboProgSheetsService };
