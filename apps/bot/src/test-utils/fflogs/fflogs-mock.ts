import { GraphQLError } from 'graphql';
import { ClientError } from 'graphql-request';
import type { FFLogsSDKClient } from '../../fflogs/fflogs.interfaces.js';
import type { ReportDataQuery } from '../../fflogs/graphql/sdk.js';

/**
 * Stands in for the FFLogs GraphQL API behind the SDK token, so the real
 * FFLogsService (including its report-age check) runs in flow specs. Responses
 * mirror the live API: an unknown report comes back as a GraphQL error, which
 * graphql-request throws as a ClientError.
 */
export class FFLogsMock implements Pick<FFLogsSDKClient, 'reportData'> {
  readonly requestedReports: string[] = [];
  /** report code → when its last pull ended (epoch ms) */
  private readonly reports = new Map<string, number>();
  private offline = false;

  /** A report whose last pull ended `daysAgo` days ago. */
  addReport(code: string, { daysAgo }: { daysAgo: number }): void {
    this.reports.set(
      code,
      Temporal.Now.instant().subtract({ hours: daysAgo * 24 })
        .epochMilliseconds,
    );
  }

  /** Every request fails the way a network outage does. */
  goOffline(): void {
    this.offline = true;
  }

  reportData({ code }: { code: string }): Promise<ReportDataQuery> {
    this.requestedReports.push(code);

    if (this.offline) {
      return Promise.reject(
        new TypeError('fetch failed', {
          cause: new Error('getaddrinfo ENOTFOUND www.fflogs.com'),
        }),
      );
    }

    const endTime = this.reports.get(code);
    if (endTime === undefined) {
      const body = {
        errors: [
          new GraphQLError('This report does not exist.', {
            path: ['reportData', 'report'],
          }),
        ],
        data: { reportData: { report: null } },
      };
      return Promise.reject(
        new ClientError(
          {
            ...body,
            status: 200,
            headers: new Headers(),
            body: JSON.stringify(body),
          },
          { query: 'query reportData($code: String!)', variables: { code } },
        ),
      );
    }

    return Promise.resolve({
      __typename: 'Query',
      reportData: {
        __typename: 'ReportData',
        report: {
          __typename: 'Report',
          code,
          startTime: endTime - 3_600_000,
          endTime,
          title: 'Flow test report',
        },
      },
    });
  }
}
