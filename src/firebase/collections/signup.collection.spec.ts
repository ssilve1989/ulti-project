import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { Test } from '@nestjs/testing';
import {
  CollectionReference,
  type DocumentData,
  DocumentReference,
  DocumentSnapshot,
  Firestore,
  Query,
  QueryDocumentSnapshot,
  QuerySnapshot,
} from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Encounter } from '../../encounters/encounters.consts.js';
import type { SignupSchema } from '../../slash-commands/signup/signup.schema.js';
import { FIRESTORE } from '../firebase.consts.js';
import { DocumentNotFoundException } from '../firebase.exceptions.js';
import { type SignupDocument, SignupStatus } from '../models/signup.model.js';
import { SignupCollection } from './signup.collection.js';

const SIGNUP_KEY = {
  discordId: '12345',
  encounter: Encounter.DSR,
};

describe('Signup Repository', () => {
  let repository: SignupCollection;
  let firestore: DeepMocked<Firestore>;
  let collection: DeepMocked<CollectionReference<DocumentData>>;
  let doc: DeepMocked<DocumentReference<DocumentData>>;
  const signupRequest = createMock<SignupSchema>(SIGNUP_KEY);

  beforeEach(async () => {
    doc = createMock<DocumentReference>();

    collection = createMock<CollectionReference<DocumentData>>({
      get: vi.fn(),
      where: vi.fn(),
      limit: vi.fn(),
      doc: vi.fn().mockReturnValue(doc) as any,
    });

    firestore = createMock<Firestore>({
      collection: vi.fn().mockReturnValue(collection) as any,
    });

    const fixture = await Test.createTestingModule({
      providers: [
        SignupCollection,
        {
          provide: FIRESTORE,
          useValue: firestore,
        },
      ],
    })
      .useMocker(() => createMock())
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
      createMock<DocumentSnapshot>({
        exists: true,
        data: () => existingData as any,
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
      createMock<DocumentSnapshot>({
        exists: true,
        data: () => existingData as any,
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
      createMock<DocumentSnapshot>({
        exists: false,
        data: () => null as any,
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
    await repository.updateSignupStatus(
      SignupStatus.APPROVED,
      SIGNUP_KEY,
      'reviewedBy',
    );

    expect(doc.update).toHaveBeenCalledWith({
      status: SignupStatus.APPROVED,
      reviewedBy: 'reviewedBy',
    });
  });

  it('should call setReviewMessageId with the correct arguments', async () => {
    await repository.setReviewMessageId(SIGNUP_KEY, 'messageId');

    expect(doc.update).toHaveBeenCalledWith({
      reviewMessageId: 'messageId',
    });
  });

  describe('#findByReviewId', () => {
    const mockFetch = (empty: any, signup: SignupDocument) => {
      collection.where.mockReturnValueOnce(
        createMock<Query>({
          limit: () =>
            createMock<Query>({
              get: () =>
                Promise.resolve(
                  createMock<QuerySnapshot>({
                    empty,
                    docs: [
                      createMock<QueryDocumentSnapshot<SignupDocument>>({
                        data: () => signup,
                      }),
                    ],
                  }),
                ),
            }),
        }),
      );
    };

    it('should return a signup by review if exists', async () => {
      const reviewMessageId = 'reviewMessageId';
      const signup = createMock<SignupDocument>({
        ...signupRequest,
        reviewMessageId,
        status: SignupStatus.PENDING,
      });

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
