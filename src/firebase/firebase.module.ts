import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { App, cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { firestoreConfig } from './firebase.config.js';
import { FIREBASE_APP, FIRESTORE } from './firebase.consts.js';

@Module({
  imports: [ConfigModule.forFeature(firestoreConfig)],
  providers: [
    {
      provide: FIREBASE_APP,
      inject: [firestoreConfig.KEY],
      useFactory: (config: ConfigType<typeof firestoreConfig>) => {
        return initializeApp({ credential: cert(config) });
      },
    },
    {
      provide: FIRESTORE,
      inject: [FIREBASE_APP],
      useFactory: (app: App) => getFirestore(app),
    },
  ],
  exports: [FIRESTORE],
})
export class FirebaseModule {}
