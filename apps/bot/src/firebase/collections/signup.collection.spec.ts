import { Test } from '@nestjs/testing';
import {
  Encounter,
  PartyStatus,
  type ReviewHistoryEntry,
  type SignupDocument,
  SignupStatus,
} from '@ulti-project/shared';
import type {
  CollectionReference,
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
  Firestore,
  Query,
} from 'firebase-admin/firestore';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import type { SignupSchema } from '../../slash-commands/signup/signup.schema.js';
import {
  createAutoMock,
  mockOf,
  partialMock,
} from '../../test-utils/mock-factory.js';
import { FIRESTORE } from '../firebase.consts.js';
import { DocumentNotFoundException } from '../firebase.exceptions.js';
import { SignupCollection } from './signup.collection.js';

const SIGNUP_KEY = {
  discordId: '12345',
  encounter: Encounter.DSR,
};

/**
 * The slice of Firestore's `Transaction` that `SignupCollection.upsert` uses.
 * `Transaction`'s real methods are overloaded (e.g. `get` also accepts a
 * `Query` or `AggregateQuery`), which makes `Mocked<Transaction>['get']`
 * resolve to the last overload's return type when mocking - a single-
 * signature stand-in avoids that.
 */
interface TransactionStub {
  get: (
    documentRef: DocumentReference<DocumentData>,
  ) => Promise<DocumentSnapshot<DocumentData>>;
  update: (
    documentRef: DocumentReference<DocumentData>,
    data: DocumentData,
  ) => unknown;
  create: (
    documentRef: DocumentReference<DocumentData>,
    data: DocumentData,
  ) => unknown;
}

describe('Signup Repository', () => {
  let repository: SignupCollection;
  let collection: Mocked<CollectionReference<DocumentData>>;
  let doc: Mocked<DocumentReference<DocumentData>>;
  /** Mocked transaction passed to the `firestore.runTransaction` callback. */
  let transaction: Mocked<TransactionStub>;
  const signupRequest = partialMock<SignupSchema>(SIGNUP_KEY);

  beforeEach(async () => {
    doc = createAutoMock<DocumentReference<DocumentData>>();

    collection = mockOf<Mocked<CollectionReference<DocumentData>>>({
      get: vi.fn(),
      where: vi.fn(),
      limit: vi.fn(),
      doc: vi.fn().mockReturnValue(doc),
    });

    transaction = mockOf<Mocked<TransactionStub>>({
      get: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    });

    const firestore = mockOf<Firestore>({
      collection: vi.fn().mockReturnValue(collection),
      runTransaction: vi.fn(
        (updateFunction: (transaction: TransactionStub) => Promise<unknown>) =>
          updateFunction(transaction),
      ),
    });

    const fixture = await Test.createTestingModule({
      providers: [
        SignupCollection,
        { provide: FIRESTORE, useValue: firestore },
      ],
    })
      .useMocker(createAutoMock)
      .compile();

    repository = fixture.get(SignupCollection);
  });

  it('should call update if document exists', async () => {
    const existingData = {
      ...signupRequest,
      status: SignupStatus.APPROVED,
      reviewedBy: 'someReviewer',
    };
    transaction.get.mockResolvedValueOnce(
      mockOf<DocumentSnapshot>({
        exists: true,
        data: () => existingData,
      }),
    );

    const result = await repository.upsert(signupRequest);

    // Exact match (not objectContaining): the payload must be built only
    // from `props`, never spread from `existing` (no reviewHistory,
    // approvalMessageId, progPoint or partyStatus copied over).
    expect(transaction.update).toHaveBeenCalledWith(doc, {
      ...signupRequest,
      status: SignupStatus.UPDATE_PENDING,
      reviewedBy: null,
      expiresAt: expect.any(Timestamp),
    });

    expect(transaction.create).not.toHaveBeenCalled();
    expect(doc.update).not.toHaveBeenCalled();
    expect(doc.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ...existingData,
      ...signupRequest,
      status: SignupStatus.UPDATE_PENDING,
      reviewedBy: null,
    });
  });

  it('should preserve PENDING status when updating an existing PENDING signup', async () => {
    const existingData = {
      ...signupRequest,
      status: SignupStatus.PENDING,
      reviewedBy: null,
    };
    transaction.get.mockResolvedValueOnce(
      mockOf<DocumentSnapshot>({
        exists: true,
        data: () => existingData,
      }),
    );

    const result = await repository.upsert(signupRequest);

    expect(transaction.update).toHaveBeenCalledWith(doc, {
      ...signupRequest,
      status: SignupStatus.PENDING, // Should remain PENDING
      reviewedBy: null,
      expiresAt: expect.any(Timestamp),
    });

    expect(result.status).toBe(SignupStatus.PENDING);
  });

  it('should call create if the document does not exist', async () => {
    transaction.get.mockResolvedValueOnce(
      mockOf<DocumentSnapshot>({
        exists: false,
        data: () => null,
      }),
    );

    const result = await repository.upsert(signupRequest);

    expect(transaction.create).toHaveBeenCalledWith(doc, {
      ...signupRequest,
      status: SignupStatus.PENDING,
      expiresAt: expect.any(Timestamp),
    });

    expect(transaction.update).not.toHaveBeenCalled();
    expect(doc.update).not.toHaveBeenCalled();
    expect(doc.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ...signupRequest,
      status: SignupStatus.PENDING,
    });
  });

  it('clears the approval announcement id when a signup is approved', async () => {
    const historyEntries: ReviewHistoryEntry[] = [
      {
        type: 'approved',
        progPoint: 'P2',
        partyStatus: PartyStatus.ProgParty,
        actorId: 'reviewer-1',
        at: Timestamp.fromMillis(1_000),
        via: 'reaction',
      },
    ];

    await repository.updateSignupStatus(
      SignupStatus.APPROVED,
      SIGNUP_KEY,
      'reviewedBy',
      historyEntries,
    );

    expect(doc.update).toHaveBeenCalledWith({
      status: SignupStatus.APPROVED,
      reviewedBy: 'reviewedBy',
      reviewHistory: FieldValue.arrayUnion(...historyEntries),
      approvalMessageId: FieldValue.delete(),
    });
  });

  it('keeps the approval announcement id when a signup is declined', async () => {
    const historyEntries: ReviewHistoryEntry[] = [
      {
        type: 'declined',
        actorId: 'reviewer-1',
        at: Timestamp.fromMillis(1_000),
        via: 'reaction',
      },
    ];

    await repository.updateSignupStatus(
      SignupStatus.DECLINED,
      SIGNUP_KEY,
      'reviewedBy',
      historyEntries,
    );

    expect(doc.update).toHaveBeenCalledWith({
      status: SignupStatus.DECLINED,
      reviewedBy: 'reviewedBy',
      reviewHistory: FieldValue.arrayUnion(...historyEntries),
    });
    expect(doc.update.mock.calls[0][0]).not.toHaveProperty('approvalMessageId');
  });

  it('should call setReviewMessageId with the correct arguments', async () => {
    await repository.setReviewMessageId(SIGNUP_KEY, 'messageId');

    expect(doc.update).toHaveBeenCalledWith({
      reviewMessageId: 'messageId',
    });
  });

  it('preserves reviewHistory and approvalMessageId when a reviewed signup is re-submitted', async () => {
    const reviewHistory: ReviewHistoryEntry[] = [
      {
        type: 'approved',
        progPoint: 'P2',
        partyStatus: PartyStatus.ProgParty,
        actorId: 'reviewer-1',
        at: Timestamp.fromMillis(1_000),
        via: 'reaction',
      },
    ];
    const existingData = {
      ...signupRequest,
      status: SignupStatus.APPROVED,
      reviewedBy: 'someReviewer',
      reviewHistory,
      approvalMessageId: 'announcement-1',
    };
    transaction.get.mockResolvedValueOnce(
      mockOf<DocumentSnapshot>({ exists: true, data: () => existingData }),
    );

    const result = await repository.upsert(signupRequest);

    // The write must not copy reviewHistory/approvalMessageId back from
    // `existing` - only the returned value should still carry them.
    expect(transaction.update).toHaveBeenCalledWith(doc, {
      ...signupRequest,
      status: SignupStatus.UPDATE_PENDING,
      reviewedBy: null,
      expiresAt: expect.any(Timestamp),
    });
    expect(result).toMatchObject({
      reviewHistory,
      approvalMessageId: 'announcement-1',
      status: SignupStatus.UPDATE_PENDING,
      reviewedBy: null,
    });
  });

  describe('#setApprovalMessageId', () => {
    const approvedAt = (millis: number): ReviewHistoryEntry => ({
      type: 'approved',
      progPoint: 'P2',
      partyStatus: PartyStatus.ProgParty,
      actorId: 'reviewer-1',
      at: Timestamp.fromMillis(millis),
      via: 'reaction',
    });

    const storedSignup = (reviewHistory: ReviewHistoryEntry[]) =>
      mockOf<DocumentSnapshot>({
        exists: true,
        data: () => partialMock<SignupDocument>({ reviewHistory }),
      });

    it('stores the id when the latest approval is the given decision', async () => {
      transaction.get.mockResolvedValueOnce(
        storedSignup([
          approvedAt(1_000),
          {
            type: 'progPointEdited',
            progPoint: 'P3',
            partyStatus: PartyStatus.ProgParty,
            actorId: 'editor-1',
            at: Timestamp.fromMillis(3_000),
            via: 'edit',
          },
        ]),
      );

      await expect(
        repository.setApprovalMessageId(
          SIGNUP_KEY,
          'announcement-1',
          Timestamp.fromMillis(1_000),
        ),
      ).resolves.toEqual({ type: 'written' });

      expect(transaction.get).toHaveBeenCalledWith(doc);
      expect(transaction.update).toHaveBeenCalledWith(doc, {
        approvalMessageId: 'announcement-1',
      });
      expect(doc.update).not.toHaveBeenCalled();
    });

    it('writes nothing when a newer approval exists', async () => {
      transaction.get.mockResolvedValueOnce(
        storedSignup([approvedAt(1_000), approvedAt(2_000)]),
      );

      await expect(
        repository.setApprovalMessageId(
          SIGNUP_KEY,
          'announcement-1',
          Timestamp.fromMillis(1_000),
        ),
      ).resolves.toEqual({ type: 'stale' });

      expect(transaction.update).not.toHaveBeenCalled();
      expect(doc.update).not.toHaveBeenCalled();
    });

    it('writes nothing when the signup no longer exists', async () => {
      transaction.get.mockResolvedValueOnce(
        mockOf<DocumentSnapshot>({ exists: false, data: () => undefined }),
      );

      await expect(
        repository.setApprovalMessageId(
          SIGNUP_KEY,
          'announcement-1',
          Timestamp.fromMillis(1_000),
        ),
      ).resolves.toEqual({ type: 'stale' });

      expect(transaction.update).not.toHaveBeenCalled();
      expect(doc.update).not.toHaveBeenCalled();
    });
  });

  describe('#findByKeyWithVersion', () => {
    it('returns the signup with its update time', async () => {
      const signup = partialMock<SignupDocument>({
        ...SIGNUP_KEY,
        status: SignupStatus.APPROVED,
      });
      const updateTime = Timestamp.fromMillis(5_000);
      doc.get.mockResolvedValueOnce(
        mockOf<DocumentSnapshot>({ data: () => signup, updateTime }),
      );

      await expect(
        repository.findByKeyWithVersion(SIGNUP_KEY),
      ).resolves.toEqual({
        signup,
        updateTime,
      });
      expect(collection.doc).toHaveBeenCalledWith('12345-DSR');
    });

    it('returns undefined when the signup does not exist', async () => {
      doc.get.mockResolvedValueOnce(
        mockOf<DocumentSnapshot>({
          data: () => undefined,
          updateTime: undefined,
        }),
      );

      await expect(
        repository.findByKeyWithVersion(SIGNUP_KEY),
      ).resolves.toBeUndefined();
    });
  });

  describe('#applyEdit', () => {
    const updateTime = Timestamp.fromMillis(5_000);
    const historyEntries: ReviewHistoryEntry[] = [
      {
        type: 'progPointEdited',
        progPoint: 'P4',
        partyStatus: PartyStatus.ClearParty,
        actorId: 'editor-1',
        at: Timestamp.fromMillis(6_000),
        via: 'edit',
      },
    ];
    const data: Parameters<SignupCollection['applyEdit']>[1] = {
      kind: 'correction',
      progPoint: 'P4',
      partyStatus: PartyStatus.ClearParty,
      historyEntries,
    };

    it('writes a correction under a lastUpdateTime precondition, keeping the announcement id', async () => {
      await expect(
        repository.applyEdit(SIGNUP_KEY, data, updateTime),
      ).resolves.toEqual({ type: 'written' });

      expect(doc.update).toHaveBeenCalledWith(
        {
          status: SignupStatus.APPROVED,
          progPoint: 'P4',
          partyStatus: PartyStatus.ClearParty,
          reviewHistory: FieldValue.arrayUnion(...historyEntries),
        },
        { lastUpdateTime: updateTime },
      );
      expect(doc.update.mock.calls[0][0]).not.toHaveProperty(
        'approvalMessageId',
      );
    });

    it('clears the announcement id in the same write for a reversal', async () => {
      await expect(
        repository.applyEdit(
          SIGNUP_KEY,
          { ...data, kind: 'reversal' },
          updateTime,
        ),
      ).resolves.toEqual({ type: 'written' });

      expect(doc.update).toHaveBeenCalledWith(
        {
          status: SignupStatus.APPROVED,
          progPoint: 'P4',
          partyStatus: PartyStatus.ClearParty,
          reviewHistory: FieldValue.arrayUnion(...historyEntries),
          approvalMessageId: FieldValue.delete(),
        },
        { lastUpdateTime: updateTime },
      );
    });

    it('returns a conflict when the precondition fails', async () => {
      doc.update.mockRejectedValueOnce(
        Object.assign(new Error('9 FAILED_PRECONDITION'), { code: 9 }),
      );

      await expect(
        repository.applyEdit(SIGNUP_KEY, data, updateTime),
      ).resolves.toEqual({ type: 'conflict' });
    });

    it('returns a conflict when the signup was deleted', async () => {
      doc.update.mockRejectedValueOnce(
        Object.assign(new Error('5 NOT_FOUND'), { code: 5 }),
      );

      await expect(
        repository.applyEdit(SIGNUP_KEY, data, updateTime),
      ).resolves.toEqual({ type: 'conflict' });
    });

    it('rethrows any other error', async () => {
      const failure = Object.assign(new Error('14 UNAVAILABLE'), { code: 14 });
      doc.update.mockRejectedValueOnce(failure);

      await expect(
        repository.applyEdit(SIGNUP_KEY, data, updateTime),
      ).rejects.toBe(failure);
    });
  });

  describe('#findByReviewId', () => {
    const mockFetch = (empty: boolean, signup: SignupDocument) => {
      collection.where.mockReturnValueOnce(
        mockOf<Query<DocumentData>>({
          limit: () => ({
            get: () =>
              Promise.resolve({
                empty,
                docs: [{ data: () => signup }],
              }),
          }),
        }),
      );
    };

    it('should return a signup by review if exists', async () => {
      const reviewMessageId = 'reviewMessageId';
      const signup = partialMock<SignupDocument>({
        ...SIGNUP_KEY,
        reviewMessageId,
        status: SignupStatus.PENDING,
      });

      mockFetch(false, signup);

      const result = await repository.findByReviewId(reviewMessageId);

      expect(result).toEqual(signup);
    });

    it('should throw an error if no signup exists', () => {
      mockFetch(true, partialMock<SignupDocument>({}));

      return expect(
        repository.findByReviewId('reviewMessageId'),
      ).rejects.toThrow(DocumentNotFoundException);
    });
  });
});
