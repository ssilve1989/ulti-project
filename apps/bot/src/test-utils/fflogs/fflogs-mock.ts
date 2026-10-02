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

  /**
   * A report whose last pull ended at local noon `daysAgo` calendar days ago,
   * so FFLogsService's day count is exact whatever the clock or DST.
   */
  addReport(code: string, { daysAgo }: { daysAgo: number }): void {
    const endTime = Temporal.Now.plainDateISO()
      .subtract({ days: daysAgo })
      .toZonedDateTime({
        timeZone: Temporal.Now.timeZoneId(),
        plainTime: '12:00',
      }).epochMilliseconds;
    this.reports.set(code, endTime);
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
