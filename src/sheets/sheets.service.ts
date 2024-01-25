import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { sheets_v4 } from 'googleapis';
import { Signup } from '../signups/signup.interfaces.js';
import { sheetsConfig } from './sheets.config.js';
import { InjectSheetsClient } from './sheets.decorators.js';

// TODO: Needs unit testing but mocking the google client is a PITA
@Injectable()
class SheetsService {
  constructor(
    @InjectSheetsClient() private readonly client: sheets_v4.Sheets,
    @Inject(sheetsConfig.KEY)
    private readonly config: ConfigType<typeof sheetsConfig>,
  ) {}

  public async upsertSignup({
    encounter,
    character,
    role,
    fflogsLink,
    world,
    screenshot,
  }: Signup) {
    const proofOfProg =
      fflogsLink || screenshot
        ? this.createHyperLinkCell('Proof of Prog', (fflogsLink || screenshot)!)
        : '';

    const {
      data: { values },
    } = await this.client.spreadsheets.values.get({
      spreadsheetId: this.config.GOOGLE_SPREADSHEET_ID,
      range: encounter,
    });

    // depends on knowing that character is at the 2nd index of th row
    const row = values?.findIndex((row) => row.at(2) === character) ?? -1;

    // This depends on knowing the structure of the spreadsheet
    // Current non-automated iterations of the spreadsheet have a progpoint dropdown. We don't currently
    // capture this as part of the signup so we'll replace that value with the proof of prog link
    if (row === -1) {
      await this.client.spreadsheets.values.append({
        spreadsheetId: this.config.GOOGLE_SPREADSHEET_ID,
        // the encounter value should match the sheet name and is used as the range
        // this used to work without needing to specify column range but on the actual ulti-project sheet it needs this I believe due to empty columns at the start of the document
        range: `${encounter}!C:F`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[character, world, role, proofOfProg]],
        },
      });
    } else {
      // If the row was found, update the existing data
      await this.client.spreadsheets.values.update({
        spreadsheetId: this.config.GOOGLE_SPREADSHEET_ID,
        range: `${encounter}!C${row + 1}:F${row + 1}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[character, world, role, proofOfProg]],
        },
      });
    }
  }

  public createHyperLinkCell(name: string, url: string): string {
    return `=HYPERLINK("${url}","${name}")`;
  }
}

export { SheetsService };
