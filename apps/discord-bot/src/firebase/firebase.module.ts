import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService, type ConfigType } from '@nestjs/config';
import { type App, cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { AppConfig } from '../app.config.js';
import { BlacklistCollection } from './collections/blacklist-collection.js';
import { JobCollection } from './collections/job/job.collection.js';
import { SettingsCollection } from './collections/settings-collection.js';
import { SignupCollection } from './collections/signup.collection.js';
import { firebaseConfig } from './firebase.config.js';
import { FIREBASE_APP, FIRESTORE } from './firebase.consts.js';

@Module({
  imports: [
    CacheModule.register({ ttl: 0 }),
    ConfigModule.forFeature(firebaseConfig),
  ],
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
      inject: [FIREBASE_APP, firebaseConfig.KEY],
      useFactory: (
        app: App,
        { FIRESTORE_DATABASE_ID }: ConfigType<typeof firebaseConfig>,
      ) => {
        const firestore = FIRESTORE_DATABASE_ID
          ? getFirestore(app, FIRESTORE_DATABASE_ID)
          : getFirestore(app);
        firestore.settings({ ignoreUndefinedProperties: true });
        return firestore;
      },
    },
    SignupCollection,
    SettingsCollection,
    BlacklistCollection,
    JobCollection,
  ],
  exports: [
    FIRESTORE,
    SignupCollection,
    SettingsCollection,
    BlacklistCollection,
    JobCollection,
  ],
})
export class FirebaseModule {}
