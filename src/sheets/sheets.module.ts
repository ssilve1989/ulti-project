import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { Auth, google } from 'googleapis';
import { sheetsConfig } from './sheets.config.js';
import { SHEETS_CLIENT } from './sheets.consts.js';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

@Module({
  imports: [ConfigModule.forFeature(sheetsConfig)],
  providers: [
    {
      provide: SHEETS_CLIENT,
      inject: [sheetsConfig.KEY],
      useFactory: async ({
        GOOGLE_PRIVATE_KEY,
        GOOGLE_SERVICE_ACCOUNT_EMAIL,
        GOOGLE_UNIVERSE_DOMAIN,
      }: ConfigType<typeof sheetsConfig>) => {
        const client = new Auth.GoogleAuth({
          scopes: SCOPES,
          credentials: {
            client_email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: GOOGLE_PRIVATE_KEY,
            universe_domain: GOOGLE_UNIVERSE_DOMAIN,
          },
        });

        // TODO: Unsure about type cast here
        const auth = (await client.getClient()) as Auth.Compute;
        return google.sheets({ version: 'v4', auth });
      },
    },
  ],
})
export class SheetsModule {}
