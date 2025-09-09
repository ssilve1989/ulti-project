import { Module } from '@nestjs/common';
import { type App, cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { appConfig } from '../config/app.js';
import { firebaseConfig } from '../config/firebase.js';
import { BlacklistCollection } from './collections/blacklist-collection.js';
import { EncountersCollection } from './collections/encounters-collection.js';
import { JobCollection } from './collections/job/job.collection.js';
import { SettingsCollection } from './collections/settings-collection.js';
import { SignupCollection } from './collections/signup.collection.js';
import { FIREBASE_APP, FIRESTORE } from './firebase.consts.js';

@Module({
  providers: [
    {
      provide: FIREBASE_APP,
      useFactory: () => {
        return initializeApp({
          credential: cert({
            clientEmail: appConfig.GCP_ACCOUNT_EMAIL,
            privateKey: appConfig.GCP_PRIVATE_KEY,
            projectId: appConfig.GCP_PROJECT_ID,
          }),
        });
      },
    },
    {
      provide: FIRESTORE,
      inject: [FIREBASE_APP],
      useFactory: (app: App) => {
        const firestore = firebaseConfig.FIRESTORE_DATABASE_ID
          ? getFirestore(app, firebaseConfig.FIRESTORE_DATABASE_ID)
          : getFirestore(app);
        firestore.settings({ ignoreUndefinedProperties: true });
        return firestore;
      },
    },
    SignupCollection,
    SettingsCollection,
    BlacklistCollection,
    JobCollection,
    EncountersCollection,
  ],
  exports: [
    FIRESTORE,
    SignupCollection,
    SettingsCollection,
    BlacklistCollection,
    JobCollection,
    EncountersCollection,
  ],
})
export class FirebaseModule {}
