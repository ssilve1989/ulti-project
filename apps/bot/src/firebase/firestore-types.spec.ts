import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { createFirestore } from '@ulti-project/shared';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';

// The bot builds Firestore values (Timestamp, FieldValue) from its own
// `firebase-admin` import, while the Firestore client comes from
// `@ulti-project/shared`. Firestore rejects values made by a different copy of
// the package, so both must resolve to the same installed instance.
describe('when the bot writes its own Firestore values through the shared client', () => {
  const firestore = createFirestore({
    clientEmail: 'test@example.iam.gserviceaccount.com',
    privateKey: generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    }).privateKey,
    projectId: 'test-project',
    appName: randomUUID(),
  });

  it('accepts them as valid document data', () => {
    const write = () =>
      firestore.batch().set(firestore.doc('signups/test'), {
        expiresAt: Timestamp.now(),
        updatedAt: FieldValue.serverTimestamp(),
      });

    expect(write).not.toThrow();
  });
});
