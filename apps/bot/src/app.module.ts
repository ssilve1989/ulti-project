import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { LoggerModule } from 'nestjs-pino';
import { AppService } from './app.service.js';
import { DiscordModule } from './discord/discord.module.js';
import { ErrorModule } from './error/error.module.js';
import { FirebaseModule } from './firebase/firebase.module.js';
import { HttpModule } from './http/http.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { requestLogOptions } from './logging/request-log.js';
import { SheetsModule } from './sheets/sheets.module.js';
import { SlashCommandsModule } from './slash-commands/slash-commands.module.js';

@Module({
  imports: [
    CqrsModule,
    DiscordModule,
    ErrorModule,
    FirebaseModule,
    HttpModule,
    SheetsModule,
    SlashCommandsModule,
    JobsModule,
    LoggerModule.forRoot({ pinoHttp: requestLogOptions }),
  ],
  providers: [AppService],
})
export class AppModule {}
