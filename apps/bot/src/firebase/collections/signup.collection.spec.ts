import { Test } from '@nestjs/testing';
import {
  type CreateSignupDocumentProps,
  Encounter,
  PartyStatus,
  type SignupDocument,
  SignupStatus,
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

function aSignup(overrides: Partial<SignupDocument> = {}): SignupDocument {
  return {
    ...aRequest(),
    status: SignupStatus.PENDING,
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

    it('keeps a still-pending signup pending and clears its reviewer', async ({
      db,
      collection,
    }) => {
      db.seed(PATH, aSignup({ reviewedBy: 'someone' }));

      const before = Date.now();
      const { signup, previous } = await collection.upsert(
        aRequest({ role: 'healer' }),
      );
      const after = Date.now();

      expect(previous).toEqual(aSignup({ reviewedBy: 'someone' }));
      expect(signup).toEqual(db.read(PATH));
      expect(db.read(PATH)).toEqual({
        ...aSignup({ role: 'healer', reviewedBy: null }),
        expiresAt: signupExpiryFor(before, after),
      });
    });

    it('moves a reviewed signup to update-pending and reports what it replaced', async ({
      db,
      collection,
    }) => {
      const approved = aSignup({
        status: SignupStatus.APPROVED,
        reviewMessageId: 'm1',
        reviewedBy: 'reviewer',
      });
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

  it('records a review decision', async ({ db, collection }) => {
    db.seed(PATH, aSignup());

    await collection.updateSignupStatus(
      SignupStatus.APPROVED,
      { ...KEY, progPoint: 'P6', partyStatus: PartyStatus.ProgParty },
      'reviewer',
    );

    expect(db.read(PATH)).toEqual(
      aSignup({
        status: SignupStatus.APPROVED,
        progPoint: 'P6',
        partyStatus: PartyStatus.ProgParty,
        reviewedBy: 'reviewer',
      }),
    );
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
    const declined = Object.freeze(
      aSignup({
        status: SignupStatus.DECLINED,
        reviewMessageId: 'm1',
        reviewedBy: 'reviewer',
      }),
    );

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
