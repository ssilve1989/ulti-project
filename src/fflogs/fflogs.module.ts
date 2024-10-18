import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GraphQLClient } from 'graphql-request';
import type { AppConfig } from '../app.config.js';
import { getFflogsSdkToken } from './fflogs.consts.js';
import { FfLogsService } from './fflogs.service.js';
import { getSdk } from './graphql/sdk.js';

@Module({
  imports: [ConfigModule],
  providers: [
    FfLogsService,
    {
      provide: getFflogsSdkToken(),
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) => {
        const client = new GraphQLClient(
          'https://www.fflogs.com/api/v2/client',
          {
            headers: {
              Authorization: `Bearer ${config.get('FFLOGS_API_ACCESS_TOKEN')}`,
            },
          },
        );

        return getSdk(client);
      },
    },
  ],
  exports: [FfLogsService],
})
class FfLogsModule {}

export { FfLogsModule };
