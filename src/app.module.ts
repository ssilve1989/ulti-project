import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { LoggerModule } from 'nestjs-pino';
import { AppConfig, configSchema } from './app.config.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { LookupModule } from './commands/lookup/lookup.module.js';
import { SettingsModule } from './commands/settings/settings.module.js';
import { SignupModule } from './commands/signup/signup.module.js';
import { SlashCommandsModule } from './commands/slash-commands.module.js';
import { StatusModule } from './commands/status/status.module.js';
import { DiscordModule } from './discord/discord.module.js';
import { FirebaseModule } from './firebase/firebase.module.js';
import { SheetsModule } from './sheets/sheets.module.js';

@Module({
  imports: [
    CqrsModule,
    DiscordModule,
    SheetsModule,
    FirebaseModule,
    LookupModule,
    SettingsModule,
    SignupModule,
    SlashCommandsModule,
    StatusModule,
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
  ],
  providers: [AppService],
  controllers: [AppController],
})
export class AppModule {}
