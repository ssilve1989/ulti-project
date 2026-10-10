import type { NestExpressApplication } from '@nestjs/platform-express';
import type { BoardErrorBody } from '@ulti-project/shared';
import { toNodeHandler } from 'better-auth/node';
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { BOARD_AUTH, type BoardAuth } from '../board-auth/auth.js';
import { ErrorService } from '../error/error.service.js';
import { bodyFor, HttpExceptionFilter } from './http-exception.filter.js';

/**
 * The status and kind of a request `express.json()` refused (body-parser's
 * errors carry both: e.g. 413 `entity.too.large`, 415
 * `charset.unsupported`), or undefined for any other error.
 */
function bodyParserRefusal(
  error: unknown,
): { status: number; type: string } | undefined {
  if (
    !(error instanceof Error) ||
    !('type' in error) ||
    typeof error.type !== 'string' ||
    !('status' in error) ||
    typeof error.status !== 'number' ||
    error.status < 400 ||
    error.status >= 500
  ) {
    return undefined;
  }
  return { status: error.status, type: error.type };
}

/**
 * Answers a request body `express.json()` refused with its status and JSON
 * `{ reason }`: 400 `invalid-json` for one that isn't valid JSON. Passes on
 * anything else.
 */
export function answerBodyParserErrors(
  error: unknown,
  _request: Request,
  response: Response,
  next: NextFunction,
): void {
  const refusal = bodyParserRefusal(error);
  if (refusal === undefined) {
    next(error);
    return;
  }
  const body: BoardErrorBody =
    refusal.type === 'entity.parse.failed'
      ? { reason: 'invalid-json' }
      : bodyFor(refusal.status);
  response.status(refusal.status).json(body);
}

/**
 * The better-auth routes the board uses. Everything else better-auth serves
 * stays unmounted: `/update-user` would let a signed-in user set their own
 * `discordId` and act as anyone.
 *
 * They're mounted on the raw Express instance, ahead of Nest's middleware and
 * routes, so better-auth's own error responses bypass `HttpExceptionFilter`
 * and pino-http's request log. That's by design: OAuth failures are
 * redirects, not API errors.
 */
const BOARD_AUTH_ROUTES = Object.freeze([
  { method: 'post', path: '/api/auth/sign-in/social' },
  { method: 'get', path: '/api/auth/callback/discord' },
  { method: 'get', path: '/api/auth/get-session' },
  { method: 'post', path: '/api/auth/sign-out' },
] as const);

/**
 * Sets up the bot's HTTP app, in production and in flow specs alike. The app
 * is created with `bodyParser: false`, so the JSON parser is added here: after
 * anything that must read the raw body (better-auth's handler).
 */
export function configureHttpApp(app: NestExpressApplication): void {
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new HttpExceptionFilter(app.get(ErrorService)));
  const server = app.getHttpAdapter().getInstance();
  const handleAuth = toNodeHandler(app.get<BoardAuth>(BOARD_AUTH));
  for (const { method, path } of BOARD_AUTH_ROUTES) {
    server[method](path, handleAuth);
  }
  server.all('/api/auth/{*rest}', (_request: Request, response: Response) => {
    response.status(404).json(bodyFor(404));
  });
  app.use(express.json());
  app.use(answerBodyParserErrors);
}
