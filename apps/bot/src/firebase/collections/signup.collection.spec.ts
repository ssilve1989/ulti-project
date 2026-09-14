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

describe('Signup Repository', () => {
  let repository: SignupCollection;
  let collection: Mocked<CollectionReference<DocumentData>>;
  let doc: Mocked<DocumentReference<DocumentData>>;
  const signupRequest = partialMock<SignupSchema>(SIGNUP_KEY);

  beforeEach(async () => {
    doc = createAutoMock<DocumentReference<DocumentData>>();

    collection = mockOf<Mocked<CollectionReference<DocumentData>>>({
      get: vi.fn(),
      where: vi.fn(),
      limit: vi.fn(),
      doc: vi.fn().mockReturnValue(doc),
    });

    const firestore = mockOf<Firestore>({
      collection: vi.fn().mockReturnValue(collection),
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
    doc.get.mockResolvedValueOnce(
      mockOf<DocumentSnapshot>({
        exists: true,
        data: () => existingData,
      }),
    );

    const result = await repository.upsert(signupRequest);

    expect(doc.update).toHaveBeenCalledWith(
      expect.objectContaining({
        ...existingData,
        ...signupRequest,
        status: SignupStatus.UPDATE_PENDING,
        reviewedBy: null,
      }),
    );

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
    doc.get.mockResolvedValueOnce(
      mockOf<DocumentSnapshot>({
        exists: true,
        data: () => existingData,
      }),
    );

    const result = await repository.upsert(signupRequest);

    expect(doc.update).toHaveBeenCalledWith(
      expect.objectContaining({
        ...existingData,
        ...signupRequest,
        status: SignupStatus.PENDING, // Should remain PENDING
        reviewedBy: null,
      }),
    );

    expect(result.status).toBe(SignupStatus.PENDING);
  });

  it('should call create if the document does not exist', async () => {
    doc.get.mockResolvedValueOnce(
      mockOf<DocumentSnapshot>({
        exists: false,
        data: () => null,
      }),
    );

    const result = await repository.upsert(signupRequest);

    expect(doc.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ...signupRequest,
        status: SignupStatus.PENDING,
      }),
    );

    expect(doc.update).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ...signupRequest,
      status: SignupStatus.PENDING,
    });
  });

  it('should call updateSignupStatus with the correct arguments', async () => {
    const historyEntries: ReviewHistoryEntry[] = [
      {
        type: 'declined',
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
    });
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
    doc.get.mockResolvedValueOnce(
      mockOf<DocumentSnapshot>({ exists: true, data: () => existingData }),
    );

    await repository.upsert(signupRequest);

    expect(doc.update).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewHistory,
        approvalMessageId: 'announcement-1',
        status: SignupStatus.UPDATE_PENDING,
        reviewedBy: null,
      }),
    );
  });

  it('sets the approval announcement message id', async () => {
    await repository.setApprovalMessageId(SIGNUP_KEY, 'announcement-1');

    expect(doc.update).toHaveBeenCalledWith({
      approvalMessageId: 'announcement-1',
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
    const data = {
      progPoint: 'P4',
      partyStatus: PartyStatus.ClearParty,
      historyEntries,
    };

    it('writes the edit under a lastUpdateTime precondition', async () => {
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
    });

    it('returns a conflict when the precondition fails', async () => {
      doc.update.mockRejectedValueOnce(
        Object.assign(new Error('9 FAILED_PRECONDITION'), { code: 9 }),
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
