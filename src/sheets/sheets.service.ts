import { Injectable, Logger } from '@nestjs/common';
import { sheets_v4 } from '@googleapis/sheets';
import { PartyType } from '../signups/signup.consts.js';
import { Signup } from '../signups/signup.interfaces.js';

import { ProgSheetRanges } from './sheets.consts.js';
import { InjectSheetsClient } from './sheets.decorators.js';

@Injectable()
class SheetsService {
  private readonly logger: Logger = new Logger(SheetsService.name);
  // TODO: hardcoded sheet name, but should be configurable
  private static readonly PROG_SHEET_NAME = 'Ulti Proj: Prog Parties';

  constructor(
    @InjectSheetsClient() private readonly client: sheets_v4.Sheets,
  ) {}

  public async upsertSignup(
    { partyType, ...signup }: Signup,
    spreadsheetId: string,
  ) {
    switch (partyType) {
      case PartyType.CLEAR_PARTY:
        return this.upsertClearParty(signup, spreadsheetId);
      case PartyType.PROG_PARTY:
        return this.upsertProgParty(signup, spreadsheetId);

      default:
        this.logger.error(
          `Unknown party type: ${partyType} for user: ${signup.discordId}`,
        );
    }
  }

  private createHyperLinkCell(name: string, url: string): string {
    return `=HYPERLINK("${url}","${name}")`;
  }

  private async upsertClearParty(
    { encounter, character, role, world, ...rest }: Omit<Signup, 'partyType'>,
    spreadsheetId: string,
  ) {
    const proofOfProg = this.getProgProof(rest);
    const cellValues = [character, world, role, proofOfProg];

    const sheetValues = await this.getSheetValues({
      spreadsheetId,
      range: encounter,
    });

    const row =
      sheetValues?.findIndex((row: string[]) =>
        row.find((value) => value.toLowerCase() === character.toLowerCase()),
      ) ?? -1;

    // This depends on knowing the structure of the spreadsheet
    // Current non-automated iterations of the spreadsheet have a progpoint dropdown. We don't currently
    // capture this as part of the signup so we'll replace that value with the proof of prog link
    if (row === -1) {
      return this.updateSheet(
        spreadsheetId,
        `${encounter}!C:F`,
        cellValues,
        'append',
      );
    } else {
      return this.updateSheet(
        spreadsheetId,
        `${encounter}!C${row + 1}:F${row + 1}`,
        cellValues,
        'update',
      );
    }
  }

  private async upsertProgParty(
    { encounter, character, role, ...rest }: Omit<Signup, 'partyType'>,
    spreadsheetId: string,
  ) {
    const range = ProgSheetRanges[encounter];
    const progProof = this.getProgProof(rest);

    const values = await this.getSheetValues({
      spreadsheetId,
      range: `${SheetsService.PROG_SHEET_NAME}!${range.start}:${range.end}`,
    });

    const row =
      values?.findIndex((row: string[]) => {
        return row.find(
          (value) => value.toLowerCase() === character.toLowerCase(),
        );
      }) ?? -1;

    // This is needed to find the right row in the sub-group to update. Append will not work
    // with how the prog sheet is setup visually with multiple column groups spanning different row lengths
    const rowOffset = values ? values.length + 1 : 15;
    const cellValues = [character, role, progProof];

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
  }: Pick<Signup, 'fflogsLink' | 'screenshot'>) {
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

  public async getSheetTitle(spreadsheetId: string) {
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
}

export { SheetsService };
