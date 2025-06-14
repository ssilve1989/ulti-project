import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import {
  type CollectionReference,
  type Firestore,
} from 'firebase-admin/firestore';
import { InjectFirestore } from '../firebase.decorators.js';
import { DocumentNotFoundException } from '../firebase.exceptions.js';
import type { HelperAbsenceDocument } from '../models/helper.model.js';

@Injectable()
class HelperAbsenceCollection {
  constructor(@InjectFirestore() private readonly firestore: Firestore) {}

  @SentryTraced()
  async getAbsences(
    guildId: string,
    helperId: string,
  ): Promise<HelperAbsenceDocument[]> {
    const collection = this.getCollection(guildId, helperId);
    const snapshot = await collection.orderBy('startDate', 'desc').get();
    return snapshot.docs.map((doc) => doc.data());
  }

  @SentryTraced()
  async getAbsence(
    guildId: string,
    helperId: string,
    absenceId: string,
  ): Promise<HelperAbsenceDocument> {
    const doc = await this.getCollection(guildId, helperId)
      .doc(absenceId)
      .get();
    const data = doc.data();

    if (!data) {
      throw new DocumentNotFoundException({ guildId, helperId, absenceId });
    }

    return data;
  }

  @SentryTraced()
  async createAbsence(
    guildId: string,
    helperId: string,
    absence: Omit<HelperAbsenceDocument, 'id' | 'helperId' | 'createdAt'>,
  ): Promise<HelperAbsenceDocument> {
    const collection = this.getCollection(guildId, helperId);
    const docRef = collection.doc();
    const now = new Date();

    const absenceData: HelperAbsenceDocument = {
      ...absence,
      id: docRef.id,
      helperId,
      createdAt: now,
    };

    await docRef.set(absenceData);
    return absenceData;
  }

  @SentryTraced()
  async updateAbsence(
    guildId: string,
    helperId: string,
    absenceId: string,
    updates: Partial<HelperAbsenceDocument>,
  ): Promise<HelperAbsenceDocument> {
    const collection = this.getCollection(guildId, helperId);
    const docRef = collection.doc(absenceId);

    await docRef.update(updates);

    const updated = await docRef.get();
    const data = updated.data();

    if (!data) {
      throw new DocumentNotFoundException({ guildId, helperId, absenceId });
    }

    return data;
  }

  @SentryTraced()
  async deleteAbsence(
    guildId: string,
    helperId: string,
    absenceId: string,
  ): Promise<void> {
    await this.getCollection(guildId, helperId).doc(absenceId).delete();
  }

  @SentryTraced()
  async getActiveAbsences(
    guildId: string,
    helperId: string,
    date: Date = new Date(),
  ): Promise<HelperAbsenceDocument[]> {
    const collection = this.getCollection(guildId, helperId);
    const snapshot = await collection
      .where('startDate', '<=', date)
      .where('endDate', '>=', date)
      .get();

    return snapshot.docs.map((doc) => doc.data());
  }

  private getCollection(
    guildId: string,
    helperId: string,
  ): CollectionReference<HelperAbsenceDocument> {
    return this.firestore.collection(
      `guilds/${guildId}/helpers/${helperId}/absences`,
    ) as CollectionReference<HelperAbsenceDocument>;
  }
}

export { HelperAbsenceCollection };
