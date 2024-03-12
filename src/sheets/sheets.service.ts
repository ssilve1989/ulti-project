import { sheets_v4 } from '@googleapis/sheets';
import { Injectable, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { PartyType, SignupDocument } from '../firebase/models/signup.model.js';
import { SignupCompositeKeyProps } from '../firebase/models/signup.model.js';
import { ProgSheetRanges, columnToIndex } from './sheets.consts.js';
import { InjectSheetsClient } from './sheets.decorators.js';

/**
 * This module depends on knowing the structure of the spreadsheet
 * Current non-automated iterations of the spreadsheet have a progpoint dropdown. We don't currently
 * capture this as part of the signup so we'll replace that value with the proof of prog link.
 * Ranges are very brittle and will need to be updated if the spreadsheet changes.
 */
@Injectable()
class SheetsService {
  private readonly logger: Logger = new Logger(SheetsService.name);
  // TODO: hardcoded sheet name, but should be configurable
  private static readonly PROG_SHEET_NAME = 'Ulti Proj: Prog Parties';
  private static readonly PROG_SHEET_STARTING_ROW = 15; // the row where entries start on the prog sheet

  constructor(
    @InjectSheetsClient() private readonly client: sheets_v4.Sheets,
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
    switch (partyType) {
      case PartyType.CLEAR_PARTY:
        return this.upsertClearParty(signup, spreadsheetId);
      case PartyType.PROG_PARTY:
        return this.upsertProgParty(signup, spreadsheetId);

      default:
        this.logger.warn(
          `unknown party type: ${partyType} for user: ${signup.discordId}. Not appending to any Google Sheet`,
        );
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
      this.createRemoveProgSignupRequest(signup, spreadsheetId),
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
    spreadsheetId: string,
  ): Promise<sheets_v4.Schema$Request | undefined> {
    const range = ProgSheetRanges[encounter];
    const progPartyValues = await this.getSheetValues({
      spreadsheetId,
      range: `${SheetsService.PROG_SHEET_NAME}!${range.start}:${range.end}`,
    });

    const progRowIndex = this.findCharacterRow(
      progPartyValues,
      (values) =>
        values.has(character.toLowerCase()) && values.has(world.toLowerCase()),
    );

    if (progRowIndex !== -1) {
      const sheetId = await this.getSheetIdByName(
        spreadsheetId,
        SheetsService.PROG_SHEET_NAME,
      );

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

  private createHyperLinkCell(name: string, url: string): string {
    return `=HYPERLINK("${url}","${name}")`;
  }

  private async upsertClearParty(
    {
      encounter,
      character,
      role,
      world,
      discordId,
      progPoint = '',
    }: Omit<SignupDocument, 'partyType'>,
    spreadsheetId: string,
  ) {
    const cellValues = [character, world, role, progPoint];

    // remove prog signup if it exists
    const request = await this.createRemoveProgSignupRequest(
      { encounter, character, world, discordId },
      spreadsheetId,
    );

    if (request) {
      // has to be a batchUpdate call to do in-line removal?
      await this.batchUpdate(spreadsheetId, [request]);
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
    {
      encounter,
      character,
      world,
      role,
      progPoint = '',
    }: Omit<SignupDocument, 'partyType'>,
    spreadsheetId: string,
  ) {
    const range = ProgSheetRanges[encounter];

    const values = await this.getSheetValues({
      spreadsheetId,
      range: `${SheetsService.PROG_SHEET_NAME}!${range.start}:${range.end}`,
    });

    const row = this.findCharacterRow(
      values,
      (values) =>
        values.has(character.toLowerCase()) && values.has(world.toLowerCase()),
    );

    // This is needed to find the right row in the sub-group to update. Append will not work
    // with how the prog sheet is setup visually with multiple column groups spanning different row lengths
    const rowOffset = values
      ? values.length + 1
      : SheetsService.PROG_SHEET_STARTING_ROW;

    const cellValues = [character, world, role, progPoint];

    const updateRange =
      row === -1
        ? `${SheetsService.PROG_SHEET_NAME}!${range.start}${rowOffset}:${range.end}`
        : `${SheetsService.PROG_SHEET_NAME}!${range.start}${row + 1}:${
            range.end
          }${row + 1}`;

    return this.updateSheet(spreadsheetId, updateRange, cellValues, 'update');
  }

  private getProgProof({
    fflogsLink,
    screenshot,
  }: Pick<SignupDocument, 'fflogsLink' | 'screenshot'>) {
    return fflogsLink || screenshot
      ? this.createHyperLinkCell('Proof of Prog', (fflogsLink || screenshot)!)
      : '';
  }

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
}

export { SheetsService };
