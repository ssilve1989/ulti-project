import { sheets_v4 } from '@googleapis/sheets';
import { Injectable, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { titleCase } from 'title-case';
import { match } from 'ts-pattern';
import { AsyncQueue } from '../common/async-queue/async-queue.js';
import { Encounter } from '../encounters/encounters.consts.js';
import {
  PartyStatus,
  type SignupDocument,
} from '../firebase/models/signup.model.js';
import { SentryTraced } from '../sentry/sentry-traced.decorator.js';
import { sentryReport } from '../sentry/sentry.consts.js';
import { type SheetRangeConfig, SheetRanges } from './sheets.consts.js';
import { InjectSheetsClient } from './sheets.decorators.js';
import {
  batchUpdate,
  columnToIndex,
  findCharacterRowIndex,
  getSheetIdByName,
  getSheetValues,
  updateSheet,
} from './sheets.utils.js';

/**
 * This module depends on knowing the structure of the spreadsheet
 * Ranges are very brittle and will need to be updated if the spreadsheet changes.
 */
@Injectable()
class SheetsService {
  private readonly logger: Logger = new Logger(SheetsService.name);
  private readonly queue = new AsyncQueue();
  private readonly progEncounters = new Set([
    Encounter.DSR,
    Encounter.TEA,
    Encounter.TOP,
    Encounter.UCOB,
    Encounter.UWU,
    Encounter.FRU,
  ]);

  constructor(
    @InjectSheetsClient() private readonly client: sheets_v4.Sheets,
  ) {}

  /**
   * Upsert a signup into the spreadsheet. If the character is already signed up, it will update the row
   * @param signup
   * @param spreadsheetId
   * @returns
   */
  @SentryTraced()
  public async upsertSignup(
    { partyStatus, ...signup }: SignupDocument,
    spreadsheetId: string,
  ) {
    switch (partyStatus) {
      // There can be race conditions with multiple concurrent calls out to Google Sheets
      // that can result in indeterminstic writes to the sheet. To work-around this, we use a
      // naive async task queue to wrap the operators, so only one task can run at a time.
      // There is a potential for the queue to build up faster than it can process, but we don't
      // expect to have that kind of scale. A future solution would be to use a robust task queue like BullMQ
      case PartyStatus.ClearParty:
      case PartyStatus.ProgParty:
      case PartyStatus.EarlyProgParty:
        return this.queue.add(() =>
          this.upsertRow(signup, spreadsheetId, partyStatus),
        );

      case PartyStatus.Cleared:
        return this.queue.add(() => this.removeSignup(signup, spreadsheetId));

      default: {
        const msg = `unknown party type: ${partyStatus} for character: ${signup.character}`;
        this.logger.warn(msg);
      }
    }
  }

  @SentryTraced()
  public async removeSignup(
    {
      encounter,
      character,
      world,
    }: Pick<SignupDocument, 'encounter' | 'character' | 'world'>,
    spreadsheetId: string,
    partyTypes?: (
      | PartyStatus.ClearParty
      | PartyStatus.ProgParty
      | PartyStatus.EarlyProgParty
    )[],
  ) {
    const types = partyTypes || this.getDefaultPartyTypes(encounter);
    const ranges = types.map((type) => SheetRanges[type]);

    const requests = await Promise.all(
      ranges.map((range) =>
        this.createRemoveRequest(
          spreadsheetId,
          { encounter, character, world },
          range,
        ),
      ),
    );

    const filtered = requests.filter(Boolean) as sheets_v4.Schema$Request[];
    return filtered.length && batchUpdate(this.client, spreadsheetId, filtered);
  }

  private async createRemoveRequest(
    spreadsheetId: string,
    {
      encounter,
      character,
      world,
    }: Pick<SignupDocument, 'character' | 'world' | 'encounter'>,
    range: SheetRangeConfig,
  ): Promise<sheets_v4.Schema$Request | undefined> {
    const sheetValues = await getSheetValues(this.client, {
      spreadsheetId,
      range: `${encounter}!${range.columnStart}:${range.columnEnd}`,
    });

    const rowIndex = this.findCharacterRowIndex(
      sheetValues,
      (values) =>
        values.has(character.toLowerCase()) && values.has(world.toLowerCase()),
    );

    if (rowIndex !== -1) {
      const sheetId = await getSheetIdByName(
        this.client,
        spreadsheetId,
        encounter,
      );

      if (sheetId != null) {
        return {
          updateCells: {
            range: {
              sheetId,
              startRowIndex: rowIndex,
              endRowIndex: rowIndex + 1,
              startColumnIndex: columnToIndex(range.columnStart),
              endColumnIndex: columnToIndex(range.columnEnd) + 1,
            },
            fields: 'userEnteredValue',
          },
        };
      }
    }
  }

  @SentryTraced()
  public async findCharacterRowValues(
    {
      encounter,
      ...signup
    }: Pick<SignupDocument, 'character' | 'world' | 'encounter'>,
    spreadsheetId: string,
  ) {
    const { rowIndex, sheetValues } = await findCharacterRowIndex(this.client, {
      predicate: (values) => values.has(signup.character.toLowerCase()),
      spreadsheetId,
      range: encounter,
    });

    // TODO: Hack to extract values once we found the row. Slice from where we find the name of the character
    // to include that cell and the next 3

    if (!sheetValues || rowIndex === -1) return;

    const values = sheetValues[rowIndex];
    const startIndex = values.findIndex(
      (value) => value.toLowerCase() === signup.character.toLowerCase(),
    );

    if (startIndex === -1) return;

    return values.slice(startIndex, startIndex + 4);
  }

  /**
   * Get the title and url of the spreadsheet
   * @param spreadsheetId
   * @returns
   */
  @SentryTraced()
  public async getSheetMetadata(spreadsheetId: string) {
    // Generate a link to the sheet
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=0`;

    try {
      const response = await this.client.spreadsheets.get({
        spreadsheetId,
        includeGridData: false,
      });

      // Assuming you want the name of the first sheet
      const title = response.data.properties?.title ?? 'Untitled Spreadsheet';

      return { title, url };
    } catch (e) {
      Sentry.getCurrentScope().setExtra('spreadsheetId', spreadsheetId);
      sentryReport(e);

      return match(e)
        .with({ code: 404 }, () => ({
          title: 'Deleted Spreadsheet',
          url,
        }))
        .otherwise(() => {
          throw e;
        });
    }
  }

  @SentryTraced()
  private async upsertRow(
    signup: Omit<SignupDocument, 'partyStatus'>,
    spreadsheetId: string,
    partyStatus:
      | PartyStatus.ClearParty
      | PartyStatus.ProgParty
      | PartyStatus.EarlyProgParty,
  ) {
    const { encounter, character, world } = signup;
    const cellValues = this.getCellValues(signup);

    if (
      this.progEncounters.has(encounter) &&
      partyStatus === PartyStatus.ClearParty
    ) {
      // if its a clear party we need to check if we are moving them from prog to clear
      await this.removeSignup(signup, spreadsheetId, [PartyStatus.ProgParty]);
    }

    const ranges = SheetRanges[partyStatus];
    const range = `${encounter}!${ranges.columnStart}:${ranges.columnEnd}`;

    const sheetValues = await getSheetValues(this.client, {
      spreadsheetId,
      range,
    });

    const row = this.findCharacterRowIndex(
      sheetValues,
      (values) =>
        values.has(character.toLowerCase()) && values.has(world.toLowerCase()),
    );

    const rowOffset = sheetValues ? sheetValues.length + 1 : ranges.rowStart;
    const updateRange =
      row === -1
        ? `${encounter}!${ranges.columnStart}${rowOffset}:${ranges.columnEnd}`
        : `${encounter}!${ranges.columnStart}${row + 1}:${ranges.columnEnd}${row + 1}`;

    return updateSheet(this.client, {
      spreadsheetId,
      range: updateRange,
      values: cellValues,
      type: 'update',
    });
  }

  /**
   * Find the row in the sheet values for the given character
   * @param signup
   * @param predicate a function that determines if a character is found in the given set of values
   * @param values
   * @returns the row index or -1 if not found
   */
  @SentryTraced()
  private findCharacterRowIndex(
    values: any[][] | undefined | null,
    predicate: (values: Set<any>) => boolean,
  ): number {
    if (!values) {
      return -1;
    }

    return values.findIndex((row: string[]) => {
      const set = new Set(row.map((values) => values.toLowerCase()));
      return predicate(set);
    });
  }

  private getCellValues({
    character,
    world,
    role,
    progPoint = '',
  }: SignupDocument) {
    return [titleCase(character), titleCase(world), role, progPoint];
  }

  private getDefaultPartyTypes(
    encounter: Encounter,
  ): (
    | PartyStatus.ClearParty
    | PartyStatus.ProgParty
    | PartyStatus.EarlyProgParty
  )[] {
    return this.progEncounters.has(encounter)
      ? [PartyStatus.ProgParty, PartyStatus.ClearParty]
      : [PartyStatus.ClearParty];
  }
}

export { SheetsService };
