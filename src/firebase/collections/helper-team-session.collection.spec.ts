import { Test } from '@nestjs/testing';
import type {
  CollectionReference,
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
  Firestore,
  Query,
  QuerySnapshot,
} from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { createAutoMock } from '../../test-utils/mock-factory.js';
import { FIRESTORE } from '../firebase.consts.js';
import { HelperTeamSessionCollection } from './helper-team-session.collection.js';

describe('HelperTeamSessionCollection', () => {
  let collection: HelperTeamSessionCollection;
  let firestoreCollection: Mocked<CollectionReference<DocumentData>>;
  let doc: Mocked<DocumentReference<DocumentData>>;

  beforeEach(async () => {
    doc = createAutoMock() as unknown as Mocked<
      DocumentReference<DocumentData>
    >;

    firestoreCollection = {
      doc: vi.fn().mockReturnValue(doc),
      where: vi.fn(),
    } as unknown as Mocked<CollectionReference<DocumentData>>;

    const firestore = {
      collection: vi.fn().mockReturnValue(firestoreCollection),
    } as unknown as Firestore;

    const fixture = await Test.createTestingModule({
      providers: [
        HelperTeamSessionCollection,
        { provide: FIRESTORE, useValue: firestore },
      ],
    })
      .useMocker(createAutoMock)
      .compile();

    collection = fixture.get(HelperTeamSessionCollection);
  });

  it('generates composite key', () => {
    expect(
      HelperTeamSessionCollection.getKey({ guildId: 'g1', sessionId: 's1' }),
    ).toBe('g1-s1');
  });

  it('upserts a session document', async () => {
    const now = Timestamp.now();
    await collection.upsert({
      guildId: 'g1',
      sessionId: 's1',
      teamId: 'alpha',
      active: true,
      dayOfWeek: 5,
      startTime: '20:00',
      durationMinutes: 120,
      timezone: 'America/Denver',
      createdAt: now,
      updatedAt: now,
    });
    expect(doc.set).toHaveBeenCalled();
  });

  it('gets a session by id', async () => {
    const sessionData = {
      guildId: 'g1',
      sessionId: 's1',
      teamId: 'alpha',
      active: true,
    };
    doc.get.mockResolvedValueOnce({
      data: () => sessionData,
    } as unknown as DocumentSnapshot);

    const result = await collection.get('g1', 's1');
    expect(result).toEqual(sessionData);
  });

  it('gets active sessions for a guild', async () => {
    const sessionData = { guildId: 'g1', sessionId: 's1', active: true };
    const query = {
      where: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({
        docs: [{ data: () => sessionData }],
      } as unknown as QuerySnapshot),
    };
    firestoreCollection.where.mockReturnValue(
      query as unknown as Query<DocumentData>,
    );

    const result = await collection.getActiveForGuild('g1');
    expect(result).toEqual([sessionData]);
  });

  it('archives a session', async () => {
    await collection.archive('g1', 's1');
    expect(doc.update).toHaveBeenCalledWith({ active: false });
  });
});
