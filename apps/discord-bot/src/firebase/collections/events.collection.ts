import { Injectable, Logger } from '@nestjs/common';
import type {
  GetEventsQuery as BaseGetEventsQuery,
  ScheduledEvent,
} from '@ulti-project/shared';
import { Firestore, type Query } from 'firebase-admin/firestore';
import { InjectFirestore } from '../firebase.decorators.js';
import { getGuildCollection } from './utils/firestore.js';

// Temporary interface until shared package is rebuilt
interface GetEventsQuery extends BaseGetEventsQuery {
  cursor?: string;
}

@Injectable()
class EventsCollection {
  private readonly logger = new Logger(EventsCollection.name);

  constructor(@InjectFirestore() private readonly firestore: Firestore) {}

  async getEvents(guildId: string): Promise<ScheduledEvent[]> {
    const collection = getGuildCollection<ScheduledEvent>(this.firestore, {
      collectionName: 'events',
      guildId,
    });

    const snapshot = await collection.get();
    return snapshot.docs.map((doc) => doc.data());
  }

  async getEventsFiltered(query: GetEventsQuery): Promise<{
    events: ScheduledEvent[];
    nextCursor?: string;
    hasMore: boolean;
  }> {
    const collection = getGuildCollection<ScheduledEvent>(this.firestore, {
      collectionName: 'events',
      guildId: query.guildId,
    });

    let firestoreQuery: Query<ScheduledEvent> = collection;

    // Apply equality filters
    if (query.teamLeaderId) {
      firestoreQuery = firestoreQuery.where(
        'teamLeaderId',
        '==',
        query.teamLeaderId,
      );
    }
    if (query.status) {
      firestoreQuery = firestoreQuery.where('status', '==', query.status);
    }
    if (query.encounter) {
      firestoreQuery = firestoreQuery.where('encounter', '==', query.encounter);
    }

    // Apply date range filters
    if (query.dateFrom && query.dateTo) {
      firestoreQuery = firestoreQuery
        .where('scheduledTime', '>=', query.dateFrom)
        .where('scheduledTime', '<=', query.dateTo);
    } else if (query.dateFrom) {
      firestoreQuery = firestoreQuery.where(
        'scheduledTime',
        '>=',
        query.dateFrom,
      );
    } else if (query.dateTo) {
      firestoreQuery = firestoreQuery.where(
        'scheduledTime',
        '<=',
        query.dateTo,
      );
    }

    // Order by scheduledTime (required for cursor pagination)
    firestoreQuery = firestoreQuery.orderBy('scheduledTime', 'desc');

    // Apply cursor-based pagination
    if (query.cursor) {
      try {
        // Decode the cursor to get the document snapshot reference
        const cursorData = JSON.parse(
          Buffer.from(query.cursor, 'base64').toString(),
        );
        const cursorDoc = await collection.doc(cursorData.id).get();
        if (cursorDoc.exists) {
          firestoreQuery = firestoreQuery.startAfter(cursorDoc);
        }
      } catch (error) {
        // Invalid cursor, ignore and start from beginning
        this.logger.warn('Invalid cursor provided:', error);
      }
    }

    // Request one extra document to check if there are more results
    const snapshot = await firestoreQuery.limit(query.limit + 1).get();
    const docs = snapshot.docs;

    // Check if there are more results
    const hasMore = docs.length > query.limit;

    // Remove the extra document if it exists
    const resultDocs = hasMore ? docs.slice(0, query.limit) : docs;
    const events = resultDocs.map((doc) => doc.data());

    // Generate next cursor if there are more results
    let nextCursor: string | undefined;
    if (hasMore && resultDocs.length > 0) {
      const lastDoc = resultDocs[resultDocs.length - 1];
      const cursorData = {
        id: lastDoc.id,
        scheduledTime: lastDoc.data().scheduledTime,
      };
      nextCursor = Buffer.from(JSON.stringify(cursorData)).toString('base64');
    }

    return {
      events,
      nextCursor,
      hasMore,
    };
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

    await collection.doc(event.id).set(event);
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

  async deleteEvent(guildId: string, eventId: string): Promise<void> {
    const collection = getGuildCollection<ScheduledEvent>(this.firestore, {
      collectionName: 'events',
      guildId,
    });

    await collection.doc(eventId).delete();
  }
}

export { EventsCollection };
