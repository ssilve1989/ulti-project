import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ErrorService } from '../error/error.service.js';

/** An expected outcome of a board request: its status, and a body `{ reason, ...extra }`. */
export class BoardHttpError extends HttpException {
  readonly body: { readonly reason: string } & Record<string, unknown>;

  constructor(
    status: HttpStatus,
    reason: string,
    extra: Record<string, unknown> = {},
  ) {
    const body = { reason, ...extra };
    super(body, status);
    this.body = body;
  }
}

/** The body for an HttpException that isn't ours, e.g. Nest's 404 for an unknown route: `not-found`. */
function reasonFor(status: number): string {
  return (HttpStatus[status] ?? 'error').toLowerCase().replaceAll('_', '-');
}

/**
 * Answers every failed request with JSON: an HttpException with its status,
 * anything else with 500 `{ reason: 'internal' }` after reporting it.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly errorService: ErrorService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.toReply(exception);
    // a streamed response (SSE) has already sent its status and headers
    if (response.headersSent) {
      response.end();
      return;
    }
    response.status(status).json(body);
  }

  private toReply(exception: unknown): { status: number; body: object } {
    if (exception instanceof BoardHttpError) {
      return { status: exception.getStatus(), body: exception.body };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return { status, body: { reason: reasonFor(status) } };
    }
    this.errorService.captureError(exception, {
      message: 'HTTP request failed',
    });
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { reason: 'internal' },
    };
  }
}
