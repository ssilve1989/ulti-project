import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import {
  type CollectionReference,
  Firestore,
  Timestamp,
} from 'firebase-admin/firestore';
import { InjectFirestore } from '../firebase.decorators.js';
import type { HelperTeamSessionDocument } from '../models/helper-team.model.js';

@Injectable()
export class HelperTeamSessionCollection {
  private readonly collection: CollectionReference<HelperTeamSessionDocument>;

  constructor(@InjectFirestore() firestore: Firestore) {
    this.collection = firestore.collection(
      'helperTeamSessions',
    ) as CollectionReference<HelperTeamSessionDocument>;
  }

  public static getKey({
    guildId,
    sessionId,
  }: {
    guildId: string;
    sessionId: string;
  }) {
    return `${guildId}-${sessionId}`;
  }

  @SentryTraced()
  public async upsert(document: HelperTeamSessionDocument): Promise<void> {
    const key = HelperTeamSessionCollection.getKey(document);
    await this.collection
      .doc(key)
      .set({ ...document, updatedAt: Timestamp.now() }, { merge: true });
  }

  @SentryTraced()
  public async get(
    guildId: string,
    sessionId: string,
  ): Promise<HelperTeamSessionDocument | undefined> {
    const key = HelperTeamSessionCollection.getKey({ guildId, sessionId });
    const snapshot = await this.collection.doc(key).get();
    return snapshot.data();
  }

  @SentryTraced()
  public async getActiveForGuild(
    guildId: string,
  ): Promise<HelperTeamSessionDocument[]> {
    const snapshot = await this.collection
      .where('guildId', '==', guildId)
      .where('active', '==', true)
      .get();
    return snapshot.docs.map((doc) => doc.data());
  }

  @SentryTraced()
  public async getActiveForTeams(
    guildId: string,
    teamIds: string[],
  ): Promise<HelperTeamSessionDocument[]> {
    if (teamIds.length === 0) return [];
    const snapshot = await this.collection
      .where('guildId', '==', guildId)
      .where('teamId', 'in', teamIds)
      .where('active', '==', true)
      .get();
    return snapshot.docs.map((doc) => doc.data());
  }

  @SentryTraced()
  public async archive(guildId: string, sessionId: string): Promise<void> {
    const key = HelperTeamSessionCollection.getKey({ guildId, sessionId });
    await this.collection.doc(key).update({ active: false });
  }
}
