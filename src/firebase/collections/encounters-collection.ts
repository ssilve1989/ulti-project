import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import { CollectionReference, Firestore } from 'firebase-admin/firestore';
import { InjectFirestore } from '../firebase.decorators.js';
import type {
  EncounterDocument,
  ProgPointDocument,
} from '../models/encounter.model.js';

@Injectable()
class EncountersCollection {
  private readonly collection: CollectionReference<EncounterDocument>;
  private readonly logger = new Logger(EncountersCollection.name);

  constructor(
    @InjectFirestore() private readonly firestore: Firestore,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {
    this.collection = firestore.collection(
      'encounters',
    ) as CollectionReference<EncounterDocument>;
  }

  @SentryTraced()
  public async getEncounter(
    encounterId: string,
  ): Promise<EncounterDocument | undefined> {
    const cacheKey = this.encounterCacheKey(encounterId);
    const cached = await this.cacheManager.get<EncounterDocument>(cacheKey);

    if (cached) {
      return cached;
    }

    const doc = await this.collection.doc(encounterId).get();
    const data = doc.data();

    if (data) {
      await this.cacheManager.set(cacheKey, data);
    }

    return data;
  }

  @SentryTraced()
  public async upsertEncounter(
    encounterId: string,
    encounter: Partial<EncounterDocument>,
  ): Promise<void> {
    await this.collection.doc(encounterId).set(encounter, { merge: true });
    await this.updateEncounterCache(encounterId);
  }

  @SentryTraced()
  public async getProgPoints(
    encounterId: string,
  ): Promise<ProgPointDocument[]> {
    const cacheKey = this.progPointsCacheKey(encounterId);
    const cached = await this.cacheManager.get<ProgPointDocument[]>(cacheKey);

    if (cached) {
      return cached;
    }

    const progPointsCollection = this.collection
      .doc(encounterId)
      .collection('prog-points') as CollectionReference<ProgPointDocument>;

    const snapshot = await progPointsCollection
      .where('active', '==', true)
      .orderBy('order')
      .get();

    const progPoints = snapshot.docs.map((doc) => doc.data());

    await this.cacheManager.set(cacheKey, progPoints);

    return progPoints;
  }

  @SentryTraced()
  public async addProgPoint(
    encounterId: string,
    progPoint: ProgPointDocument,
  ): Promise<void> {
    const progPointsCollection = this.collection
      .doc(encounterId)
      .collection('prog-points') as CollectionReference<ProgPointDocument>;

    await progPointsCollection.doc(progPoint.id).set(progPoint);
    await this.updateProgPointsCache(encounterId);
  }

  @SentryTraced()
  public async updateProgPoint(
    encounterId: string,
    progPointId: string,
    updates: Partial<ProgPointDocument>,
  ): Promise<void> {
    const progPointsCollection = this.collection
      .doc(encounterId)
      .collection('prog-points') as CollectionReference<ProgPointDocument>;

    await progPointsCollection.doc(progPointId).set(updates, { merge: true });
    await this.updateProgPointsCache(encounterId);
  }

  @SentryTraced()
  public async removeProgPoint(
    encounterId: string,
    progPointId: string,
  ): Promise<void> {
    await this.updateProgPoint(encounterId, progPointId, { active: false });
  }

  @SentryTraced()
  public async reorderProgPoints(
    encounterId: string,
    progPointsWithNewOrder: Array<{ id: string; order: number }>,
  ): Promise<void> {
    const progPointsCollection = this.collection
      .doc(encounterId)
      .collection('prog-points') as CollectionReference<ProgPointDocument>;

    const batch = this.firestore.batch();

    for (const { id, order } of progPointsWithNewOrder) {
      const docRef = progPointsCollection.doc(id);
      batch.update(docRef, { order });
    }

    await batch.commit();
    await this.updateProgPointsCache(encounterId);
  }

  @SentryTraced()
  public async getNextProgPointOrder(encounterId: string): Promise<number> {
    const progPointsCollection = this.collection
      .doc(encounterId)
      .collection('prog-points') as CollectionReference<ProgPointDocument>;

    const snapshot = await progPointsCollection
      .orderBy('order', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) {
      return 0;
    }

    const lastProgPoint = snapshot.docs[0].data();
    return lastProgPoint.order + 1;
  }

  private async updateEncounterCache(encounterId: string): Promise<void> {
    const cacheKey = this.encounterCacheKey(encounterId);
    try {
      const doc = await this.collection.doc(encounterId).get();
      const data = doc.data();
      if (data) {
        await this.cacheManager.set(cacheKey, data);
      }
    } catch (error) {
      this.logger.warn(
        `Failed to update encounter cache: invalidating key ${cacheKey}`,
      );
      this.logger.error(error, 'Failed to update encounter cache');
      await this.cacheManager.del(cacheKey);
    }
  }

  private async updateProgPointsCache(encounterId: string): Promise<void> {
    const cacheKey = this.progPointsCacheKey(encounterId);
    try {
      // Clear cache first to avoid infinite recursion
      await this.cacheManager.del(cacheKey);

      const progPointsCollection = this.collection
        .doc(encounterId)
        .collection('prog-points') as CollectionReference<ProgPointDocument>;

      const snapshot = await progPointsCollection
        .where('active', '==', true)
        .orderBy('order')
        .get();

      const progPoints = snapshot.docs.map((doc) => doc.data());
      await this.cacheManager.set(cacheKey, progPoints);
    } catch (error) {
      this.logger.warn(
        `Failed to update prog points cache: invalidating key ${cacheKey}`,
      );
      this.logger.error(error, 'Failed to update prog points cache');
      await this.cacheManager.del(cacheKey);
    }
  }

  private encounterCacheKey = (encounterId: string) =>
    `encounter:${encounterId}`;
  private progPointsCacheKey = (encounterId: string) =>
    `progpoints:${encounterId}`;
}

export { EncountersCollection };
