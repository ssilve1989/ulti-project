import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { LoggerModule } from 'nestjs-pino';
import { type AppConfig, configSchema } from './app.config.js';
import { AppController } from './app.controller.js';
import { AppSagas } from './app.sagas.js';
import { AppService } from './app.service.js';
import { DiscordModule } from './discord/discord.module.js';
import { FirebaseModule } from './firebase/firebase.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { SheetsModule } from './sheets/sheets.module.js';
import { SlashCommandsModule } from './slash-commands/slash-commands.module.js';

@Module({
  imports: [
    CqrsModule,
    DiscordModule,
    FirebaseModule,
    SheetsModule,
    SlashCommandsModule,
    JobsModule,
    ConfigModule.forRoot({
      cache: true,
      envFilePath: ['.env', '.env.development'],
      ignoreEnvFile: process.env.NODE_ENV === 'production',
      // Note: `passthrough` is required or the values parsed by the env files will not
      // be assigned to `process.env`. This means all ConfigModule.forFeature invocations will fail
      // since nothing will be on process.env that is sourced from .env files
      validate: (config) => configSchema.passthrough().parse(config),
    }),
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) => ({
        pinoHttp: {
          transport:
            configService.get('NODE_ENV') === 'production'
              ? undefined
              : { target: 'pino-pretty', options: { singleLine: true } },
          level: configService.get('LOG_LEVEL'),
        },
      }),
    }),
  ],
  providers: [AppService, AppSagas],
  controllers: [AppController],
})
export class AppModule {}
