import * as Sentry from '@sentry/node';

interface ReportOptions {
  userId?: string;
  extra?: Record<string, any>;
}

export const sentryReport = (
  error: unknown,
  { userId, extra }: ReportOptions,
) => {
  Sentry.withScope((scope) => {
    userId && scope.setUser({ id: userId });
    Sentry.captureException(error, { extra });
  });
};
