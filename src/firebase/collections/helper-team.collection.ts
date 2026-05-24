import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import {
  type CollectionReference,
  Firestore,
  Timestamp,
} from 'firebase-admin/firestore';
import { InjectFirestore } from '../firebase.decorators.js';
import type { HelperTeamDocument } from '../models/helper-team.model.js';

@Injectable()
export class HelperTeamCollection {
  private readonly collection: CollectionReference<HelperTeamDocument>;

  constructor(@InjectFirestore() firestore: Firestore) {
    this.collection = firestore.collection(
      'helperTeams',
    ) as CollectionReference<HelperTeamDocument>;
  }

  public static getKey({
    guildId,
    teamId,
  }: {
    guildId: string;
    teamId: string;
  }) {
    return `${guildId}-${teamId}`;
  }

  @SentryTraced()
  public async upsert(document: HelperTeamDocument): Promise<void> {
    const key = HelperTeamCollection.getKey(document);
    await this.collection
      .doc(key)
      .set({ ...document, updatedAt: Timestamp.now() }, { merge: true });
  }

  @SentryTraced()
  public async get(
    guildId: string,
    teamId: string,
  ): Promise<HelperTeamDocument | undefined> {
    const key = HelperTeamCollection.getKey({ guildId, teamId });
    const snapshot = await this.collection.doc(key).get();
    return snapshot.data();
  }

  @SentryTraced()
  public async getByMemberRole(
    guildId: string,
    memberRoleId: string,
  ): Promise<HelperTeamDocument | undefined> {
    // NOTE: requires composite Firestore index on (guildId ASC, memberRoleId ASC, active ASC)
    const snapshot = await this.collection
      .where('guildId', '==', guildId)
      .where('memberRoleId', '==', memberRoleId)
      .where('active', '==', true)
      .get();
    return snapshot.docs[0]?.data();
  }

  @SentryTraced()
  public async getActiveForGuild(
    guildId: string,
  ): Promise<HelperTeamDocument[]> {
    const snapshot = await this.collection
      .where('guildId', '==', guildId)
      .where('active', '==', true)
      .get();
    return snapshot.docs.map((doc) => doc.data());
  }

  @SentryTraced()
  public async archive(guildId: string, teamId: string): Promise<void> {
    const key = HelperTeamCollection.getKey({ guildId, teamId });
    const now = Timestamp.now();
    const deleteAt = Timestamp.fromDate(
      new Date(now.toDate().getTime() + 30 * 24 * 60 * 60 * 1000),
    );
    await this.collection.doc(key).update({
      active: false,
      archivedAt: now,
      deleteAt,
    });
  }
}
