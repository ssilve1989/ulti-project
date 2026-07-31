import { Injectable, Logger } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import { CollectionReference, Firestore } from 'firebase-admin/firestore';
import { InjectFirestore } from '../firebase.decorators.js';
import { guildCollection } from '../firebase.paths.js';
import type {
  EncounterDocument,
  ProgPointDocument,
} from '../models/encounter.model.js';

@Injectable()
class EncountersCollection {
  private readonly logger = new Logger(EncountersCollection.name);
  private readonly cache = new Map<string, unknown>();

  constructor(@InjectFirestore() private readonly firestore: Firestore) {}

  @SentryTraced()
  async getActiveEncounters(
    guildId: string,
  ): Promise<(EncounterDocument & { id: string })[]> {
    // TODO: strengthen this type to be use the typesafe Encounters somehow?
    const snapshot = await this.getCollection(guildId)
      .where('active', '==', true)
      .get();
    return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
  }

  @SentryTraced()
  async getEncounter(
    guildId: string,
    encounterId: string,
  ): Promise<EncounterDocument | undefined> {
    const cacheKey = this.encounterCacheKey(guildId, encounterId);
    const cached = this.cache.get(cacheKey) as EncounterDocument | undefined;

    if (cached) {
      return { ...cached, id: encounterId };
    }

    const doc = await this.getCollection(guildId).doc(encounterId).get();
    const data = doc.data();

    if (data) {
      const encounterWithId = { ...data, id: doc.id };
      this.cache.set(cacheKey, encounterWithId);
      return encounterWithId;
    }

    return undefined;
  }

  @SentryTraced()
  public async upsertEncounter(
    guildId: string,
    encounterId: string,
    encounter: Partial<EncounterDocument>,
  ): Promise<void> {
    await this.getCollection(guildId)
      .doc(encounterId)
      .set(encounter, { merge: true });
    await this.updateEncounterCache(guildId, encounterId);
  }

  @SentryTraced()
  public async getProgPoints(
    guildId: string,
    encounterId: string,
  ): Promise<ProgPointDocument[]> {
    const allProgPoints = await this.getAllProgPoints(guildId, encounterId);
    return allProgPoints.filter((p) => p.active);
  }

  @SentryTraced()
  public async getAllProgPoints(
    guildId: string,
    encounterId: string,
  ): Promise<ProgPointDocument[]> {
    const cacheKey = this.progPointsCacheKey(guildId, encounterId);
    const cached = this.cache.get(cacheKey) as ProgPointDocument[] | undefined;

    if (cached) {
      return cached;
    }

    const snapshot = await this.getProgPointsCollection(guildId, encounterId)
      .orderBy('order')
      .get();

    const progPoints = snapshot.docs.map((doc) => doc.data());

    this.cache.set(cacheKey, progPoints);

    return progPoints;
  }

  @SentryTraced()
  public async addProgPoint(
    guildId: string,
    encounterId: string,
    progPoint: ProgPointDocument,
  ): Promise<void> {
    await this.getProgPointsCollection(guildId, encounterId)
      .doc(progPoint.id)
      .set(progPoint);
    await this.updateProgPointsCache(guildId, encounterId);
  }

  @SentryTraced()
  public async updateProgPoint(
    guildId: string,
    encounterId: string,
    progPointId: string,
    updates: Partial<ProgPointDocument>,
  ): Promise<void> {
    await this.getProgPointsCollection(guildId, encounterId)
      .doc(progPointId)
      .set(updates, { merge: true });
    await this.updateProgPointsCache(guildId, encounterId);
  }

  @SentryTraced()
  public async deactivateProgPoint(
    guildId: string,
    encounterId: string,
    progPointId: string,
  ): Promise<void> {
    await this.updateProgPoint(guildId, encounterId, progPointId, {
      active: false,
    });
  }

  @SentryTraced()
  public async deleteProgPoint(
    guildId: string,
    encounterId: string,
    progPointId: string,
  ): Promise<void> {
    const progPointsCollection = this.getProgPointsCollection(
      guildId,
      encounterId,
    );

    // Get the prog point to delete to find its order
    const progPointDoc = await progPointsCollection.doc(progPointId).get();
    const progPointToDelete = progPointDoc.data();

    if (!progPointToDelete) {
      throw new Error(`Prog point ${progPointId} not found`);
    }

    // Delete the document
    await progPointsCollection.doc(progPointId).delete();

    // Reorder remaining prog points to fill the gap
    await this.reorderAfterDeletion(
      guildId,
      encounterId,
      progPointToDelete.order,
    );

    await this.updateProgPointsCache(guildId, encounterId);
  }

  @SentryTraced()
  public async toggleProgPointActive(
    guildId: string,
    encounterId: string,
    progPointId: string,
  ): Promise<void> {
    const progPointsCollection = this.getProgPointsCollection(
      guildId,
      encounterId,
    );

    const doc = await progPointsCollection.doc(progPointId).get();
    const progPoint = doc.data();

    if (!progPoint) {
      throw new Error(`Prog point ${progPointId} not found`);
    }

    await progPointsCollection
      .doc(progPointId)
      .update({ active: !progPoint.active });

    await this.updateProgPointsCache(guildId, encounterId);
  }

  @SentryTraced()
  public async reorderProgPoints(
    guildId: string,
    encounterId: string,
    progPointsWithNewOrder: Array<{ id: string; order: number }>,
  ): Promise<void> {
    const progPointsCollection = this.getProgPointsCollection(
      guildId,
      encounterId,
    );

    const batch = this.firestore.batch();

    for (const { id, order } of progPointsWithNewOrder) {
      const docRef = progPointsCollection.doc(id);
      batch.update(docRef, { order });
    }

    await batch.commit();
    await this.updateProgPointsCache(guildId, encounterId);
  }

  @SentryTraced()
  public async getNextProgPointOrder(
    guildId: string,
    encounterId: string,
  ): Promise<number> {
    const snapshot = await this.getProgPointsCollection(guildId, encounterId)
      .orderBy('order', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) {
      return 0;
    }

    const lastProgPoint = snapshot.docs[0].data();
    return lastProgPoint.order + 1;
  }

  @SentryTraced()
  private async reorderAfterDeletion(
    guildId: string,
    encounterId: string,
    deletedOrder: number,
  ): Promise<void> {
    // Get all prog points with order greater than the deleted one
    const snapshot = await this.getProgPointsCollection(guildId, encounterId)
      .where('order', '>', deletedOrder)
      .get();

    if (snapshot.empty) {
      return; // No reordering needed
    }

    const batch = this.firestore.batch();

    // Decrease the order of all prog points after the deleted one by 1
    for (const doc of snapshot.docs) {
      const progPoint = doc.data();
      batch.update(doc.ref, { order: progPoint.order - 1 });
    }

    await batch.commit();
  }

  private async updateEncounterCache(
    guildId: string,
    encounterId: string,
  ): Promise<void> {
    const cacheKey = this.encounterCacheKey(guildId, encounterId);
    try {
      const doc = await this.getCollection(guildId).doc(encounterId).get();
      const data = doc.data();
      if (data) {
        this.cache.set(cacheKey, { ...data, id: doc.id });
      }
    } catch (error) {
      this.logger.warn(
        `Failed to update encounter cache: invalidating key ${cacheKey}`,
      );
      this.logger.error(error, 'Failed to update encounter cache');
      this.cache.delete(cacheKey);
    }
  }

  private async updateProgPointsCache(
    guildId: string,
    encounterId: string,
  ): Promise<void> {
    const cacheKey = this.progPointsCacheKey(guildId, encounterId);
    try {
      // Clear cache first to avoid infinite recursion
      this.cache.delete(cacheKey);

      const snapshot = await this.getProgPointsCollection(guildId, encounterId)
        .orderBy('order')
        .get();

      const progPoints = snapshot.docs.map((doc) => doc.data());
      this.cache.set(cacheKey, progPoints);
    } catch (error) {
      this.logger.warn(
        `Failed to update prog points cache: invalidating key ${cacheKey}`,
      );
      this.logger.error(error, 'Failed to update prog points cache');
      this.cache.delete(cacheKey);
    }
  }

  private getCollection(
    guildId: string,
  ): CollectionReference<EncounterDocument> {
    return guildCollection<EncounterDocument>(
      this.firestore,
      guildId,
      'encounters',
    );
  }

  private getProgPointsCollection(
    guildId: string,
    encounterId: string,
  ): CollectionReference<ProgPointDocument> {
    return this.getCollection(guildId)
      .doc(encounterId)
      .collection('prog-points') as CollectionReference<ProgPointDocument>;
  }

  // Cache keys are guild-scoped so two guilds that share an encounter id don't
  // serve each other's prog points.
  private encounterCacheKey = (guildId: string, encounterId: string) =>
    `encounter:${guildId}:${encounterId}`;
  private progPointsCacheKey = (guildId: string, encounterId: string) =>
    `progpoints:${guildId}:${encounterId}`;
}

export { EncountersCollection };
