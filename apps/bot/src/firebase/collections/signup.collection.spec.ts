import { Test } from '@nestjs/testing';
import {
  Encounter,
  PartyStatus,
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
  Transaction,
} from 'firebase-admin/firestore';
import {
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  type Mocked,
  vi,
} from 'vitest';
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
  let firestore: Mocked<Firestore>;
  const signupRequest = partialMock<SignupSchema>(SIGNUP_KEY);

  beforeEach(async () => {
    doc = createAutoMock<DocumentReference<DocumentData>>();

    collection = mockOf<Mocked<CollectionReference<DocumentData>>>({
      get: vi.fn(),
      where: vi.fn(),
      limit: vi.fn(),
      doc: vi.fn().mockReturnValue(doc),
    });

    firestore = createAutoMock<Firestore>();
    firestore.collection.mockReturnValue(collection);

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

  describe('#updateSignupStatus', () => {
    let transaction: Transaction;
    let transactionGet: Mock;
    let transactionUpdate: Mock;

    const mockCurrentDocument = (data: SignupDocument | null) => {
      transactionGet.mockResolvedValueOnce(
        mockOf<DocumentSnapshot<SignupDocument>>({
          exists: data !== null,
          data: () => data,
        }),
      );
    };

    beforeEach(() => {
      transactionGet = vi.fn();
      transactionUpdate = vi.fn();
      transaction = mockOf<Transaction>({
        get: transactionGet,
        update: transactionUpdate,
      });
      firestore.runTransaction.mockImplementation((updateFunction) =>
        updateFunction(transaction),
      );
    });

    const reviewableSignup = {
      ...SIGNUP_KEY,
      status: SignupStatus.PENDING,
      reviewMessageId: 'm1',
      reviewedBy: null,
    };

    it('writes the new status when the signup is still in the same unreviewed round', async () => {
      mockCurrentDocument(partialMock<SignupDocument>(reviewableSignup));

      const result = await repository.updateSignupStatus(
        SignupStatus.APPROVED,
        {
          ...SIGNUP_KEY,
          progPoint: 'point-a',
          partyStatus: PartyStatus.EarlyProgParty,
        },
        'reviewer',
        'm1',
      );

      expect(result).toBe(true);
      expect(transactionUpdate).toHaveBeenCalledWith(doc, {
        status: SignupStatus.APPROVED,
        progPoint: 'point-a',
        reviewedBy: 'reviewer',
        partyStatus: PartyStatus.EarlyProgParty,
      });
    });

    it('does not write when the review round has changed (new reviewMessageId)', async () => {
      mockCurrentDocument(
        partialMock<SignupDocument>({
          ...reviewableSignup,
          reviewMessageId: 'm2',
        }),
      );

      const result = await repository.updateSignupStatus(
        SignupStatus.APPROVED,
        { ...SIGNUP_KEY, progPoint: 'point-a' },
        'reviewer',
        'm1',
      );

      expect(result).toBe(false);
      expect(transactionUpdate).not.toHaveBeenCalled();
    });

    it('does not write when the signup has already been reviewed', async () => {
      mockCurrentDocument(
        partialMock<SignupDocument>({
          ...reviewableSignup,
          reviewedBy: 'someoneElse',
        }),
      );

      const result = await repository.updateSignupStatus(
        SignupStatus.APPROVED,
        { ...SIGNUP_KEY, progPoint: 'point-a' },
        'reviewer',
        'm1',
      );

      expect(result).toBe(false);
      expect(transactionUpdate).not.toHaveBeenCalled();
    });

    it('does not write when the signup is no longer reviewable', async () => {
      mockCurrentDocument(
        partialMock<SignupDocument>({
          ...reviewableSignup,
          status: SignupStatus.APPROVED,
        }),
      );

      const result = await repository.updateSignupStatus(
        SignupStatus.DECLINED,
        SIGNUP_KEY,
        'reviewer',
        'm1',
      );

      expect(result).toBe(false);
      expect(transactionUpdate).not.toHaveBeenCalled();
    });

    it('does not write when the signup document no longer exists', async () => {
      mockCurrentDocument(null);

      const result = await repository.updateSignupStatus(
        SignupStatus.APPROVED,
        { ...SIGNUP_KEY, progPoint: 'point-a' },
        'reviewer',
        'm1',
      );

      expect(result).toBe(false);
      expect(transactionUpdate).not.toHaveBeenCalled();
    });
  });

  it('should call setReviewMessageId with the correct arguments', async () => {
    await repository.setReviewMessageId(SIGNUP_KEY, 'messageId');

    expect(doc.update).toHaveBeenCalledWith({
      reviewMessageId: 'messageId',
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

  describe('#updateDeclineReasonIfActive', () => {
    let transaction: Transaction;
    let transactionGet: Mock;
    let transactionUpdate: Mock;

    const mockCurrentDocument = (data: SignupDocument | null) => {
      transactionGet.mockResolvedValueOnce(
        mockOf<DocumentSnapshot<SignupDocument>>({
          exists: data !== null,
          data: () => data,
        }),
      );
    };

    beforeEach(() => {
      transactionGet = vi.fn();
      transactionUpdate = vi.fn();
      transaction = mockOf<Transaction>({
        get: transactionGet,
        update: transactionUpdate,
      });
      firestore.runTransaction.mockImplementation((updateFunction) =>
        updateFunction(transaction),
      );
    });

    it('writes the decline reason when the signup is still in the same declined round', async () => {
      mockCurrentDocument(
        partialMock<SignupDocument>({
          ...SIGNUP_KEY,
          status: SignupStatus.DECLINED,
          reviewMessageId: 'm1',
          reviewedBy: 'reviewer',
        }),
      );

      const result = await repository.updateDeclineReasonIfActive(
        SIGNUP_KEY,
        'lacks proof',
        'm1',
        'reviewer',
      );

      expect(result).toBe(true);
      expect(transactionUpdate).toHaveBeenCalledWith(doc, {
        declineReason: 'lacks proof',
      });
    });

    it('does not write when the signup is no longer DECLINED', async () => {
      mockCurrentDocument(
        partialMock<SignupDocument>({
          ...SIGNUP_KEY,
          status: SignupStatus.UPDATE_PENDING,
          reviewMessageId: 'm1',
          reviewedBy: 'reviewer',
        }),
      );

      const result = await repository.updateDeclineReasonIfActive(
        SIGNUP_KEY,
        'lacks proof',
        'm1',
        'reviewer',
      );

      expect(result).toBe(false);
      expect(transactionUpdate).not.toHaveBeenCalled();
    });

    it('does not write when the review round has changed (new reviewMessageId)', async () => {
      mockCurrentDocument(
        partialMock<SignupDocument>({
          ...SIGNUP_KEY,
          status: SignupStatus.DECLINED,
          reviewMessageId: 'm2',
          reviewedBy: 'reviewer',
        }),
      );

      const result = await repository.updateDeclineReasonIfActive(
        SIGNUP_KEY,
        'lacks proof',
        'm1',
        'reviewer',
      );

      expect(result).toBe(false);
      expect(transactionUpdate).not.toHaveBeenCalled();
    });

    it('does not write when the signup has since been reviewed by someone else', async () => {
      mockCurrentDocument(
        partialMock<SignupDocument>({
          ...SIGNUP_KEY,
          status: SignupStatus.DECLINED,
          reviewMessageId: 'm1',
          reviewedBy: 'otherReviewer',
        }),
      );

      const result = await repository.updateDeclineReasonIfActive(
        SIGNUP_KEY,
        'lacks proof',
        'm1',
        'reviewer',
      );

      expect(result).toBe(false);
      expect(transactionUpdate).not.toHaveBeenCalled();
    });

    it('does not write when the signup document no longer exists', async () => {
      mockCurrentDocument(null);

      const result = await repository.updateDeclineReasonIfActive(
        SIGNUP_KEY,
        'lacks proof',
        'm1',
        'reviewer',
      );

      expect(result).toBe(false);
      expect(transactionUpdate).not.toHaveBeenCalled();
    });
  });
});
