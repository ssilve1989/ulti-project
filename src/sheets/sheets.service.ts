import { Inject, Injectable } from '@nestjs/common';
import { InjectSheetsClient } from './sheets.decorators.js';
import { sheets_v4 } from 'googleapis';
import { Signup } from '../signups/signup.interfaces.js';
import { sheetsConfig } from './sheets.config.js';
import { ConfigType } from '@nestjs/config';

@Injectable()
class SheetsService {
  constructor(
    @InjectSheetsClient() private readonly client: sheets_v4.Sheets,
    @Inject(sheetsConfig.KEY)
    private readonly config: ConfigType<typeof sheetsConfig>,
  ) {}

  public async appendSignup({
    encounter,
    character,
    role,
    fflogsLink,
    screenshot,
  }: Signup) {
    const proofOfProg =
      fflogsLink || screenshot
        ? this.createHyperLinkCell('Proof of Prog', (fflogsLink || screenshot)!)
        : '';

    // This depends on knowing the structure of the spreadsheet
    // Current non-automated iterations of the spreadsheet have a progpoint dropdown. We don't currently
    // capture this as part of the signup so we'll replace that value with the proof of prog link
    await this.client.spreadsheets.values.append({
      spreadsheetId: this.config.GOOGLE_SPREADSHEET_ID,
      // the encounter value should match the Sheet name and is used as the range
      range: encounter,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[character, role, proofOfProg]],
      },
    });
  }

  public createHyperLinkCell(name: string, url: string): string {
    return `=HYPERLINK("${url}","${name}")`;
  }
}

export { SheetsService };
