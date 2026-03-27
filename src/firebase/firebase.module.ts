import { Module } from '@nestjs/common';
import { appConfig } from '../config/app.js';
import { firebaseConfig } from '../config/firebase.js';
import { BlacklistCollection } from './collections/blacklist-collection.js';
import { EncountersCollection } from './collections/encounters-collection.js';
import { JobCollection } from './collections/job/job.collection.js';
import { SettingsCollection } from './collections/settings-collection.js';
import { SignupCollection } from './collections/signup.collection.js';
import { createFirestore } from './create-firestore.js';
import { FIRESTORE } from './firebase.consts.js';

@Module({
  providers: [
    {
      provide: FIRESTORE,
      useFactory: () =>
        createFirestore({
          clientEmail: appConfig.GCP_ACCOUNT_EMAIL,
          privateKey: appConfig.GCP_PRIVATE_KEY,
          projectId: appConfig.GCP_PROJECT_ID,
          databaseId: firebaseConfig.FIRESTORE_DATABASE_ID,
        }),
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
