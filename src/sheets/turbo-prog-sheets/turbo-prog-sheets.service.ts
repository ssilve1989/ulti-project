import { sheets_v4 } from '@googleapis/sheets';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { titleCase } from 'title-case';
import { TurboProgEntry } from '../../commands/turboprog/turbo-prog.interfaces.js';
import { AsyncQueue } from '../../common/async-queue/async-queue.js';
import { Encounter } from '../../encounters/encounters.consts.js';
import { sheetsConfig } from '../sheets.config.js';
import { InjectSheetsClient } from '../sheets.decorators.js';
import { findCharacterRowIndex, updateSheet } from '../sheets.utils.js';
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
