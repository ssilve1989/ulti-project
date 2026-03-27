import type { CollectionReference, Firestore } from 'firebase-admin/firestore';
import type {
  EncounterDocument,
  ProgPointDocument,
} from '../../firebase/models/encounter.model.js';

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

export async function getNextProgPointOrder(
  db: Firestore,
  encounterId: string,
): Promise<number> {
  const snapshot = await progPointsRef(db, encounterId)
    .orderBy('order', 'desc')
    .limit(1)
    .get();
  if (snapshot.empty) return 0;
  return snapshot.docs[0].data().order + 1;
}

export async function addProgPoint(
  db: Firestore,
  encounterId: string,
  progPoint: ProgPointDocument,
): Promise<void> {
  await progPointsRef(db, encounterId).doc(progPoint.id).set(progPoint);
}

export async function updateProgPoint(
  db: Firestore,
  encounterId: string,
  progPointId: string,
  updates: Partial<ProgPointDocument>,
): Promise<void> {
  await progPointsRef(db, encounterId)
    .doc(progPointId)
    .set(updates, { merge: true });
}

export async function deleteProgPoint(
  db: Firestore,
  encounterId: string,
  progPointId: string,
): Promise<void> {
  const ref = progPointsRef(db, encounterId);
  const doc = await ref.doc(progPointId).get();
  const data = doc.data();
  if (!data) throw new Error(`Prog point ${progPointId} not found`);

  await ref.doc(progPointId).delete();

  // Reorder remaining prog points to close the gap
  const snapshot = await ref.where('order', '>', data.order).get();
  if (!snapshot.empty) {
    const batch = db.batch();
    for (const d of snapshot.docs) {
      batch.update(d.ref, { order: d.data().order - 1 });
    }
    await batch.commit();
  }
}

export async function reorderProgPoints(
  db: Firestore,
  encounterId: string,
  ordered: Array<{ id: string; order: number }>,
): Promise<void> {
  const ref = progPointsRef(db, encounterId);
  const batch = db.batch();
  for (const { id, order } of ordered) {
    batch.update(ref.doc(id), { order });
  }
  await batch.commit();
}
