import { Test } from '@nestjs/testing';
import {
  type ApprovedSignupDocument,
  type CreateSignupDocumentProps,
  type DeclinedSignupDocument,
  Encounter,
  PartyStatus,
  type PendingSignupDocument,
  type SignupDocument,
  SignupStatus,
  type UpdatePendingSignupDocument,
} from '@ulti-project/shared';
import { Timestamp } from 'firebase-admin/firestore';
import { test as base, describe, expect } from 'vitest';
import { InMemoryFirestore } from '../../test-utils/firestore/in-memory-firestore.js';
import { fresh } from '../../test-utils/fixtures.js';
import { signupExpiryFor } from '../../test-utils/matchers.js';
import { FIRESTORE } from '../firebase.consts.js';
import { DocumentNotFoundException } from '../firebase.exceptions.js';
import { SignupCollection } from './signup.collection.js';

const KEY = Object.freeze({ discordId: 'Player-1', encounter: Encounter.DSR });
const PATH = `signups/${SignupCollection.getKeyForSignup(KEY)}`;

function aRequest(
  overrides: Partial<CreateSignupDocumentProps> = {},
): CreateSignupDocumentProps {
  return {
    ...KEY,
    character: 'test character',
    world: 'jenova',
    role: 'tank',
    progPointRequested: 'P6',
    username: 'player',
    ...overrides,
  };
}

function aSignup(
  overrides: Partial<PendingSignupDocument> = {},
): PendingSignupDocument {
  return {
    ...aRequest(),
    status: SignupStatus.PENDING,
    expiresAt: Timestamp.fromMillis(0),
    ...overrides,
  };
}

function aDeclinedSignup(
  overrides: Partial<DeclinedSignupDocument> = {},
): DeclinedSignupDocument {
  return {
    ...aRequest(),
    status: SignupStatus.DECLINED,
    reviewedBy: 'reviewer',
    expiresAt: Timestamp.fromMillis(0),
    ...overrides,
  };
}

const it = base.extend<{
  db: InMemoryFirestore;
  collection: SignupCollection;
}>({
  db: fresh(() => new InMemoryFirestore()),
  collection: async ({ db }, use) => {
    const moduleRef = await Test.createTestingModule({
      providers: [SignupCollection, { provide: FIRESTORE, useValue: db }],
    }).compile();
    await use(moduleRef.get(SignupCollection));
  },
});

describe('SignupCollection', () => {
  describe('upsert', () => {
    it('stores a new signup as pending with an expiry', async ({
      db,
      collection,
    }) => {
      const before = Date.now();
      const { signup, previous } = await collection.upsert(aRequest());
      const after = Date.now();

      expect(previous).toBeUndefined();
      expect(signup).toEqual(db.read(PATH));
      expect(db.read(PATH)).toEqual({
        ...aRequest(),
        status: SignupStatus.PENDING,
        expiresAt: signupExpiryFor(before, after),
      });
    });

    it('keeps a still-pending signup pending', async ({ db, collection }) => {
      db.seed(PATH, aSignup());

      const before = Date.now();
      const { signup, previous } = await collection.upsert(
        aRequest({ role: 'healer' }),
      );
      const after = Date.now();

      expect(previous).toEqual(aSignup());
      expect(signup).toEqual(db.read(PATH));
      expect(db.read(PATH)).toEqual({
        ...aSignup({ role: 'healer', reviewedBy: null }),
        expiresAt: signupExpiryFor(before, after),
      });
    });

    it('clears the decline reason when a declined signup is resubmitted', async ({
      db,
      collection,
    }) => {
      const declined = aDeclinedSignup({ declineReason: 'no proof' });
      db.seed(PATH, declined);

      const before = Date.now();
      const { signup, previous } = await collection.upsert(aRequest());
      const after = Date.now();

      expect(previous).toEqual(declined);
      expect(signup).toEqual(db.read(PATH));
      expect(db.read(PATH)).toEqual({
        ...aSignup({ reviewedBy: null }),
        status: SignupStatus.UPDATE_PENDING,
        expiresAt: signupExpiryFor(before, after),
      });
    });

    it('moves a reviewed signup to update-pending, keeping what its review decided, and reports what it replaced', async ({
      db,
      collection,
    }) => {
      const approved: ApprovedSignupDocument = {
        ...aRequest(),
        status: SignupStatus.APPROVED,
        expiresAt: Timestamp.fromMillis(0),
        reviewMessageId: 'm1',
        reviewedBy: 'reviewer',
        progPoint: 'P6',
        partyStatus: PartyStatus.ProgParty,
      };
      db.seed(PATH, approved);

      const before = Date.now();
      const { signup, previous } = await collection.upsert(
        aRequest({ progPointRequested: 'P7' }),
      );
      const after = Date.now();

      expect(previous).toEqual(approved);
      expect(signup).toEqual(db.read(PATH));
      expect(db.read(PATH)).toEqual({
        ...approved,
        progPointRequested: 'P7',
        status: SignupStatus.UPDATE_PENDING,
        reviewedBy: null,
        expiresAt: signupExpiryFor(before, after),
      });
    });
  });

  it('records an approval', async ({ db, collection }) => {
    db.seed(PATH, aSignup());

    await collection.approveSignup(
      { ...KEY, progPoint: 'P6', partyStatus: PartyStatus.ProgParty },
      'reviewer',
    );

    expect(db.read(PATH)).toEqual({
      ...aSignup(),
      status: SignupStatus.APPROVED,
      progPoint: 'P6',
      partyStatus: PartyStatus.ProgParty,
      reviewedBy: 'reviewer',
    });
  });

  it('clears an earlier decline reason when approving', async ({
    db,
    collection,
  }) => {
    db.seed(PATH, aDeclinedSignup({ declineReason: 'no proof' }));

    await collection.approveSignup(
      { ...KEY, progPoint: 'P6', partyStatus: PartyStatus.ProgParty },
      'reviewer',
    );

    expect(db.read(PATH)).toEqual({
      ...aSignup(),
      status: SignupStatus.APPROVED,
      progPoint: 'P6',
      partyStatus: PartyStatus.ProgParty,
      reviewedBy: 'reviewer',
    });
  });

  it('records a decline', async ({ db, collection }) => {
    db.seed(PATH, aSignup());

    await collection.declineSignup(KEY, 'reviewer');

    expect(db.read(PATH)).toEqual(aDeclinedSignup());
  });

  it('leaves what an earlier review decided when declining a resubmitted signup', async ({
    db,
    collection,
  }) => {
    const resubmitted: UpdatePendingSignupDocument = {
      ...aRequest(),
      status: SignupStatus.UPDATE_PENDING,
      expiresAt: Timestamp.fromMillis(0),
      reviewedBy: null,
      progPoint: 'P6',
      partyStatus: PartyStatus.ProgParty,
    };
    db.seed(PATH, resubmitted);

    await collection.declineSignup(KEY, 'reviewer');

    expect(db.read(PATH)).toEqual({
      ...resubmitted,
      status: SignupStatus.DECLINED,
      reviewedBy: 'reviewer',
    });
  });

  describe('findByReviewId', () => {
    it('finds the signup whose review message id was recorded', async ({
      db,
      collection,
    }) => {
      db.seed(
        'signups/other-DSR',
        aSignup({ discordId: 'other', reviewMessageId: 'm0' }),
      );
      db.seed(PATH, aSignup());
      await collection.setReviewMessageId(KEY, 'm1');

      await expect(collection.findByReviewId('m1')).resolves.toEqual(
        aSignup({ reviewMessageId: 'm1' }),
      );
    });

    it('throws when no signup has that review message', async ({
      collection,
    }) => {
      await expect(collection.findByReviewId('m1')).rejects.toBeInstanceOf(
        DocumentNotFoundException,
      );
    });
  });

  it('finds signups by the provided fields, ignoring empty ones', async ({
    db,
    collection,
  }) => {
    db.seed(PATH, aSignup());
    db.seed(
      'signups/other-DSR',
      aSignup({ discordId: 'other', world: 'zalera' }),
    );

    const found = await collection.findAll({ world: 'jenova', notes: '' });

    expect(found).toEqual([aSignup()]);
  });

  describe('findByDiscordIdsIn', () => {
    const seedFor = (db: InMemoryFirestore, signup: PendingSignupDocument) =>
      db.seed(`signups/${SignupCollection.getKeyForSignup(signup)}`, signup);

    it("finds the listed users' signups for the encounter only", async ({
      db,
      collection,
    }) => {
      const listed = aSignup({ discordId: 'listed' });
      seedFor(db, listed);
      seedFor(db, aSignup({ discordId: 'listed', encounter: Encounter.TOP }));
      seedFor(db, aSignup({ discordId: 'unlisted' }));

      const found = await collection.findByDiscordIdsIn(Encounter.DSR, [
        'listed',
        'nobody',
      ]);

      expect(found).toEqual([listed]);
    });

    it('finds more users than one Firestore in-filter allows', async ({
      db,
      collection,
    }) => {
      const signups = Array.from({ length: 31 }, (_, i) =>
        aSignup({ discordId: `user-${i}` }),
      );
      for (const signup of signups) seedFor(db, signup);

      const found = await collection.findByDiscordIdsIn(
        Encounter.DSR,
        signups.map(({ discordId }) => discordId),
      );

      const byId = (a: SignupDocument, b: SignupDocument) =>
        a.discordId.localeCompare(b.discordId);
      expect(found.toSorted(byId)).toEqual(signups.toSorted(byId));
    });

    it('finds nothing for no users', async ({ collection }) => {
      await expect(
        collection.findByDiscordIdsIn(Encounter.DSR, []),
      ).resolves.toEqual([]);
    });
  });

  it('removes only the signup matching character, world and encounter', async ({
    db,
    collection,
  }) => {
    const others = {
      'signups/other-character-DSR': aSignup({
        discordId: 'other-character',
        character: 'someone else',
      }),
      'signups/other-world-DSR': aSignup({
        discordId: 'other-world',
        world: 'zalera',
      }),
      'signups/player-1-TOP': aSignup({ encounter: Encounter.TOP }),
    };
    db.seed(PATH, aSignup());
    for (const [path, signup] of Object.entries(others)) db.seed(path, signup);

    const target: Pick<SignupDocument, 'character' | 'encounter' | 'world'> = {
      character: 'test character',
      world: 'jenova',
      encounter: Encounter.DSR,
    };

    await collection.removeSignup(target);

    expect(db.read(PATH)).toBeUndefined();
    for (const [path, signup] of Object.entries(others)) {
      expect(db.read(path)).toEqual(signup);
    }
  });

  describe('updateDeclineReasonIfActive', () => {
    const declined = Object.freeze(aDeclinedSignup({ reviewMessageId: 'm1' }));

    it('writes the reason while the signup is still in the same declined round', async ({
      db,
      collection,
    }) => {
      db.seed(PATH, declined);

      const recorded = await collection.updateDeclineReasonIfActive(
        KEY,
        'no proof',
        'm1',
        'reviewer',
      );

      expect(recorded).toBe(true);
      expect(db.read(PATH)).toEqual({ ...declined, declineReason: 'no proof' });
    });

    it.for<[string, Partial<SignupDocument>]>([
      ['it is no longer declined', { status: SignupStatus.UPDATE_PENDING }],
      ['it has a new review message', { reviewMessageId: 'm2' }],
      ['someone else has since reviewed it', { reviewedBy: 'other' }],
    ])('does not write when %s', async ([, change], { db, collection }) => {
      db.seed(PATH, { ...declined, ...change });

      const recorded = await collection.updateDeclineReasonIfActive(
        KEY,
        'no proof',
        'm1',
        'reviewer',
      );

      expect(recorded).toBe(false);
      expect(db.read(PATH)).toEqual({ ...declined, ...change });
    });

    it('does not write when the signup no longer exists', async ({
      db,
      collection,
    }) => {
      const recorded = await collection.updateDeclineReasonIfActive(
        KEY,
        'no proof',
        'm1',
        'reviewer',
      );

      expect(recorded).toBe(false);
      expect(db.read(PATH)).toBeUndefined();
    });
  });
});
