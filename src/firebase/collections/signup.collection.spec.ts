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
  let firestore: any;
  let collection: any;
  let doc: any;
  const signupRequest = {
    ...SIGNUP_KEY,
    character: 'Test Character',
    world: 'Test World',
    role: 'Tank',
  } as any;

  beforeEach(async () => {
    doc = {
      get: vi.fn().mockResolvedValue({
        exists: true,
        data: vi.fn().mockReturnValue({}),
      }),
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      create: vi.fn(),
    } as any;

    collection = {
      get: vi.fn().mockResolvedValue({
        docs: [],
        size: 0,
      }),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      doc: vi.fn().mockReturnValue(doc),
    } as any;

    firestore = {
      collection: vi.fn().mockReturnValue(collection),
    } as any;

    const fixture = await Test.createTestingModule({
      providers: [
        SignupCollection,
        {
          provide: FIRESTORE,
          useValue: firestore,
        },
      ],
    })
      .useMocker((token) => {
        if (typeof token === 'function') {
          const mockValue = vi.fn();
          const proto = token.prototype;
          if (proto) {
            Object.getOwnPropertyNames(proto).forEach(key => {
              if (key !== 'constructor') {
                mockValue[key] = vi.fn();
              }
            });
          }
          return mockValue;
        }
        return {};
      })
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
      {
        exists: true,
        data: () => existingData as any,
      } as any,
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
      {
        exists: true,
        data: () => existingData as any,
      } as any,
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
      {
        exists: false,
        data: () => null as any,
      } as any,
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
      collection.where.mockReturnValueOnce({
        limit: () => ({
          get: () =>
            Promise.resolve({
              empty,
              docs: [{
                data: () => signup,
              }],
            } as any),
        } as any),
      } as any);
    };

    it('should return a signup by review if exists', async () => {
      const reviewMessageId = 'reviewMessageId';
      const signup = {
        ...signupRequest,
        reviewMessageId,
        status: SignupStatus.PENDING,
      } as any;

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
