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
import { HelperTeamCollection } from './helper-team.collection.js';

describe('HelperTeamCollection', () => {
  let collection: HelperTeamCollection;
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
        HelperTeamCollection,
        { provide: FIRESTORE, useValue: firestore },
      ],
    })
      .useMocker(createAutoMock)
      .compile();

    collection = fixture.get(HelperTeamCollection);
  });

  it('generates composite key', () => {
    expect(
      HelperTeamCollection.getKey({ guildId: 'g1', teamId: 'alpha' }),
    ).toBe('g1-alpha');
  });

  it('upserts a team document', async () => {
    const now = Timestamp.now();
    await collection.upsert({
      guildId: 'g1',
      teamId: 'alpha',
      name: 'Alpha',
      active: true,
      memberRoleId: 'member-role',
      leaderUserId: 'leader-user',
      createdAt: now,
      updatedAt: now,
    });
    expect(doc.set).toHaveBeenCalled();
  });

  it('gets a team by id', async () => {
    const teamData = {
      guildId: 'g1',
      teamId: 'alpha',
      name: 'Alpha',
      active: true,
    };
    doc.get.mockResolvedValueOnce({
      data: () => teamData,
    } as unknown as DocumentSnapshot);

    const result = await collection.get('g1', 'alpha');
    expect(result).toEqual(teamData);
  });

  it('returns undefined when team not found', async () => {
    doc.get.mockResolvedValueOnce({
      data: () => undefined,
    } as unknown as DocumentSnapshot);
    const result = await collection.get('g1', 'missing');
    expect(result).toBeUndefined();
  });

  it('gets active teams for a guild', async () => {
    const teamData = { guildId: 'g1', teamId: 'alpha', active: true };
    const query = {
      where: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({
        docs: [{ data: () => teamData }],
      } as unknown as QuerySnapshot),
    };
    firestoreCollection.where.mockReturnValue(
      query as unknown as Query<DocumentData>,
    );

    const result = await collection.getActiveForGuild('g1');
    expect(result).toEqual([teamData]);
  });

  it('gets an active team by member role', async () => {
    const teamData = {
      guildId: 'g1',
      teamId: 'alpha',
      memberRoleId: 'role-123',
      active: true,
    };
    const innerQuery = {
      where: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({
        docs: [{ data: () => teamData }],
      } as unknown as QuerySnapshot),
    };
    firestoreCollection.where.mockReturnValue(
      innerQuery as unknown as Query<DocumentData>,
    );

    const result = await collection.getByMemberRole('g1', 'role-123');
    expect(result).toEqual(teamData);
    expect(firestoreCollection.where).toHaveBeenCalledWith(
      'guildId',
      '==',
      'g1',
    );
    expect(innerQuery.where).toHaveBeenCalledWith(
      'memberRoleId',
      '==',
      'role-123',
    );
    expect(innerQuery.where).toHaveBeenCalledWith('active', '==', true);
  });

  it('returns undefined when no active team has the given member role', async () => {
    const innerQuery = {
      where: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({
        docs: [],
      } as unknown as QuerySnapshot),
    };
    firestoreCollection.where.mockReturnValue(
      innerQuery as unknown as Query<DocumentData>,
    );

    const result = await collection.getByMemberRole('g1', 'unknown-role');
    expect(result).toBeUndefined();
  });

  it('archives a team with archivedAt and deleteAt 30 days out', async () => {
    await collection.archive('g1', 'alpha');

    const updateCall = (doc.update as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(updateCall.active).toBe(false);
    expect(updateCall.archivedAt).toBeDefined();
    expect(updateCall.deleteAt).toBeDefined();
    const diffMs =
      updateCall.deleteAt.toDate().getTime() -
      updateCall.archivedAt.toDate().getTime();
    expect(diffMs).toBe(30 * 24 * 60 * 60 * 1000);
  });
});
