import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    {
      bufferLogs: true,
    },
  );

  const logger = app.get(Logger);
  app.useLogger(logger);
  app.flushLogs();
  app.enableShutdownHooks();
  app.setGlobalPrefix('api', { exclude: ['health'] });

  logger.log(`NodeJS Version: ${process.version}`);

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();
