import { Test } from '@nestjs/testing';
import { PartyStatus, type ProgPointDocument } from '@ulti-project/shared';
import type { Firestore } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAutoMock } from '../../test-utils/mock-factory.js';
import { FIRESTORE } from '../firebase.consts.js';
import { EncountersCollection } from './encounters-collection.js';

const progPoint = (id: string, order: number): ProgPointDocument => ({
  id,
  label: id,
  partyStatus: PartyStatus.ProgParty,
  order,
  active: true,
});

describe('EncountersCollection', () => {
  let collection: EncountersCollection;
  let firestoreCollection: ReturnType<typeof vi.fn>;
  let guildsDoc: ReturnType<typeof vi.fn>;
  let guildSubcollection: ReturnType<typeof vi.fn>;
  /** prog points keyed by the guild that owns them */
  let progPointsByGuild: Map<string, ProgPointDocument[]>;

  beforeEach(async () => {
    progPointsByGuild = new Map();

    // Models guilds/{guildId}/encounters/{encounterId}/prog-points, remembering
    // which guild the current chain started from so each one gets its own data.
    const progPointsRef = (guildId: string) => ({
      orderBy: () => ({
        get: () =>
          Promise.resolve({
            docs: (progPointsByGuild.get(guildId) ?? []).map((data) => ({
              data: () => data,
            })),
          }),
      }),
    });

    guildSubcollection = vi.fn();
    guildsDoc = vi.fn((guildId: string) => {
      guildSubcollection.mockReturnValue({
        doc: () => ({ collection: () => progPointsRef(guildId) }),
      });
      return { collection: guildSubcollection };
    });
    firestoreCollection = vi.fn().mockReturnValue({ doc: guildsDoc });

    const firestore = {
      collection: firestoreCollection,
    } as unknown as Firestore;

    const fixture = await Test.createTestingModule({
      providers: [
        EncountersCollection,
        { provide: FIRESTORE, useValue: firestore },
      ],
    })
      .useMocker(createAutoMock)
      .compile();

    collection = fixture.get(EncountersCollection);
  });

  it('scopes the collection to guilds/{guildId}/encounters', async () => {
    await collection.getAllProgPoints('guild-1', 'FRU');

    expect(firestoreCollection).toHaveBeenCalledWith('guilds');
    expect(guildsDoc).toHaveBeenCalledWith('guild-1');
    expect(guildSubcollection).toHaveBeenCalledWith('encounters');
  });

  it('does not serve one guild the cached prog points of another', async () => {
    progPointsByGuild.set('guild-1', [progPoint('P1', 0)]);
    progPointsByGuild.set('guild-2', [progPoint('P1', 0), progPoint('P2', 1)]);

    // guild-1 populates the cache first; guild-2 must not read through to it
    const first = await collection.getAllProgPoints('guild-1', 'FRU');
    const second = await collection.getAllProgPoints('guild-2', 'FRU');

    expect(first.map((p) => p.id)).toEqual(['P1']);
    expect(second.map((p) => p.id)).toEqual(['P1', 'P2']);
  });
});
