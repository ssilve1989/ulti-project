import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import {
  type CollectionReference,
  Firestore,
  Timestamp,
} from 'firebase-admin/firestore';
import { InjectFirestore } from '../firebase.decorators.js';
import type { HelperAbsenceDocument } from '../models/helper-team.model.js';

export function calculateAbsenceExpiresAt(absenceEnd: Date): Timestamp {
  return Timestamp.fromDate(
    new Date(absenceEnd.getTime() + 7 * 24 * 60 * 60 * 1000),
  );
}

@Injectable()
export class HelperAbsenceCollection {
  private readonly collection: CollectionReference<HelperAbsenceDocument>;

  constructor(@InjectFirestore() firestore: Firestore) {
    this.collection = firestore.collection(
      'helperAbsences',
    ) as CollectionReference<HelperAbsenceDocument>;
  }

  public static getKey({
    guildId,
    absenceId,
  }: {
    guildId: string;
    absenceId: string;
  }) {
    return `${guildId}-${absenceId}`;
  }

  @SentryTraced()
  public async create(absence: HelperAbsenceDocument): Promise<void> {
    const key = HelperAbsenceCollection.getKey(absence);
    await this.collection.doc(key).set(absence);
  }

  @SentryTraced()
  public async getFutureForUser(
    guildId: string,
    discordId: string,
    now: Date,
  ): Promise<HelperAbsenceDocument[]> {
    const snapshot = await this.collection
      .where('guildId', '==', guildId)
      .where('discordId', '==', discordId)
      .where('expiresAt', '>', Timestamp.fromDate(now))
      .get();
    return snapshot.docs.map((doc) => doc.data());
  }

  @SentryTraced()
  public async getActiveForGuild(
    guildId: string,
    now: Date,
  ): Promise<HelperAbsenceDocument[]> {
    const snapshot = await this.collection
      .where('guildId', '==', guildId)
      .where('expiresAt', '>', Timestamp.fromDate(now))
      .get();
    return snapshot.docs.map((doc) => doc.data());
  }

  @SentryTraced()
  public async getForOccurrence(
    guildId: string,
    teamId: string,
    sessionId: string,
    occurrenceStart: Timestamp,
  ): Promise<HelperAbsenceDocument[]> {
    const snapshot = await this.collection
      .where('guildId', '==', guildId)
      .where('teamId', '==', teamId)
      .where('sessionId', '==', sessionId)
      .where('occurrenceStart', '==', occurrenceStart)
      .get();
    return snapshot.docs.map((doc) => doc.data());
  }

  @SentryTraced()
  public async remove(guildId: string, absenceId: string): Promise<void> {
    const key = HelperAbsenceCollection.getKey({ guildId, absenceId });
    await this.collection.doc(key).delete();
  }
}
