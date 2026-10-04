import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import {
  type EncounterDocument,
  type ProgPointDocument,
  typedCollection,
} from '@ulti-project/shared';
import { CollectionReference, Firestore } from 'firebase-admin/firestore';
import { InjectFirestore } from '../firebase.decorators.js';

type CachedEncounter = EncounterDocument & { id: string };

@Injectable()
class EncountersCollection {
  private readonly collection: CollectionReference<EncounterDocument>;
  private readonly encounterCache = new Map<string, CachedEncounter>();
  private readonly progPointsCache = new Map<string, ProgPointDocument[]>();

  constructor(@InjectFirestore() firestore: Firestore) {
    this.collection = typedCollection<EncounterDocument>(
      firestore,
      'encounters',
    );
  }

  private progPointsRef(
    encounterId: string,
  ): CollectionReference<ProgPointDocument> {
    return typedCollection<ProgPointDocument>(
      this.collection.doc(encounterId),
      'prog-points',
    );
  }

  @SentryTraced()
  async getActiveEncounters(): Promise<(EncounterDocument & { id: string })[]> {
    // TODO: strengthen this type to be use the typesafe Encounters somehow?
    const snapshot = await this.collection.where('active', '==', true).get();
    return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
  }

  @SentryTraced()
  async getEncounter(
    encounterId: string,
  ): Promise<EncounterDocument | undefined> {
    const cacheKey = this.encounterCacheKey(encounterId);
    const cached = this.encounterCache.get(cacheKey);

    if (cached) {
      return { ...cached, id: encounterId };
    }

    const doc = await this.collection.doc(encounterId).get();
    const data = doc.data();

    if (data) {
      const encounterWithId = { ...data, id: doc.id };
      this.encounterCache.set(cacheKey, encounterWithId);
      return encounterWithId;
    }

    return undefined;
  }

  @SentryTraced()
  public async getProgPoints(
    encounterId: string,
  ): Promise<ProgPointDocument[]> {
    const allProgPoints = await this.getAllProgPoints(encounterId);
    return allProgPoints.filter((p) => p.active);
  }

  @SentryTraced()
  public async getAllProgPoints(
    encounterId: string,
  ): Promise<ProgPointDocument[]> {
    const cacheKey = this.progPointsCacheKey(encounterId);
    const cached = this.progPointsCache.get(cacheKey);

    if (cached) {
      return cached;
    }

    const progPointsCollection = this.progPointsRef(encounterId);

    const snapshot = await progPointsCollection.orderBy('order').get();

    const progPoints = snapshot.docs.map((doc) => doc.data());

    this.progPointsCache.set(cacheKey, progPoints);

    return progPoints;
  }

  private encounterCacheKey = (encounterId: string) =>
    `encounter:${encounterId}`;
  private progPointsCacheKey = (encounterId: string) =>
    `progpoints:${encounterId}`;
}

export { EncountersCollection };
