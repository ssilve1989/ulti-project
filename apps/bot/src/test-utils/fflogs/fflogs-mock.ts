import { expiredReportError } from '../../fflogs/fflogs.consts.js';
import type { FFLogsService } from '../../fflogs/fflogs.service.js';
import { FFLOGS_REPORT_MAX_AGE_DAYS } from '../../slash-commands/signup/signup.consts.js';

/** How the next checked report should look. `unreachable` mirrors the real service, which lets signups through for manual review. */
type ReportAge = 'recent' | 'expired' | 'unreachable';

export class FFLogsMock implements Pick<FFLogsService, 'validateReportAge'> {
  reportAge: ReportAge = 'recent';
  readonly checkedReports: string[] = [];

  validateReportAge(
    reportCode: string,
  ): ReturnType<FFLogsService['validateReportAge']> {
    this.checkedReports.push(reportCode);

    switch (this.reportAge) {
      case 'recent':
        return Promise.resolve({ isValid: true, reportDate: new Date() });
      case 'expired':
        return Promise.resolve({
          isValid: false,
          errorMessage: expiredReportError(
            FFLOGS_REPORT_MAX_AGE_DAYS + 7,
            FFLOGS_REPORT_MAX_AGE_DAYS,
          ),
        });
      case 'unreachable':
        return Promise.resolve({
          isValid: true,
          errorMessage:
            'Unable to validate report age due to API issues. Report will be reviewed manually.',
        });
    }
  }
}
