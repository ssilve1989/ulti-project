import { sheets_v4 } from '@googleapis/sheets';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import * as Sentry from '@sentry/node';
import { titleCase } from 'title-case';
import { AsyncQueue } from '../common/async-queue/async-queue.js';
import { PartyType, SignupDocument } from '../firebase/models/signup.model.js';
import { SignupCompositeKeyProps } from '../firebase/models/signup.model.js';
import { sheetsConfig } from './sheets.config.js';
import {
  PROG_SHEET_STARTING_ROW,
  ProgSheetRanges,
  columnToIndex,
} from './sheets.consts.js';
import { InjectSheetsClient } from './sheets.decorators.js';

interface SheetOptions {
  spreadsheetId: string;
  sheetName: string;
  removeFrom?: string;
}

/**
 * This module depends on knowing the structure of the spreadsheet
 * Current non-automated iterations of the spreadsheet have a progpoint dropdown. We don't currently
 * capture this as part of the signup so we'll replace that value with the proof of prog link.
 * Ranges are very brittle and will need to be updated if the spreadsheet changes.
 */
@Injectable()
class SheetsService {
  private readonly logger: Logger = new Logger(SheetsService.name);
  private readonly queue = new AsyncQueue();

  constructor(
    @InjectSheetsClient() private readonly client: sheets_v4.Sheets,
    @Inject(sheetsConfig.KEY)
    private readonly config: ConfigType<typeof sheetsConfig>,
  ) {}

  /**
   * Upsert a signup into the spreadsheet. If the character is already signed up, it will update the row
   * @param signup
   * @param spreadsheetId
   * @returns
   */
  public async upsertSignup(
    { partyType, ...signup }: SignupDocument,
    spreadsheetId: string,
  ) {
    const { SHEET_EARLY_PROG_NAME, SHEET_PROG_NAME } = this.config;
    switch (partyType) {
      // There can be race conditions with multiple concurrent calls out to Google Sheets
      // that can result in indeterminstic writes to the sheet. To work-around this, we use a
      // naive async task queue to wrap the operators, so only one task can run at a time.
      // There is a potential for the queue to build up faster than it can process, but we don't
      // expect to have that kind of scale. A future solution would be to use a robust task queue like BullMQ

      case PartyType.CLEAR_PARTY:
        return this.queue.add(() =>
          this.upsertClearParty(signup, spreadsheetId),
        );

      case PartyType.PROG_PARTY:
        return this.queue.add(() =>
          this.upsertProgParty(signup, {
            spreadsheetId,
            sheetName: SHEET_PROG_NAME,
            removeFrom: SHEET_EARLY_PROG_NAME,
          }),
        );

      case PartyType.EARLY_PROG_PARTY:
        return this.queue.add(() =>
          this.upsertProgParty(signup, {
            spreadsheetId,
            sheetName: this.config.SHEET_EARLY_PROG_NAME,
          }),
        );

      default: {
        const msg = `unknown party type: ${partyType} for user: ${signup.discordId}. Not appending to any Google Sheet`;
        Sentry.captureMessage(msg);
        this.logger.warn(msg);
      }
    }
  }

  /**
   * Remove a signup from the spreadsheet
   * @param signup
   * @param spreadsheetId
   */
  public async removeSignup(
    signup: SignupCompositeKeyProps &
      Pick<SignupDocument, 'character' | 'world'>,
    spreadsheetId: string,
  ) {
    const requests = await Promise.all([
      this.createRemoveClearSignupRequest(signup, spreadsheetId),
      this.createRemoveProgSignupRequest(signup, {
        spreadsheetId,
        sheetName: this.config.SHEET_PROG_NAME,
      }),
      this.createRemoveProgSignupRequest(signup, {
        spreadsheetId,
        sheetName: this.config.SHEET_EARLY_PROG_NAME,
      }),
    ]);

    const filtered = requests.filter(Boolean) as sheets_v4.Schema$Request[];
    return filtered.length && this.batchUpdate(spreadsheetId, filtered);
  }

  /**
   * Get the title and url of the spreadsheet
   * @param spreadsheetId
   * @returns
   */
  public async getSheetMetadata(spreadsheetId: string) {
    const response = await this.client.spreadsheets.get({
      spreadsheetId,
      includeGridData: false,
    });

    // Assuming you want the name of the first sheet
    const title = response.data.properties?.title ?? 'Untitled Spreadsheet';

    // Generate a link to the sheet
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=0`;

    return { title, url };
  }

  private async createRemoveProgSignupRequest(
    {
      encounter,
      character,
      world,
    }: SignupCompositeKeyProps & Pick<SignupDocument, 'character' | 'world'>,
    { spreadsheetId, sheetName }: SheetOptions,
  ): Promise<sheets_v4.Schema$Request | undefined> {
    const range = ProgSheetRanges[encounter];
    const progPartyValues = await this.getSheetValues({
      spreadsheetId,
      range: `${sheetName}!${range.start}:${range.end}`,
    });

    const progRowIndex = this.findCharacterRow(
      progPartyValues,
      (values) =>
        values.has(character.toLowerCase()) && values.has(world.toLowerCase()),
    );

    if (progRowIndex !== -1) {
      const sheetId = await this.getSheetIdByName(spreadsheetId, sheetName);

      if (sheetId != null) {
        return {
          updateCells: {
            range: {
              sheetId,
              startRowIndex: progRowIndex,
              endRowIndex: progRowIndex + 1,
              startColumnIndex: columnToIndex(range.start),
              endColumnIndex: columnToIndex(range.end) + 1,
            },
            fields: 'userEnteredValue',
          },
        };
      }
    }
  }

  private async createRemoveClearSignupRequest(
    {
      encounter,
      world,
      character,
    }: SignupCompositeKeyProps & Pick<SignupDocument, 'character' | 'world'>,
    spreadsheetId: string,
  ): Promise<sheets_v4.Schema$Request | undefined> {
    const clearPartyValues = await this.getSheetValues({
      spreadsheetId,
      range: encounter,
    });

    const clearRowIndex = this.findCharacterRow(
      clearPartyValues,
      (values) =>
        values.has(character.toLowerCase()) && values.has(world.toLowerCase()),
    );

    if (clearRowIndex !== -1) {
      const sheetId = await this.getSheetIdByName(spreadsheetId, encounter);

      if (sheetId != null) {
        return {
          updateCells: {
            range: {
              sheetId,
              startRowIndex: clearRowIndex,
              endRowIndex: clearRowIndex + 3,
            },
            fields: 'userEnteredValue',
          },
        };
      }
    }
  }

  // private createHyperLinkCell(name: string, url: string): string {
  //   return `=HYPERLINK("${url}","${name}")`;
  // }

  private async upsertClearParty(
    signup: Omit<SignupDocument, 'partyType'>,
    spreadsheetId: string,
  ) {
    const { encounter, character, world, discordId } = signup;
    const cellValues = this.getCellValues(signup);

    const { SHEET_EARLY_PROG_NAME, SHEET_PROG_NAME } = this.config;
    // need to check if we should remove prior signups from either earlyprog or mid prog sheet
    const requests = [];

    for (const sheetName of [SHEET_EARLY_PROG_NAME, SHEET_PROG_NAME]) {
      const request = await this.createRemoveProgSignupRequest(
        { encounter, character, world, discordId },
        { spreadsheetId, sheetName },
      );
      if (request) {
        requests.push(request);
      }
    }

    if (requests.length > 0) {
      // has to be a batchUpdate call to do in-line removal?
      await this.batchUpdate(spreadsheetId, requests);
    }

    const sheetValues = await this.getSheetValues({
      spreadsheetId,
      range: encounter,
    });

    const row = this.findCharacterRow(
      sheetValues,
      (values) =>
        values.has(character.toLowerCase()) && values.has(world.toLowerCase()),
    );

    if (row === -1) {
      return this.updateSheet(
        spreadsheetId,
        `${encounter}!C:F`,
        cellValues,
        'append',
      );
    }

    return this.updateSheet(
      spreadsheetId,
      `${encounter}!C${row + 1}:F${row + 1}`,
      cellValues,
      'update',
    );
  }

  private async upsertProgParty(
    signup: SignupDocument,
    { sheetName, spreadsheetId, removeFrom }: SheetOptions,
  ) {
    // if there is a sheet to check for removal, like going from early prog to prog, check and remove data from that sheet
    if (removeFrom) {
      this.logger.debug(`Removing from sheet: ${removeFrom}`);
      const request = await this.createRemoveProgSignupRequest(signup, {
        spreadsheetId,
        sheetName: removeFrom,
      });

      if (request) {
        await this.batchUpdate(spreadsheetId, [request]);
      }
    }

    const { encounter, character, world } = signup;
    const range = ProgSheetRanges[encounter];

    const values = await this.getSheetValues({
      spreadsheetId,
      range: `${sheetName}!${range.start}:${range.end}`,
    });

    const row = this.findCharacterRow(
      values,
      (values) =>
        values.has(character.toLowerCase()) && values.has(world.toLowerCase()),
    );

    // This is needed to find the right row in the sub-group to update. Append will not work
    // with how the prog sheet is setup visually with multiple column groups spanning different row lengths
    const rowOffset = values ? values.length + 1 : PROG_SHEET_STARTING_ROW;

    const cellValues = this.getCellValues(signup);

    const updateRange =
      row === -1
        ? `${sheetName}!${range.start}${rowOffset}:${range.end}`
        : `${sheetName}!${range.start}${row + 1}:${range.end}${row + 1}`;

    return this.updateSheet(spreadsheetId, updateRange, cellValues, 'update');
  }

  // private getProgProof({
  //   fflogsLink,
  //   screenshot,
  // }: Pick<SignupDocument, 'fflogsLink' | 'screenshot'>) {
  //   return fflogsLink || screenshot
  //     ? this.createHyperLinkCell('Proof of Prog', (fflogsLink || screenshot)!)
  //     : '';
  // }

  private async getSheetValues({
    spreadsheetId,
    range,
  }: {
    spreadsheetId: string;
    range: string;
  }) {
    const {
      data: { values },
    } = await this.client.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    return values;
  }

  private updateSheet(
    spreadsheetId: string,
    range: string,
    values: string[],
    type: 'update' | 'append',
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
      ? this.client.spreadsheets.values.update(payload)
      : this.client.spreadsheets.values.append(payload);
  }

  /**
   * Batch update the spreadsheet with the given requests
   * @param spreadsheetId
   * @param requests
   * @returns
   */
  private batchUpdate(
    spreadsheetId: string,
    requests: sheets_v4.Schema$Request[],
  ) {
    return this.client.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests,
      },
    });
  }

  /**
   * Find the row in the sheet values for the given character
   * @param signup
   * @param predicate a function that determines if a character is found in the given set of values
   * @param values
   * @returns the row index or -1 if not found
   */
  private findCharacterRow(
    values: any[][] | undefined | null,
    predicate: (values: Set<any>) => boolean,
  ): number {
    if (!values) return -1;

    return values.findIndex((row: string[]) => {
      const set = new Set(row.map((values) => values.toLowerCase()));
      return predicate(set);
    });
  }

  private async getSheetIdByName(spreadsheetId: string, name: string) {
    const response = await this.client.spreadsheets.get({
      spreadsheetId,
      includeGridData: false,
    });

    const sheet = response.data.sheets?.find((sheet) => {
      const title = sheet.properties?.title;
      return title === name;
    });

    const sheetId = sheet?.properties?.sheetId;

    if (sheetId == null) {
      const msg = `Sheet not found for encounter: ${name}`;
      Sentry.captureMessage(msg, 'warning');
      this.logger.warn(msg);
    }

    return sheetId;
  }

  private getCellValues({
    character,
    world,
    role,
    progPoint = '',
  }: SignupDocument) {
    return [titleCase(character), titleCase(world), role, progPoint];
  }
}

export { SheetsService };
