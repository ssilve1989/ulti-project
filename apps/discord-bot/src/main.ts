import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { BETTER_AUTH_INSTANCE_TOKEN } from './api/auth/auth.decorators.js';
import { AppModule } from './app.module.js';
import { handler } from './utils/fastify-auth-route.js';

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
  app.enableCors({
    origin: ['http://localhost:4321', 'http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  });
  // app.setGlobalPrefix('api', { exclude: ['health'] });

  logger.log(`NodeJS Version: ${process.version}`);

  const fastifyInstance = app.getHttpAdapter().getInstance();

  fastifyInstance.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    handler: (request, reply) =>
      handler(request, reply, app.get(BETTER_AUTH_INSTANCE_TOKEN)),
  });

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();
