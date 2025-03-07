import { sheets } from '@googleapis/sheets';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Compute, GoogleAuth } from 'google-auth-library';
import type { AppConfig } from '../app.config.js';
import { type SheetsConfig, sheetsConfig } from './sheets.config.js';
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
        const { GOOGLE_UNIVERSE_DOMAIN, GOOGLE_APIS_HTTP2 } =
          configService.get<SheetsConfig>('sheets');

        const client = new GoogleAuth({
          scopes: SCOPES,
          credentials: {
            client_email: configService.get('GCP_ACCOUNT_EMAIL'),
            private_key: configService.get('GCP_PRIVATE_KEY'),
            universe_domain: GOOGLE_UNIVERSE_DOMAIN,
          },
        });

        const auth = (await client.getClient()) as Compute;
        return sheets({
          version: 'v4',
          auth,
          http2: GOOGLE_APIS_HTTP2,
          timeout: 10_000,
        });
      },
    },
  ],
  exports: [SheetsService],
})
export class SheetsModule {}
