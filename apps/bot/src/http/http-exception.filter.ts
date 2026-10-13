import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { BoardErrorBody } from '@ulti-project/shared';
import type { Response } from 'express';
import type { ErrorService } from '../error/error.service.js';

/** An expected outcome of a board request: its status, and its body. */
export class BoardHttpError extends HttpException {
  constructor(
    status: HttpStatus,
    readonly body: BoardErrorBody,
  ) {
    super(body, status);
  }
}

/** 404 not-found: the event, participant or route isn't there (or is another guild's). */
export const notFound = () =>
  new BoardHttpError(HttpStatus.NOT_FOUND, { reason: 'not-found' });

/** The reasons for the statuses the API answers without a `BoardHttpError`. */
const STATUS_REASONS: Partial<
  Record<number, Exclude<BoardErrorBody['reason'], 'claimed'>>
> = Object.freeze({
  [HttpStatus.BAD_REQUEST]: 'bad-request',
  [HttpStatus.NOT_FOUND]: 'not-found',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'payload-too-large',
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'unsupported-media-type',
  [HttpStatus.TOO_MANY_REQUESTS]: 'rate-limited',
});

/**
 * The body for a status that isn't from a `BoardHttpError`, e.g. Nest's 404
 * for an unknown route: `not-found`; `internal` for a status the API doesn't
 * otherwise send.
 */
export function bodyFor(status: number): BoardErrorBody {
  return { reason: STATUS_REASONS[status] ?? 'internal' };
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

  private toReply(exception: unknown): {
    status: number;
    body: BoardErrorBody;
  } {
    if (exception instanceof BoardHttpError) {
      return { status: exception.getStatus(), body: exception.body };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return { status, body: bodyFor(status) };
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
