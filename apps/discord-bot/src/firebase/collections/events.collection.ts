import { Injectable } from '@nestjs/common';
import type { ScheduledEvent } from '@ulti-project/shared';
import { Firestore } from 'firebase-admin/firestore';
import { InjectFirestore } from '../firebase.decorators.js';
import { getGuildCollection } from './utils/firestore.js';

@Injectable()
class EventsCollection {
  constructor(@InjectFirestore() private readonly firestore: Firestore) {}

  async getEvents(guildId: string): Promise<ScheduledEvent[]> {
    const collection = getGuildCollection<ScheduledEvent>(this.firestore, {
      collectionName: 'events',
      guildId,
    });

    const snapshot = await collection.get();
    return snapshot.docs.map((doc) => doc.data());
  }

  async getEvent(
    guildId: string,
    eventId: string,
  ): Promise<ScheduledEvent | null> {
    const doc = await getGuildCollection<ScheduledEvent>(this.firestore, {
      collectionName: 'events',
      guildId,
    })
      .doc(eventId)
      .get();

    return doc.data() ?? null;
  }

  async createEvent(
    guildId: string,
    event: ScheduledEvent,
  ): Promise<ScheduledEvent> {
    const collection = getGuildCollection<ScheduledEvent>(this.firestore, {
      collectionName: 'events',
      guildId,
    });

    await collection.add(event);
    return event;
  }

  async updateEvent(
    guildId: string,
    eventId: string,
    event: ScheduledEvent,
  ): Promise<ScheduledEvent> {
    const collection = getGuildCollection<ScheduledEvent>(this.firestore, {
      collectionName: 'events',
      guildId,
    });

    await collection.doc(eventId).set(event, { merge: true });
    return event;
  }
}

export { EventsCollection };
