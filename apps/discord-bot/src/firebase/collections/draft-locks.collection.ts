import { Injectable, Logger } from '@nestjs/common';
import type { DraftLock } from '@ulti-project/shared';
import type { Firestore } from 'firebase-admin/firestore';
import { Observable } from 'rxjs';
import { InjectFirestore } from '../firebase.decorators.js';
import { getGuildCollection } from './utils/firestore.js';

@Injectable()
export class DraftLocksCollection {
  private readonly logger = new Logger(DraftLocksCollection.name);

  constructor(@InjectFirestore() private readonly firestore: Firestore) {}

  async getEventLocks(guildId: string, eventId: string): Promise<DraftLock[]> {
    const collection = getGuildCollection<DraftLock>(this.firestore, {
      collectionName: 'draft_locks',
      guildId,
    });

    const snapshot = await collection
      .where('eventId', '==', eventId)
      .where('expiresAt', '>', new Date())
      .get();

    return snapshot.docs.map((doc) => doc.data());
  }

  async createLock(guildId: string, lock: DraftLock): Promise<DraftLock> {
    const collection = getGuildCollection<DraftLock>(this.firestore, {
      collectionName: 'draft_locks',
      guildId,
    });

    await collection.doc(lock.id).set(lock);
    return lock;
  }

  async getLock(guildId: string, lockId: string): Promise<DraftLock | null> {
    const collection = getGuildCollection<DraftLock>(this.firestore, {
      collectionName: 'draft_locks',
      guildId,
    });

    const doc = await collection.doc(lockId).get();
    return doc.data() ?? null;
  }

  async findLockByParticipant(
    guildId: string,
    eventId: string,
    participantId: string,
    participantType: string,
  ): Promise<DraftLock | null> {
    const collection = getGuildCollection<DraftLock>(this.firestore, {
      collectionName: 'draft_locks',
      guildId,
    });

    const snapshot = await collection
      .where('eventId', '==', eventId)
      .where('participantId', '==', participantId)
      .where('participantType', '==', participantType)
      .where('expiresAt', '>', new Date())
      .limit(1)
      .get();

    return snapshot.empty ? null : snapshot.docs[0].data();
  }

  async releaseLock(guildId: string, lockId: string): Promise<void> {
    const collection = getGuildCollection<DraftLock>(this.firestore, {
      collectionName: 'draft_locks',
      guildId,
    });

    await collection.doc(lockId).delete();
  }

  async releaseTeamLeaderLocks(
    guildId: string,
    eventId: string,
    teamLeaderId: string,
  ): Promise<DraftLock[]> {
    const collection = getGuildCollection<DraftLock>(this.firestore, {
      collectionName: 'draft_locks',
      guildId,
    });

    const snapshot = await collection
      .where('eventId', '==', eventId)
      .where('lockedBy', '==', teamLeaderId)
      .get();

    const locks = snapshot.docs.map((doc) => doc.data());

    // Delete all locks in a batch
    const batch = this.firestore.batch();
    for (const doc of snapshot.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();

    return locks;
  }

  async cleanupExpiredLocks(guildId: string): Promise<number> {
    const collection = getGuildCollection<DraftLock>(this.firestore, {
      collectionName: 'draft_locks',
      guildId,
    });

    const snapshot = await collection
      .where('expiresAt', '<=', new Date())
      .get();

    if (snapshot.empty) {
      return 0;
    }

    const batch = this.firestore.batch();
    for (const doc of snapshot.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();

    this.logger.log(
      `Cleaned up ${snapshot.docs.length} expired locks for guild ${guildId}`,
    );
    return snapshot.docs.length;
  }

  getEventLocksStream(
    guildId: string,
    eventId: string,
  ): Observable<DraftLock[]> {
    const collection = getGuildCollection<DraftLock>(this.firestore, {
      collectionName: 'draft_locks',
      guildId,
    });

    const query = collection
      .where('eventId', '==', eventId)
      .where('expiresAt', '>', new Date());

    return new Observable<DraftLock[]>((subscriber) => {
      const unsubscribe = query.onSnapshot(
        (snapshot) => {
          const locks = snapshot.docs.map((doc) => doc.data());
          subscriber.next(locks);
        },
        (error) => {
          this.logger.error(
            `Error in locks stream for event ${eventId}:`,
            error,
          );
          subscriber.error(error);
        },
      );

      // Return cleanup function
      return () => unsubscribe();
    });
  }
}
