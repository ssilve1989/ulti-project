import type { NestExpressApplication } from '@nestjs/platform-express';
import { toNodeHandler } from 'better-auth/node';
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { BOARD_AUTH, type BoardAuth } from '../board-auth/auth.js';
import { ErrorService } from '../error/error.service.js';
import { HttpExceptionFilter } from './http-exception.filter.js';

/** What `express.json()` fails with for a body that isn't valid JSON. */
function isJsonParseError(error: unknown): boolean {
  return (
    error instanceof SyntaxError &&
    'type' in error &&
    error.type === 'entity.parse.failed'
  );
}

/** Answers a body that isn't valid JSON with 400 `invalid-json`; passes on anything else. */
function answerInvalidJson(
  error: unknown,
  _request: Request,
  response: Response,
  next: NextFunction,
): void {
  if (!isJsonParseError(error)) {
    next(error);
    return;
  }
  response.status(400).json({ reason: 'invalid-json' });
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
    response.status(404).json({ reason: 'not-found' });
  });
  app.use(express.json());
  app.use(answerInvalidJson);
}
