import * as Sentry from '@sentry/node';

type ScopeFn = (scope: Sentry.Scope) => void;

/**
 * @param error The error to report
 * @param scopeFn Optional function to modify the scope before sending the report
 */
export const sentryReport = (error: unknown, scopeFn?: ScopeFn) => {
  const scope = Sentry.getCurrentScope();
  scope.captureException(error);
  scopeFn?.(scope);
};
