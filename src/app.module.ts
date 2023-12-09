import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { configSchema } from './app.config.js';
import { AppController } from './app.controller.js';
import { ClientModule } from './client/client.module.js';
import { InteractionsModule } from './interactions/interactions.module.js';
import { CommandsModule } from './commands/commands.module.js';
import { FirebaseModule } from './firebase/firebase.module.js';
import { firestoreSchema } from './firebase/firebase.config.js';
import { SignupModule } from './signups/signup.module.js';

@Module({
  imports: [
    ClientModule,
    FirebaseModule,
    InteractionsModule,
    CommandsModule,
    SignupModule,
    ConfigModule.forRoot({
      validationSchema: configSchema.concat(firestoreSchema),
      cache: true,
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
