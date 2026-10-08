import type { NestExpressApplication } from '@nestjs/platform-express';
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
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
 * Sets up the bot's HTTP app, in production and in flow specs alike. The app
 * is created with `bodyParser: false`, so the JSON parser is added here: after
 * anything that must read the raw body (better-auth's handler).
 */
export function configureHttpApp(app: NestExpressApplication): void {
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new HttpExceptionFilter(app.get(ErrorService)));
  app.use(express.json());
  app.use(answerInvalidJson);
}
