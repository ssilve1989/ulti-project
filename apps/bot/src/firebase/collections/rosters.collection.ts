import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import { type Encounter, typedCollection } from '@ulti-project/shared';
import { Firestore } from 'firebase-admin/firestore';
import { InjectFirestore } from '../firebase.decorators.js';
import { type RosterDocument, rosterDocId } from '../models/roster.model.js';

/** Squads' rosters: `events/{eventId}/rosters/{encounter}-{squadId}`. */
@Injectable()
export class RostersCollection {
  constructor(@InjectFirestore() private readonly firestore: Firestore) {}

  @SentryTraced()
  public async list(eventId: string): Promise<RosterDocument[]> {
    const snapshot = await this.rosters(eventId).get();
    return snapshot.docs.map((doc) => doc.data());
  }

  @SentryTraced()
  public async get(
    eventId: string,
    encounter: Encounter,
    squadId: string,
  ): Promise<RosterDocument | undefined> {
    return (
      await this.rosters(eventId).doc(rosterDocId(encounter, squadId)).get()
    ).data();
  }

  private rosters(eventId: string) {
    return typedCollection<RosterDocument>(
      this.firestore,
      `events/${eventId}/rosters`,
    );
  }
}
