import type { App } from 'firebase-admin/app';
import { cert, initializeApp } from 'firebase-admin/app';
import type { Firestore } from 'firebase-admin/firestore';
import { getFirestore } from 'firebase-admin/firestore';

export interface CreateFirestoreConfig {
  clientEmail: string;
  privateKey: string;
  projectId: string;
  databaseId?: string;
  appName?: string;
}

export function createFirestore(config: CreateFirestoreConfig): Firestore {
  const app: App = initializeApp(
    {
      credential: cert({
        clientEmail: config.clientEmail,
        privateKey: config.privateKey,
        projectId: config.projectId,
      }),
    },
    config.appName ?? '[DEFAULT]',
  );

  const firestore = config.databaseId
    ? getFirestore(app, config.databaseId)
    : getFirestore(app);

  firestore.settings({ ignoreUndefinedProperties: true });

  return firestore;
}
