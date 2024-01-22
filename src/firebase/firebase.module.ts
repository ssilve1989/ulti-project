import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { App, cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { AppConfig } from '../app.config.js';
import { FIREBASE_APP, FIRESTORE } from './firebase.consts.js';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: FIREBASE_APP,
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) => {
        return initializeApp({
          credential: cert({
            clientEmail: configService.get('GCP_ACCOUNT_EMAIL'),
            privateKey: configService.get('GCP_PRIVATE_KEY'),
            projectId: configService.get('GCP_PROJECT_ID'),
          }),
        });
      },
    },
    {
      provide: FIRESTORE,
      inject: [FIREBASE_APP],
      useFactory: (app: App) => {
        const firestore = getFirestore(app);
        firestore.settings({ ignoreUndefinedProperties: true });
        return firestore;
      },
    },
  ],
  exports: [FIRESTORE],
})
export class FirebaseModule {}
