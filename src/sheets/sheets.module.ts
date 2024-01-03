import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Auth, google } from 'googleapis';
import { SheetsConfig, sheetsConfig } from './sheets.config.js';
import { SHEETS_CLIENT } from './sheets.consts.js';
import { SheetsService } from './sheets.service.js';
import { AppConfig } from '../app.config.js';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

@Module({
  imports: [ConfigModule.forFeature(sheetsConfig)],
  providers: [
    SheetsService,
    {
      provide: SHEETS_CLIENT,
      inject: [ConfigService],
      useFactory: async (
        configService: ConfigService<
          AppConfig & { sheets: SheetsConfig },
          true
        >,
      ) => {
        const client = new Auth.GoogleAuth({
          scopes: SCOPES,
          credentials: {
            client_email: configService.get('GCP_ACCOUNT_EMAIL'),
            private_key: configService.get('GCP_PRIVATE_KEY'),
            universe_domain: configService.get('sheets').GOOGLE_UNIVERSE_DOMAIN,
          },
        });

        // TODO: Unsure about type cast here
        const auth = (await client.getClient()) as Auth.Compute;
        return google.sheets({ version: 'v4', auth });
      },
    },
  ],
  exports: [SheetsService],
})
export class SheetsModule {}
