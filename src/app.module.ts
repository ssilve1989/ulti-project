import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller.js';
import { AppSagas } from './app.sagas.js';
import { AppService } from './app.service.js';
import { appConfig } from './config/app.js';
import { DiscordModule } from './discord/discord.module.js';
import { ErrorModule } from './error/error.module.js';
import { FirebaseModule } from './firebase/firebase.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { SheetsModule } from './sheets/sheets.module.js';
import { SlashCommandsModule } from './slash-commands/slash-commands.module.js';

@Module({
  imports: [
    CqrsModule,
    DiscordModule,
    ErrorModule,
    FirebaseModule,
    SheetsModule,
    SlashCommandsModule,
    JobsModule,
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          appConfig.NODE_ENV === 'production'
            ? undefined
            : { target: 'pino-pretty', options: { singleLine: true } },
        level: appConfig.LOG_LEVEL,
      },
    }),
  ],
  providers: [AppService, AppSagas],
  controllers: [AppController],
})
export class AppModule {}
