import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as Sentry from '@sentry/nestjs';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { boardConfig } from './config/board.js';
import { configureHttpApp } from './http/configure-http-app.js';

const app = await NestFactory.create<NestExpressApplication>(AppModule, {
  bufferLogs: true,
  bodyParser: false,
});

const logger = app.get(Logger);
app.useLogger(logger);
app.flushLogs();
app.enableShutdownHooks();
configureHttpApp(app);
await app.listen(boardConfig.PORT, '0.0.0.0');

logger.log(`NodeJS Version: ${process.version}`);

process.on('unhandledRejection', async (error) => {
  logger.error(error);
  Sentry.captureException(error);
  await Sentry.flush(2000);
  process.exit(1);
});
