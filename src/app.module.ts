import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { LoggerModule } from 'nestjs-pino';
import { AppConfig, configSchema } from './app.config.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { CommandsModule } from './commands/commands.module.js';
import { DiscordModule } from './discord/discord.module.js';
import { firestoreSchema } from './firebase/firebase.config.js';
import { FirebaseModule } from './firebase/firebase.module.js';
import { InteractionsModule } from './interactions/interactions.module.js';
import { SignupModule } from './signups/signup.module.js';
import { StatusModule } from './status/status.module.js';

@Module({
  imports: [
    CqrsModule,
    DiscordModule,
    CommandsModule,
    CqrsModule,
    FirebaseModule,
    InteractionsModule,
    SignupModule,
    StatusModule,
    ConfigModule.forRoot({
      validationSchema: configSchema.concat(firestoreSchema),
      cache: true,
    }),
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) => ({
        pinoHttp: {
          transport: { target: 'pino-pretty' },
          level: configService.get('LOG_LEVEL'),
        },
      }),
    }),
  ],
  providers: [AppService],
  controllers: [AppController],
})
export class AppModule {}
