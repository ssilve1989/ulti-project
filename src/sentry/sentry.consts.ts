import * as Sentry from '@sentry/nestjs';

type CallbackFn = (scope: Sentry.Scope) => void;

/**
 * @deprecated Use the ErrorService provider instead
 * @param error The error to report
 * @param cb Optional function to modify the scope before sending the report
 */
export const sentryReport = (error: unknown, cb?: CallbackFn) => {
  const scope = Sentry.getCurrentScope();
  scope.captureException(error);
  cb?.(scope);
};
