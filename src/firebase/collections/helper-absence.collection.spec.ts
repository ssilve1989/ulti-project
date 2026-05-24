import { Test } from '@nestjs/testing';
import type {
  CollectionReference,
  DocumentData,
  DocumentReference,
  Firestore,
  Query,
  QuerySnapshot,
} from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { createAutoMock } from '../../test-utils/mock-factory.js';
import { FIRESTORE } from '../firebase.consts.js';
import {
  calculateAbsenceExpiresAt,
  HelperAbsenceCollection,
} from './helper-absence.collection.js';

describe('HelperAbsenceCollection', () => {
  let collection: HelperAbsenceCollection;
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
        HelperAbsenceCollection,
        { provide: FIRESTORE, useValue: firestore },
      ],
    })
      .useMocker(createAutoMock)
      .compile();

    collection = fixture.get(HelperAbsenceCollection);
  });

  it('generates composite key', () => {
    expect(
      HelperAbsenceCollection.getKey({ guildId: 'g1', absenceId: 'a1' }),
    ).toBe('g1-a1');
  });

  it('calculates absence TTL 7 days after end', () => {
    const expiresAt = calculateAbsenceExpiresAt(
      new Date('2026-05-20T04:00:00.000Z'),
    );
    expect(expiresAt.toDate().toISOString()).toBe('2026-05-27T04:00:00.000Z');
  });

  it('creates an absence document', async () => {
    const now = Timestamp.now();
    await collection.create({
      guildId: 'g1',
      absenceId: 'a1',
      discordId: 'user-1',
      type: 'session',
      teamId: 'alpha',
      sessionId: 's1',
      occurrenceStart: now,
      occurrenceEnd: now,
      createdAt: now,
      updatedAt: now,
      expiresAt: now,
    });
    expect(doc.set).toHaveBeenCalled();
  });

  it('gets future absences for a user', async () => {
    const absenceData = { guildId: 'g1', absenceId: 'a1', discordId: 'user-1' };
    const now = Timestamp.now();

    const innerQuery = {
      where: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({
        docs: [{ data: () => absenceData }],
      } as unknown as QuerySnapshot),
    };
    firestoreCollection.where.mockReturnValue(
      innerQuery as unknown as Query<DocumentData>,
    );

    const result = await collection.getFutureForUser(
      'g1',
      'user-1',
      now.toDate(),
    );
    expect(result).toEqual([absenceData]);
  });

  it('gets all future absences for a guild', async () => {
    const absenceData = { guildId: 'g1', absenceId: 'a2', discordId: 'user-2' };

    const innerQuery = {
      where: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({
        docs: [{ data: () => absenceData }],
      } as unknown as QuerySnapshot),
    };
    firestoreCollection.where.mockReturnValue(
      innerQuery as unknown as Query<DocumentData>,
    );

    const result = await collection.getActiveForGuild('g1', new Date());
    expect(result).toEqual([absenceData]);
  });

  it('removes an absence document', async () => {
    await collection.remove('g1', 'a1');
    expect(doc.delete).toHaveBeenCalled();
  });
});
