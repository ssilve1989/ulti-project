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

// Matches .firebaserc; the Firestore emulator only ever serves this one
// project and its (default) database, regardless of what config or the
// active env file says.
const EMULATOR_PROJECT_ID = 'demo-ulti-project';

export function createFirestore(config: CreateFirestoreConfig): Firestore {
  const isEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

  if (!isEmulator && process.env.NODE_ENV !== 'production') {
    console.warn(
      '[createFirestore] FIRESTORE_EMULATOR_HOST is not set — connecting to LIVE Firestore with real credentials. Run `pnpm emulators` and check apps/*/.env.development if this is unexpected.',
    );
  }

  const app: App = initializeApp(
    isEmulator
      ? { projectId: EMULATOR_PROJECT_ID }
      : {
          credential: cert({
            clientEmail: config.clientEmail,
            privateKey: config.privateKey,
            projectId: config.projectId,
          }),
        },
  );

  // Any config field that should differ between real per-env Firestore and
  // the emulator gets branched here — this is the one place that has to
  // know the difference, so a new field needs a deliberate decision here
  // rather than a silent mismatch discovered later.
  const firestore = isEmulator
    ? getFirestore(app)
    : config.databaseId
      ? getFirestore(app, config.databaseId)
      : getFirestore(app);

  firestore.settings({ ignoreUndefinedProperties: true });

  return firestore;
}
