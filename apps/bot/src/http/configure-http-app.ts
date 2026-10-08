import type { NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import { ErrorService } from '../error/error.service.js';
import { HttpExceptionFilter } from './http-exception.filter.js';

/**
 * Sets up the bot's HTTP app, in production and in flow specs alike. The app
 * is created with `bodyParser: false`, so the JSON parser is added here: after
 * anything that must read the raw body (better-auth's handler).
 */
export function configureHttpApp(app: NestExpressApplication): void {
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new HttpExceptionFilter(app.get(ErrorService)));
  app.use(express.json());
}
