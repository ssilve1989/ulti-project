import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GraphQLClient } from 'graphql-request';
import type { AppConfig } from '../app.config.js';
import { getFflogsSdkToken } from './fflogs.consts.js';
import { FFLogsService } from './fflogs.service.js';
import { getSdk } from './graphql/sdk.js';

@Module({
  imports: [ConfigModule],
  providers: [
    FFLogsService,
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
  exports: [FFLogsService],
})
class FfLogsModule {}

export { FfLogsModule };
