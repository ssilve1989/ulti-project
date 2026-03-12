import { NestFactory } from '@nestjs/core';
import * as Sentry from '@sentry/nestjs';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';

const app = await NestFactory.createApplicationContext(AppModule, {
  bufferLogs: true,
});

const logger = app.get(Logger);
app.useLogger(logger);
app.flushLogs();
app.enableShutdownHooks();

logger.log(`NodeJS Version: ${process.version}`);

process.on('unhandledRejection', (error) => {
  logger.error(error);
  Sentry.captureException(error);
});
