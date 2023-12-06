import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from './app.config.js';
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    cors: true,
  });

  app.useLogger(app.get(Logger));

  const configService = app.get<ConfigService<AppConfig, true>>(ConfigService);

  app.enableShutdownHooks();

  await app.listen(configService.get('PORT'));
}

bootstrap();
