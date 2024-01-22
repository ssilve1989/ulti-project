import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { LoggerModule } from 'nestjs-pino';
import { AppConfig, configSchema } from './app.config.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { SlashCommandsModule } from './slash-commands/slash-commands.module.js';
import { DiscordModule } from './discord/discord.module.js';
import { FirebaseModule } from './firebase/firebase.module.js';
import { SignupModule } from './signups/signup.module.js';
import { StatusModule } from './status/status.module.js';
import { SettingsModule } from './settings/settings.module.js';

@Module({
  imports: [
    CqrsModule,
    DiscordModule,
    FirebaseModule,
    SettingsModule,
    SignupModule,
    SlashCommandsModule,
    StatusModule,
    ConfigModule.forRoot({
      validationSchema: configSchema,
      cache: true,
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
