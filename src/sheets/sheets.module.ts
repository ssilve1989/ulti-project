import { sheets } from '@googleapis/sheets';
import { Module } from '@nestjs/common';
import { Compute, GoogleAuth } from 'google-auth-library';
import { appConfig } from '../config/app.js';
import { sheetsConfig } from '../config/sheets.js';
import { EncountersModule } from '../encounters/encounters.module.js';
import { SHEETS_CLIENT } from './sheets.consts.js';
import { SheetsService } from './sheets.service.js';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

@Module({
  imports: [EncountersModule],
  providers: [
    SheetsService,
    {
      provide: SHEETS_CLIENT,
      useFactory: async () => {
        const client = new GoogleAuth({
          scopes: SCOPES,
          credentials: {
            client_email: appConfig.GCP_ACCOUNT_EMAIL,
            private_key: appConfig.GCP_PRIVATE_KEY,
            universe_domain: sheetsConfig.GOOGLE_UNIVERSE_DOMAIN,
          },
        });

        const auth = (await client.getClient()) as Compute;
        return sheets({
          version: 'v4',
          auth,
          http2: sheetsConfig.GOOGLE_APIS_HTTP2,
          timeout: 10_000,
        });
      },
    },
  ],
  exports: [SheetsService],
})
export class SheetsModule {}
