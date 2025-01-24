import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });

  const logger = app.get(Logger);
  app.useLogger(logger);
  app.flushLogs();
  app.enableShutdownHooks();

  logger.log(`Bun Version: ${Bun.version}`);
}

bootstrap();
