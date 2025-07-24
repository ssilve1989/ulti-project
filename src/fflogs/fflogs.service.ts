import { Injectable, Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import {
  catchError,
  EmptyError,
  first,
  from,
  mergeMap,
  type Observable,
  of,
} from 'rxjs';
import type { Encounter } from '../encounters/encounters.consts.js';
import { FFLOGS_REPORT_MAX_AGE_DAYS } from '../slash-commands/signup/signup.consts.js';
import { EncounterIds, expiredReportError } from './fflogs.consts.js';
import { InjectFFLogsSDKClient } from './fflogs.decorators.js';
import type { FFLogsSDKClient } from './fflogs.interfaces.js';
import type { EncounterRankingsQueryVariables } from './graphql/sdk.js';

@Injectable()
class FFLogsService {
  private readonly logger = new Logger(FFLogsService.name);

  constructor(
    @InjectFFLogsSDKClient() private readonly client: FFLogsSDKClient,
  ) {}

  hasClearedEncounter(
    encounter: Encounter,
    queryParams: EncounterRankingsQueryVariables,
  ): Observable<boolean> {
    const ids = EncounterIds.get(encounter);

    if (!ids) {
      throw new Error(`No FFLogs IDs configured for encounter ${encounter}`);
    }

    return from(ids).pipe(
      mergeMap(async (encounterId) => {
        const result = await this.client.encounterRankings({
          ...queryParams,
          encounterID: encounterId,
        });

        const hasKills =
          result.characterData?.character?.encounterRankings?.totalKills > 0;
        return hasKills;
      }, 5),
      first((hasKilled) => hasKilled),
      catchError((err) => {
        if (err instanceof EmptyError) {
          return of(false);
        }
        throw err;
      }),
    );
  }

  /**
   * Validates that an FFLogs report is not older than the specified number of days.
   *
   * Uses the report's end time (when the final pull occurred) rather than start time
   * to ensure the most recent activity meets the age threshold requirements.
   *
   * @param reportCode The FFLogs report code to validate
   * @param maxAgeDays Maximum age in days (defaults to FFLOGS_REPORT_MAX_AGE_DAYS constant)
   * @returns Promise that resolves to validation result with error message if invalid
   */
  async validateReportAge(
    reportCode: string,
    maxAgeDays = FFLOGS_REPORT_MAX_AGE_DAYS,
  ): Promise<{ isValid: boolean; errorMessage?: string; reportDate?: Date }> {
    try {
      const result = await this.client.reportData({ code: reportCode });

      if (!result.reportData?.report) {
        return {
          isValid: false,
          errorMessage:
            'Report not found. Please check the report code and try again.',
        };
      }

      const report = result.reportData.report;

      // FFLogs timestamps are in milliseconds
      const reportDate = new Date(report.endTime);
      const now = dayjs();
      const reportDayjs = dayjs(reportDate);
      const daysDifference = now.diff(reportDayjs, 'day');

      if (daysDifference > maxAgeDays) {
        return {
          isValid: false,
          errorMessage: expiredReportError(daysDifference, maxAgeDays),
          reportDate,
        };
      }

      return {
        isValid: true,
        reportDate,
      };
    } catch (error) {
      // Handle API errors gracefully - don't fail signup if FFLogs is down
      this.logger.warn('FFLogs API error during report validation:', error);
      return {
        isValid: true, // Allow signup to proceed if API is unavailable
        errorMessage:
          'Unable to validate report age due to API issues. Report will be reviewed manually.',
      };
    }
  }
}

export { FFLogsService };
