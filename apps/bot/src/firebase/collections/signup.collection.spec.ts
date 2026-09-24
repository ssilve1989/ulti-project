import { Test } from '@nestjs/testing';
import {
  type CreateSignupDocumentProps,
  Encounter,
  PartyStatus,
  type SignupDocument,
  SignupStatus,
} from '@ulti-project/shared';
import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryFirestore } from '../../test-utils/firestore/in-memory-firestore.js';
import { FIRESTORE } from '../firebase.consts.js';
import { DocumentNotFoundException } from '../firebase.exceptions.js';
import { SignupCollection } from './signup.collection.js';

const KEY = { discordId: 'Player-1', encounter: Encounter.DSR };
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

describe('SignupCollection', () => {
  let db: InMemoryFirestore;
  let collection: SignupCollection;

  beforeEach(async () => {
    db = new InMemoryFirestore();
    const moduleRef = await Test.createTestingModule({
      providers: [SignupCollection, { provide: FIRESTORE, useValue: db }],
    }).compile();
    collection = moduleRef.get(SignupCollection);
  });

  describe('upsert', () => {
    it('stores a new signup as pending with an expiry', async () => {
      const { signup, previous } = await collection.upsert(aRequest());

      expect(previous).toBeUndefined();
      expect(signup).toEqual(db.read(PATH));
      expect(db.read(PATH)).toMatchObject({
        character: 'test character',
        status: SignupStatus.PENDING,
        expiresAt: expect.any(Timestamp),
      });
    });

    it('keeps a still-pending signup pending and clears its reviewer', async () => {
      db.seed(PATH, aSignup({ reviewedBy: 'someone' }));

      const { signup } = await collection.upsert(aRequest({ role: 'healer' }));

      expect(signup).toEqual(db.read(PATH));
      expect(db.read(PATH)).toMatchObject({
        role: 'healer',
        status: SignupStatus.PENDING,
        reviewedBy: null,
      });
    });

    it('moves a reviewed signup to update-pending and reports what it replaced', async () => {
      db.seed(
        PATH,
        aSignup({ status: SignupStatus.APPROVED, reviewMessageId: 'm1' }),
      );

      const { signup, previous } = await collection.upsert(aRequest());

      expect(signup).toEqual(db.read(PATH));
      expect(previous).toMatchObject({
        status: SignupStatus.APPROVED,
        reviewMessageId: 'm1',
      });
      expect(db.read(PATH)).toMatchObject({
        status: SignupStatus.UPDATE_PENDING,
        reviewMessageId: 'm1',
      });
    });
  });

  it('records a review decision', async () => {
    db.seed(PATH, aSignup());

    await collection.updateSignupStatus(
      SignupStatus.APPROVED,
      { ...KEY, progPoint: 'P6', partyStatus: PartyStatus.ProgParty },
      'reviewer',
    );

    expect(db.read(PATH)).toMatchObject({
      status: SignupStatus.APPROVED,
      progPoint: 'P6',
      partyStatus: PartyStatus.ProgParty,
      reviewedBy: 'reviewer',
    });
  });

  describe('findByReviewId', () => {
    it('finds the signup whose review message id was recorded', async () => {
      db.seed(PATH, aSignup());
      await collection.setReviewMessageId(KEY, 'm1');

      await expect(collection.findByReviewId('m1')).resolves.toMatchObject({
        character: 'test character',
        reviewMessageId: 'm1',
      });
    });

    it('throws when no signup has that review message', async () => {
      await expect(collection.findByReviewId('m1')).rejects.toBeInstanceOf(
        DocumentNotFoundException,
      );
    });
  });

  it('finds signups by the provided fields, ignoring empty ones', async () => {
    db.seed(PATH, aSignup());
    db.seed(
      'signups/other-DSR',
      aSignup({ discordId: 'other', world: 'zalera' }),
    );

    const found = await collection.findAll({ world: 'jenova', notes: '' });

    expect(found).toEqual([expect.objectContaining({ discordId: 'Player-1' })]);
  });

  it('removes only the signup matching character, world and encounter', async () => {
    db.seed(PATH, aSignup());
    db.seed('signups/player-1-TOP', aSignup({ encounter: Encounter.TOP }));

    const target: Pick<SignupDocument, 'character' | 'encounter' | 'world'> = {
      character: 'test character',
      world: 'jenova',
      encounter: Encounter.DSR,
    };

    await collection.removeSignup(target);

    expect(db.read(PATH)).toBeUndefined();
    expect(db.read('signups/player-1-TOP')).toBeDefined();
  });

  describe('updateDeclineReasonIfActive', () => {
    const declined = aSignup({
      status: SignupStatus.DECLINED,
      reviewMessageId: 'm1',
      reviewedBy: 'reviewer',
    });

    it('writes the reason while the signup is still in the same declined round', async () => {
      db.seed(PATH, declined);

      const recorded = await collection.updateDeclineReasonIfActive(
        KEY,
        'no proof',
        'm1',
        'reviewer',
      );

      expect(recorded).toBe(true);
      expect(db.read(PATH)).toMatchObject({ declineReason: 'no proof' });
    });

    it.each([
      ['it is no longer declined', { status: SignupStatus.UPDATE_PENDING }],
      ['it has a new review message', { reviewMessageId: 'm2' }],
      ['someone else has since reviewed it', { reviewedBy: 'other' }],
    ])('does not write when %s', async (_case, change) => {
      db.seed(PATH, { ...declined, ...change });

      const recorded = await collection.updateDeclineReasonIfActive(
        KEY,
        'no proof',
        'm1',
        'reviewer',
      );

      expect(recorded).toBe(false);
      expect(db.read(PATH)).not.toHaveProperty('declineReason');
    });

    it('does not write when the signup no longer exists', async () => {
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
