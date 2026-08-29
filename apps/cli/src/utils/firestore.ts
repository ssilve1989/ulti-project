import type {
  EncounterDocument,
  ProgPointDocument,
} from '@ulti-project/shared';
import type { CollectionReference, Firestore } from 'firebase-admin/firestore';

function encountersRef(db: Firestore): CollectionReference<EncounterDocument> {
  return db.collection('encounters') as CollectionReference<EncounterDocument>;
}

function progPointsRef(
  db: Firestore,
  encounterId: string,
): CollectionReference<ProgPointDocument> {
  return encountersRef(db)
    .doc(encounterId)
    .collection('prog-points') as CollectionReference<ProgPointDocument>;
}

export async function getEncounter(
  db: Firestore,
  encounterId: string,
): Promise<(EncounterDocument & { id: string }) | undefined> {
  const doc = await encountersRef(db).doc(encounterId).get();
  const data = doc.data();
  return data ? { ...data, id: doc.id } : undefined;
}

export async function getAllActiveEncounters(
  db: Firestore,
): Promise<(EncounterDocument & { id: string })[]> {
  const snapshot = await encountersRef(db).where('active', '==', true).get();
  return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
}

export async function upsertEncounter(
  db: Firestore,
  encounterId: string,
  data: Partial<EncounterDocument>,
): Promise<void> {
  await encountersRef(db).doc(encounterId).set(data, { merge: true });
}

export async function getAllProgPoints(
  db: Firestore,
  encounterId: string,
): Promise<ProgPointDocument[]> {
  const snapshot = await progPointsRef(db, encounterId).orderBy('order').get();
  return snapshot.docs.map((doc) => doc.data());
}

export async function replaceProgPoints(
  db: Firestore,
  encounterId: string,
  progPoints: ProgPointDocument[],
): Promise<void> {
  const ref = progPointsRef(db, encounterId);
  const existing = await ref.get();

  const batch = db.batch();
  for (const doc of existing.docs) {
    batch.delete(doc.ref);
  }
  for (const progPoint of progPoints) {
    batch.set(ref.doc(progPoint.id), progPoint);
  }
  await batch.commit();
}

export async function addProgPoint(
  db: Firestore,
  encounterId: string,
  progPoint: ProgPointDocument,
): Promise<void> {
  await progPointsRef(db, encounterId).doc(progPoint.id).set(progPoint);
}
