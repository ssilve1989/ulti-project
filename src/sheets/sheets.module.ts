import { sheets } from '@googleapis/sheets';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GoogleAuth } from 'google-auth-library';
import { AppConfig } from '../app.config.js';
import { SheetsConfig, sheetsConfig } from './sheets.config.js';
import { SHEETS_CLIENT } from './sheets.consts.js';
import { SheetsService } from './sheets.service.js';

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
        const client = new GoogleAuth({
          scopes: SCOPES,
          credentials: {
            client_email: configService.get('GCP_ACCOUNT_EMAIL'),
            private_key: configService.get('GCP_PRIVATE_KEY'),
            universe_domain: configService.get('sheets').GOOGLE_UNIVERSE_DOMAIN,
          },
        });

        // TODO: Unsure about type cast here. This code works
        // but googleapis is complaining about the types
        const auth = await client.getClient();
        return sheets({ version: 'v4', auth: auth as any });
      },
    },
  ],
  exports: [SheetsService],
})
export class SheetsModule {}
