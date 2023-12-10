import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { AppConfig, configSchema } from './app.config.js';
import { AppController } from './app.controller.js';
import { ClientModule } from './client/client.module.js';
import { InteractionsModule } from './interactions/interactions.module.js';
import { CommandsModule } from './commands/commands.module.js';
import { FirebaseModule } from './firebase/firebase.module.js';
import { firestoreSchema } from './firebase/firebase.config.js';
import { SignupModule } from './signups/signup.module.js';
import { AppService } from './app.service.js';
import { CqrsModule } from '@nestjs/cqrs';

@Module({
  imports: [
    ClientModule,
    CommandsModule,
    CqrsModule,
    FirebaseModule,
    InteractionsModule,
    SignupModule,
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
