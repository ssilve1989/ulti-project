import { Test } from '@nestjs/testing';
import type {
  CollectionReference,
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
  Firestore,
  Query,
} from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { Encounter } from '../../encounters/encounters.consts.js';
import type { SignupSchema } from '../../slash-commands/signup/signup.schema.js';
import { createAutoMock } from '../../test-utils/mock-factory.js';
import { FIRESTORE } from '../firebase.consts.js';
import { DocumentNotFoundException } from '../firebase.exceptions.js';
import {
  PartyStatus,
  type SignupDocument,
  SignupStatus,
} from '../models/signup.model.js';
import { SignupCollection } from './signup.collection.js';

const SIGNUP_KEY = {
  discordId: '12345',
  encounter: Encounter.DSR,
};

describe('Signup Repository', () => {
  let repository: SignupCollection;
  let collection: Mocked<CollectionReference<DocumentData>>;
  let doc: Mocked<DocumentReference<DocumentData>>;
  const signupRequest = SIGNUP_KEY as unknown as SignupSchema;

  beforeEach(async () => {
    doc = createAutoMock() as unknown as Mocked<
      DocumentReference<DocumentData>
    >;

    collection = {
      get: vi.fn(),
      where: vi.fn(),
      limit: vi.fn(),
      doc: vi.fn().mockReturnValue(doc),
    } as unknown as Mocked<CollectionReference<DocumentData>>;

    const firestore = {
      collection: vi.fn().mockReturnValue(collection),
    } as unknown as Firestore;

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
      partyStatus: PartyStatus.ProgParty,
      progPoint: 'P6 Enrage',
      reviewMessageId: 'review-message-id',
      status: SignupStatus.APPROVED,
      reviewedBy: 'someReviewer',
    };

    doc.get.mockResolvedValueOnce({
      exists: true,
      data: () => existingData,
    } as unknown as DocumentSnapshot);

    const result = await repository.upsert(signupRequest);

    expect(doc.update).toHaveBeenCalledWith(
      expect.objectContaining({
        ...signupRequest,
        declineReason: FieldValue.delete(),
        partyStatus: FieldValue.delete(),
        progPoint: FieldValue.delete(),
        reviewMessageId: existingData.reviewMessageId,
        reviewedBy: FieldValue.delete(),
        expiresAt: expect.anything(),
        status: SignupStatus.UPDATE_PENDING,
      }),
    );

    expect(doc.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ...signupRequest,
      reviewMessageId: existingData.reviewMessageId,
      status: SignupStatus.UPDATE_PENDING,
    });
    expect(result).not.toHaveProperty('reviewedBy');
    expect(result).not.toHaveProperty('progPoint');
    expect(result).not.toHaveProperty('partyStatus');
    expect(result).not.toHaveProperty('declineReason');
  });

  it('should preserve PENDING status when updating an existing PENDING signup', async () => {
    const existingData = {
      ...signupRequest,
      reviewMessageId: 'review-message-id',
      status: SignupStatus.PENDING,
    };
    doc.get.mockResolvedValueOnce({
      exists: true,
      data: () => existingData,
    } as unknown as DocumentSnapshot);

    const result = await repository.upsert(signupRequest);

    expect(doc.update).toHaveBeenCalledWith(
      expect.objectContaining({
        ...signupRequest,
        declineReason: FieldValue.delete(),
        partyStatus: FieldValue.delete(),
        progPoint: FieldValue.delete(),
        reviewMessageId: existingData.reviewMessageId,
        reviewedBy: FieldValue.delete(),
        expiresAt: expect.anything(),
        status: SignupStatus.PENDING, // Should remain PENDING
      }),
    );

    expect(result.status).toBe(SignupStatus.PENDING);
    expect(result.reviewMessageId).toBe(existingData.reviewMessageId);
    expect(result).not.toHaveProperty('reviewedBy');
  });

  it('should call create if the document does not exist', async () => {
    doc.get.mockResolvedValueOnce({
      exists: false,
      data: () => null,
    } as unknown as DocumentSnapshot);

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

  it('should call approveSignup with the correct arguments', async () => {
    await repository.approveSignup(
      {
        ...SIGNUP_KEY,
        partyStatus: PartyStatus.ProgParty,
        progPoint: 'P6 Enrage',
      },
      'reviewedBy',
    );

    expect(doc.update).toHaveBeenCalledWith({
      status: SignupStatus.APPROVED,
      progPoint: 'P6 Enrage',
      partyStatus: PartyStatus.ProgParty,
      reviewedBy: 'reviewedBy',
      declineReason: FieldValue.delete(),
    });
  });

  it('should call declineSignup with the correct arguments', async () => {
    await repository.declineSignup(SIGNUP_KEY, 'reviewedBy');

    expect(doc.update).toHaveBeenCalledWith({
      status: SignupStatus.DECLINED,
      reviewedBy: 'reviewedBy',
      progPoint: FieldValue.delete(),
      partyStatus: FieldValue.delete(),
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
      collection.where.mockReturnValueOnce({
        limit: () => ({
          get: () =>
            Promise.resolve({
              empty,
              docs: [{ data: () => signup }],
            }),
        }),
      } as unknown as Query<DocumentData>);
    };

    it('should return a signup by review if exists', async () => {
      const reviewMessageId = 'reviewMessageId';
      const signup = {
        ...SIGNUP_KEY,
        reviewMessageId,
        status: SignupStatus.PENDING,
      } as SignupDocument;

      mockFetch(false, signup);

      const result = await repository.findByReviewId(reviewMessageId);

      expect(result).toEqual(signup);
    });

    it('should throw an error if no signup exists', () => {
      mockFetch(true, {} as SignupDocument);

      return expect(
        repository.findByReviewId('reviewMessageId'),
      ).rejects.toThrow(DocumentNotFoundException);
    });
  });
});
