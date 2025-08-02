import { Module } from '@nestjs/common';
import { GraphQLClient } from 'graphql-request';
import { appConfig } from '../config/app.js';
import { getFflogsSdkToken } from './fflogs.consts.js';
import { FFLogsService } from './fflogs.service.js';
import { getSdk } from './graphql/sdk.js';

@Module({
  providers: [
    FFLogsService,
    {
      provide: getFflogsSdkToken(),
      useFactory: () => {
        const client = new GraphQLClient(
          'https://www.fflogs.com/api/v2/client',
          {
            headers: {
              Authorization: `Bearer ${appConfig.FFLOGS_API_ACCESS_TOKEN}`,
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
