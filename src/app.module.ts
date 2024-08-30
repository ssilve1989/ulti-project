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
import { LookupModule } from './lookup/lookup.module.js';
import { RemoveRoleModule } from './remove-role/remove-role.module.js';
import { SentryModule } from './sentry/sentry.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { SheetsModule } from './sheets/sheets.module.js';
import { SignupModule } from './signup/signup.module.js';
import { SlashCommandsModule } from './slash-commands/slash-commands.module.js';
import { StatusModule } from './status/status.module.js';
import { TurboProgModule } from './turboprog/turbo-prog.module.js';

@Module({
  imports: [
    RemoveRoleModule,
    CqrsModule,
    DiscordModule,
    SheetsModule,
    FirebaseModule,
    LookupModule,
    SettingsModule,
    SignupModule,
    SlashCommandsModule,
    StatusModule,
    TurboProgModule,
    ConfigModule.forRoot({
      cache: true,
      envFilePath: ['.env', '.env.development'],
      ignoreEnvFile: process.env.NODE_ENV === 'production',
      validationSchema: configSchema,
    }),
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) => ({
        pinoHttp: {
          transport:
            configService.get('NODE_ENV') === 'production'
              ? undefined
              : { target: 'pino-pretty' },
          level: configService.get('LOG_LEVEL'),
        },
      }),
    }),
    SentryModule,
  ],
  providers: [AppService, AppSagas],
  controllers: [AppController],
})
export class AppModule {}
