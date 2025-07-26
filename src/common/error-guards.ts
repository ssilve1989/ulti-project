/**
 * Error handling utilities
 */

/**
 * Safely extracts error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (Error.isError(error)) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object' && 'toString' in error) {
    return String(error);
  }

  return 'Unknown error occurred';
}

/**
 * Safely extracts error stack from unknown error
 */
export function getErrorStack(error: unknown): string | undefined {
  if (Error.isError(error)) {
    return error.stack;
  }
  return undefined;
}
