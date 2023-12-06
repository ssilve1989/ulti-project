import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { configSchema } from './app.config.js';
import { AppController } from './app.controller.js';
import { ClientModule } from './client/client.module.js';
import { InteractionsModule } from './interactions/interactions.module.js';
import { CommandsModule } from './commands/commands.module.js';

@Module({
  imports: [
    ClientModule,
    InteractionsModule,
    CommandsModule,
    ConfigModule.forRoot({
      validationSchema: configSchema,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport: { target: 'pino-pretty' },
      },
    }),
  ],
  controllers: [AppController],
})
export class AppModule {}
