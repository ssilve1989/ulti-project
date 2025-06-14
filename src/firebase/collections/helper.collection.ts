import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import {
  type CollectionReference,
  type Firestore,
} from 'firebase-admin/firestore';
import { InjectFirestore } from '../firebase.decorators.js';
import { DocumentNotFoundException } from '../firebase.exceptions.js';
import type { HelperDocument } from '../models/helper.model.js';

@Injectable()
class HelperCollection {
  constructor(@InjectFirestore() private readonly firestore: Firestore) {}

  @SentryTraced()
  async getHelpers(guildId: string): Promise<HelperDocument[]> {
    const collection = this.getCollection(guildId);
    const snapshot = await collection.orderBy('name', 'asc').get();
    return snapshot.docs.map((doc) => doc.data());
  }

  @SentryTraced()
  async getHelper(guildId: string, helperId: string): Promise<HelperDocument> {
    const doc = await this.getCollection(guildId).doc(helperId).get();
    const data = doc.data();

    if (!data) {
      throw new DocumentNotFoundException({ guildId, helperId });
    }

    return data;
  }

  @SentryTraced()
  async upsertHelper(
    guildId: string,
    helper: Partial<HelperDocument> & { id: string },
  ): Promise<HelperDocument> {
    const collection = this.getCollection(guildId);
    const now = new Date();

    const helperData: HelperDocument = {
      ...helper,
      updatedAt: now,
      createdAt: helper.createdAt || now,
    } as HelperDocument;

    await collection.doc(helper.id).set(helperData, { merge: true });

    const updated = await collection.doc(helper.id).get();
    return updated.data()!;
  }

  @SentryTraced()
  async deleteHelper(guildId: string, helperId: string): Promise<void> {
    await this.getCollection(guildId).doc(helperId).delete();
  }

  @SentryTraced()
  async findHelperByDiscordId(
    guildId: string,
    discordId: string,
  ): Promise<HelperDocument | null> {
    const snapshot = await this.getCollection(guildId)
      .where('discordId', '==', discordId)
      .limit(1)
      .get();

    return snapshot.empty ? null : snapshot.docs[0].data();
  }

  @SentryTraced()
  async findHelpersByJob(
    guildId: string,
    job: string,
  ): Promise<HelperDocument[]> {
    const snapshot = await this.getCollection(guildId)
      .where('availableJobs', 'array-contains-any', [{ job }])
      .get();

    return snapshot.docs.map((doc) => doc.data());
  }

  private getCollection(guildId: string): CollectionReference<HelperDocument> {
    return this.firestore.collection(
      `guilds/${guildId}/helpers`,
    ) as CollectionReference<HelperDocument>;
  }
}

export { HelperCollection };
