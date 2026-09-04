import type { App } from 'firebase-admin/app';
import { cert, initializeApp } from 'firebase-admin/app';
import type { Firestore } from 'firebase-admin/firestore';
import { getFirestore } from 'firebase-admin/firestore';

export interface CreateFirestoreConfig {
  clientEmail: string;
  privateKey: string;
  projectId: string;
  databaseId?: string;
}

export function createFirestore(config: CreateFirestoreConfig): Firestore {
  const isEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

  const app: App = initializeApp(
    isEmulator
      ? { projectId: 'demo-ulti-project' }
      : {
          credential: cert({
            clientEmail: config.clientEmail,
            privateKey: config.privateKey,
            projectId: config.projectId,
          }),
        },
  );

  // The emulator only serves the (default) database; a real per-env
  // databaseId from config would point at a database that doesn't exist
  // there, so it's only honored against live Firestore.
  const firestore =
    !isEmulator && config.databaseId
      ? getFirestore(app, config.databaseId)
      : getFirestore(app);

  firestore.settings({ ignoreUndefinedProperties: true });

  return firestore;
}
