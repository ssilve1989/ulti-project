import type { CollectionReference, Firestore } from 'firebase-admin/firestore';
import { guildCollection } from '../../firebase/firebase.paths.js';
import type {
  EncounterDocument,
  ProgPointDocument,
} from '../../firebase/models/encounter.model.js';

function encountersRef(
  db: Firestore,
  guildId: string,
): CollectionReference<EncounterDocument> {
  return guildCollection<EncounterDocument>(db, guildId, 'encounters');
}

function progPointsRef(
  db: Firestore,
  guildId: string,
  encounterId: string,
): CollectionReference<ProgPointDocument> {
  return encountersRef(db, guildId)
    .doc(encounterId)
    .collection('prog-points') as CollectionReference<ProgPointDocument>;
}

export async function getEncounter(
  db: Firestore,
  guildId: string,
  encounterId: string,
): Promise<(EncounterDocument & { id: string }) | undefined> {
  const doc = await encountersRef(db, guildId).doc(encounterId).get();
  const data = doc.data();
  return data ? { ...data, id: doc.id } : undefined;
}

export async function getAllActiveEncounters(
  db: Firestore,
  guildId: string,
): Promise<(EncounterDocument & { id: string })[]> {
  const snapshot = await encountersRef(db, guildId)
    .where('active', '==', true)
    .get();
  return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
}

export async function upsertEncounter(
  db: Firestore,
  guildId: string,
  encounterId: string,
  data: Partial<EncounterDocument>,
): Promise<void> {
  await encountersRef(db, guildId).doc(encounterId).set(data, { merge: true });
}

export async function getAllProgPoints(
  db: Firestore,
  guildId: string,
  encounterId: string,
): Promise<ProgPointDocument[]> {
  const snapshot = await progPointsRef(db, guildId, encounterId)
    .orderBy('order')
    .get();
  return snapshot.docs.map((doc) => doc.data());
}

export async function replaceProgPoints(
  db: Firestore,
  guildId: string,
  encounterId: string,
  progPoints: ProgPointDocument[],
): Promise<void> {
  const ref = progPointsRef(db, guildId, encounterId);
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
  guildId: string,
  encounterId: string,
  progPoint: ProgPointDocument,
): Promise<void> {
  await progPointsRef(db, guildId, encounterId)
    .doc(progPoint.id)
    .set(progPoint);
}
