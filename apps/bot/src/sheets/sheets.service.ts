import { sheets_v4 } from '@googleapis/sheets';
import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { SentryTraced } from '@sentry/nestjs';
import {
  type ApprovedSignupDocument,
  Encounter,
  PartyStatus,
  type SignupDocument,
} from '@ulti-project/shared';
import { titleCase } from 'title-case';
import { match } from 'ts-pattern';
import { AsyncQueue } from '../common/async-queue/async-queue.js';
import { EncountersService } from '../encounters/encounters.service.js';
import { ErrorService } from '../error/error.service.js';
import { type SheetRangeConfig, SheetRanges } from './sheets.consts.js';
import { InjectSheetsClient } from './sheets.decorators.js';
import {
  batchUpdate,
  batchWrite,
  columnToIndex,
  findCharacterRowIndex,
  findRowIndex,
  getSheetIdByName,
  getSheetValues,
  getSheetValuesBatch,
  updateSheet,
} from './sheets.utils.js';

type NonClearedPartyStatus =
  | typeof PartyStatus.EarlyProgParty
  | typeof PartyStatus.ProgParty
  | typeof PartyStatus.ClearParty;

type PartyTypes = NonClearedPartyStatus[];

/**
 * This module depends on knowing the structure of the spreadsheet
 * Ranges are very brittle and will need to be updated if the spreadsheet changes.
 */
@Injectable()
class SheetsService implements OnApplicationShutdown {
  private readonly logger: Logger = new Logger(SheetsService.name);
  // Serializes signup writes to avoid concurrent-write races on the sheet
  private readonly signupQueue = new AsyncQueue();

  constructor(
    @InjectSheetsClient() private readonly client: sheets_v4.Sheets,
    private readonly encountersService: EncountersService,
    private readonly errorService: ErrorService,
  ) {}

  onApplicationShutdown(): void {
    this.signupQueue.complete();
  }

  // Regular signup methods

  /**
   * Upsert a signup into the spreadsheet. If the character is already signed up, it will update the row
   * @param signup
   * @param spreadsheetId
   * @returns
   */
  @SentryTraced()
  public upsertSignup(
    { partyStatus, ...signup }: ApprovedSignupDocument,
    spreadsheetId: string,
  ) {
    switch (partyStatus) {
      // There can be race conditions with multiple concurrent calls out to Google Sheets
      // that can result in indeterminstic writes to the sheet. To work-around this, we use a
      // naive async task queue to wrap the operators, so only one task can run at a time per queue.
      case PartyStatus.ClearParty:
      case PartyStatus.ProgParty:
      case PartyStatus.EarlyProgParty:
        return this.signupQueue.add(() =>
          this.upsertRow(signup, spreadsheetId, partyStatus),
        );
      case PartyStatus.Cleared:
        return this.signupQueue.add(() =>
          this.removeSignup(signup, spreadsheetId),
        );
      default: {
        const msg = `unknown party type: ${partyStatus} for character: ${signup.character}`;
        this.logger.warn(msg);
      }
    }
  }

  // Original methods

  @SentryTraced()
  public async removeSignup(
    {
      encounter,
      character,
      world,
    }: Pick<SignupDocument, 'encounter' | 'character' | 'world'>,
    spreadsheetId: string,
    partyTypes?: PartyTypes,
  ) {
    const types = partyTypes || (await this.getDefaultPartyTypes(encounter));

    return this.batchRemoveClearedSignups([{ character, world }], {
      encounter,
      spreadsheetId,
      partyTypes: types,
    });
  }

  /**
   * Clears the rows of multiple signups found on the spreadsheet, with one read
   * for all ranges, one `sheetId` lookup and one `batchUpdate` for all of them.
   * @param signups
   * @param param1
   * @returns the number of rows cleared
   */
  public async batchRemoveClearedSignups(
    signups: Pick<SignupDocument, 'character' | 'world'>[],
    {
      encounter,
      spreadsheetId,
      partyTypes,
    }: {
      encounter: Encounter;
      spreadsheetId: string;
      partyTypes: PartyTypes;
    },
  ): Promise<number> {
    // This function was created to assist in the the jobs that operate on multiple signups at once and to help prevent running into
    // rate limiting issues on the Sheets API, which at the time of writing is 60/min per user per project. 300/min per project total.
    const ranges = partyTypes.map((type) => SheetRanges[type]);

    const sheetValues = await getSheetValuesBatch(this.client, {
      spreadsheetId,
      ranges: ranges.map((range) => this.toA1Range(encounter, range)),
    });

    const found = ranges.flatMap((range, index) =>
      signups.flatMap(({ character, world }) => {
        const rowIndex = findRowIndex(
          sheetValues[index],
          (values) =>
            values.has(character.toLowerCase()) &&
            values.has(world.toLowerCase()),
        );
        return rowIndex === -1 ? [] : [{ range, rowIndex }];
      }),
    );

    if (!found.length) return 0;

    const sheetId = await getSheetIdByName(
      this.client,
      spreadsheetId,
      encounter,
    );

    if (sheetId == null) {
      throw new Error(`Invalid SheetID for encounter ${encounter}`);
    }

    await batchUpdate(
      this.client,
      spreadsheetId,
      found.map(({ range, rowIndex }) =>
        this.clearRowRequest(sheetId, range, rowIndex),
      ),
    );

    return found.length;
  }

  private toA1Range(encounter: Encounter, range: SheetRangeConfig) {
    return `${encounter}!${range.columnStart}:${range.columnEnd}`;
  }

  @SentryTraced()
  public async findCharacterRowValues(
    {
      encounter,
      ...signup
    }: Pick<SignupDocument, 'character' | 'world' | 'encounter'>,
    spreadsheetId: string,
  ): Promise<string[] | undefined> {
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
  public async getSheetMetadata(
    spreadsheetId: string,
  ): Promise<{ title: string; url: string }> {
    // Generate a link to the sheet
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=0`;

    try {
      const response = await this.client.spreadsheets.get({
        spreadsheetId,
        includeGridData: false,
        fields: 'properties.title',
      });

      // Assuming you want the name of the first sheet
      const title = response.data.properties?.title ?? 'Untitled Spreadsheet';

      return { title, url };
    } catch (e) {
      Sentry.getCurrentScope().setExtra('spreadsheetId', spreadsheetId);
      this.errorService.captureError(e);

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

  // Original private methods

  @SentryTraced()
  private async upsertRow(
    signup: Omit<SignupDocument, 'partyStatus'>,
    spreadsheetId: string,
    partyStatus: NonClearedPartyStatus,
  ) {
    const { encounter, character, world } = signup;
    const cellValues = this.getCellValues(signup);
    const isCharacter = (values: Set<string>) =>
      values.has(character.toLowerCase()) && values.has(world.toLowerCase());

    const ranges = SheetRanges[partyStatus];
    const range = `${encounter}!${ranges.columnStart}:${ranges.columnEnd}`;

    const sheetId = await getSheetIdByName(
      this.client,
      spreadsheetId,
      encounter,
    );

    if (sheetId == null) {
      throw new Error(`Invalid SheetID for encounter ${encounter}`);
    }

    // the clearing of any stale row and the write go in one atomic batch, so
    // a failure can't leave the character in neither section
    const requests: sheets_v4.Schema$Request[] = [];

    const isProgEncounter = await this.isProgEncounter(encounter);
    let sheetValues: Awaited<ReturnType<typeof getSheetValues>>;
    if (isProgEncounter && partyStatus === PartyStatus.ClearParty) {
      // if its a clear party we need to check if we are moving them from prog to clear
      const progRange = SheetRanges[PartyStatus.ProgParty];
      const [progValues, clearValues] = await getSheetValuesBatch(this.client, {
        spreadsheetId,
        ranges: [this.toA1Range(encounter, progRange), range],
      });
      const progRow = findRowIndex(progValues, isCharacter);
      if (progRow !== -1) {
        requests.push(this.clearRowRequest(sheetId, progRange, progRow));
      }
      sheetValues = clearValues;
    } else {
      sheetValues = await getSheetValues(this.client, {
        spreadsheetId,
        range,
      });
    }

    const row = findRowIndex(sheetValues, isCharacter);
    const nextFreeRow = sheetValues ? sheetValues.length : ranges.rowStart - 1;

    requests.push({
      updateCells: {
        range: this.rowGridRange(
          sheetId,
          ranges,
          row === -1 ? nextFreeRow : row,
        ),
        // literal strings, never parsed: a value like `=IMPORTXML(...)` stays text
        rows: [
          {
            values: cellValues.map((value) => ({
              userEnteredValue: { stringValue: value },
            })),
          },
        ],
        fields: 'userEnteredValue',
      },
    });

    return batchWrite(this.client, spreadsheetId, requests, range);
  }

  /** The grid range of one row of a section, `rowIndex` counting from 0. */
  private rowGridRange(
    sheetId: number,
    range: SheetRangeConfig,
    rowIndex: number,
  ): sheets_v4.Schema$GridRange {
    return {
      sheetId,
      startRowIndex: rowIndex,
      endRowIndex: rowIndex + 1,
      startColumnIndex: columnToIndex(range.columnStart),
      endColumnIndex: columnToIndex(range.columnEnd) + 1,
    };
  }

  /** A request emptying one row of a section, `rowIndex` counting from 0. */
  private clearRowRequest(
    sheetId: number,
    range: SheetRangeConfig,
    rowIndex: number,
  ): sheets_v4.Schema$Request {
    return {
      updateCells: {
        range: this.rowGridRange(sheetId, range, rowIndex),
        fields: 'userEnteredValue',
      },
    };
  }

  private getCellValues({
    character,
    world,
    role,
    progPoint,
    progPointRequested,
  }: Pick<
    ApprovedSignupDocument,
    'character' | 'world' | 'role' | 'progPoint' | 'progPointRequested'
  >): string[] {
    return [
      titleCase(character),
      titleCase(world),
      role,
      progPoint ?? progPointRequested,
    ];
  }

  private async isProgEncounter(encounter: Encounter): Promise<boolean> {
    try {
      const progPoints = await this.encountersService.getProgPoints(encounter);
      // An encounter is considered a "prog encounter" if it has multiple prog points
      // indicating different stages of progression
      return progPoints.length > 1;
    } catch {
      // If we can't get prog points, fall back to conservative behavior
      return false;
    }
  }

  private async getDefaultPartyTypes(
    encounter: Encounter,
  ): Promise<NonClearedPartyStatus[]> {
    const isProgEncounter = await this.isProgEncounter(encounter);
    return isProgEncounter
      ? [PartyStatus.ProgParty, PartyStatus.ClearParty]
      : [PartyStatus.ClearParty];
  }

  @SentryTraced()
  public async cleanSheet({
    spreadsheetId,
    encounter,
  }: {
    spreadsheetId: string;
    encounter: Encounter;
  }): Promise<void> {
    this.logger.log(`Cleaning sheet: ${encounter}`);

    const ranges = [
      SheetRanges[PartyStatus.ClearParty],
      SheetRanges[PartyStatus.ProgParty],
    ];

    for (const { format, columnEnd, columnStart, rowStart } of ranges) {
      const response = await this.client.spreadsheets.get({
        spreadsheetId,
        ranges: [`${encounter}!${columnStart}${rowStart}:${columnEnd}`],
        // Get values WITH formatting
        includeGridData: true,
      });

      if (response.data.sheets?.[0]?.properties?.hidden) {
        this.logger.log(`Skipping hidden sheet: ${encounter}`);
        return;
      }

      const gridData = response.data.sheets?.[0].data?.[0];

      if (!gridData?.rowData?.length) continue;

      // Extract values and their formatting
      const rowsWithFormatting = gridData.rowData.map((row) => ({
        values:
          row.values?.map((cell) => cell.userEnteredValue?.stringValue || '') ||
          [],
        format: row.values?.map((cell) => cell.userEnteredFormat) || [],
      }));

      // Filter out empty rows but keep their formatting
      const nonEmptyRows = rowsWithFormatting.filter((row) =>
        row.values.some((cell) => cell),
      );

      const progPointsFromDB =
        await this.encountersService.getProgPoints(encounter);
      const progPoints = progPointsFromDB
        .sort((a, b) => a.order - b.order)
        .map((p) => p.id);
      const progPointIndexMap = new Map(progPoints.map((p, i) => [p, i]));
      const progPointIndex = (value: string) =>
        progPointIndexMap.get(value) ?? Number.NEGATIVE_INFINITY;

      // Sort the rows while keeping their formatting
      nonEmptyRows.sort((a, b) => {
        const aPoint = a.values[3] || '';
        const bPoint = b.values[3] || '';
        return progPointIndex(bPoint) - progPointIndex(aPoint);
      });

      if (nonEmptyRows.length) {
        const sheetId = response.data.sheets?.[0]?.properties?.sheetId;

        if (sheetId == null) continue;

        const baseFormat = {
          horizontalAlignment: format.horizontalAlignment,
          textFormat: {
            fontSize: format.fontSize,
            fontFamily: format.fontFamily,
          },
          borders: format.borders,
        };

        // Create update requests that preserve background colors but apply base formatting
        const requests = nonEmptyRows.map((row, index) => ({
          updateCells: {
            range: {
              sheetId,
              startRowIndex: rowStart - 1 + index,
              endRowIndex: rowStart + index,
              startColumnIndex: columnToIndex(columnStart),
              endColumnIndex: columnToIndex(columnEnd) + 1,
            },
            rows: [
              {
                values: row.values.map((value, cellIndex) => ({
                  userEnteredValue: { stringValue: value },
                  userEnteredFormat: {
                    ...baseFormat,
                    backgroundColor: row.format[cellIndex]?.backgroundColor,
                  },
                })),
              },
            ],
            fields:
              'userEnteredFormat(backgroundColor,horizontalAlignment,textFormat(fontSize,fontFamily),borders),userEnteredValue',
          },
        }));

        // Clear remaining rows if any
        const emptyRowsCount = gridData.rowData.length - nonEmptyRows.length;
        if (emptyRowsCount > 0) {
          requests.push({
            updateCells: {
              range: {
                sheetId,
                startRowIndex: rowStart - 1 + nonEmptyRows.length,
                endRowIndex: rowStart - 1 + gridData.rowData.length,
                startColumnIndex: columnToIndex(columnStart),
                endColumnIndex: columnToIndex(columnEnd) + 1,
              },
              rows: Array(emptyRowsCount).fill({
                values: Array(4).fill({
                  userEnteredValue: { stringValue: '' },
                  userEnteredFormat: {
                    ...baseFormat,
                    backgroundColor: format.defaultBackgroundColor,
                  },
                }),
              }),
              fields:
                'userEnteredFormat(backgroundColor,horizontalAlignment,textFormat(fontSize,fontFamily),borders),userEnteredValue',
            },
          });
        }

        await batchUpdate(this.client, spreadsheetId, requests, {
          timeout: 60_000,
        });
      }
    }

    // Add cleanup date after all ranges are processed
    const today = new Date();
    const dateFormatter = new Intl.DateTimeFormat('en-US', {
      month: '2-digit',
      day: '2-digit',
    });

    const dateString = `Last Cleanup ${dateFormatter.format(today)}`;

    await updateSheet(this.client, {
      spreadsheetId,
      range: `${encounter}!L6`,
      values: [[dateString]],
      type: 'update',
    });
  }
}

export { SheetsService };
