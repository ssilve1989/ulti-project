import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { SignupRepository } from './signup.repository.js';
import { DeepMocked, createMock } from '@golevelup/ts-jest';
import {
  CollectionReference,
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
  Firestore,
  Query,
  QueryDocumentSnapshot,
  QuerySnapshot,
} from 'firebase-admin/firestore';
import { FIRESTORE } from '../firebase/firebase.consts.js';
import { Encounter } from '../app.consts.js';
import { Signup, SignupRequest } from './signup.interfaces.js';
import { SignupStatus } from './signup.consts.js';

describe('Signup Repository', () => {
  let repository: SignupRepository;
  let firestore: DeepMocked<Firestore>;
  let collection: DeepMocked<CollectionReference<DocumentData>>;
  let doc: DeepMocked<DocumentReference<DocumentData>>;
  const signupRequest: SignupRequest = {
    availability: 'availability',
    character: 'character',
    discordId: 'discordId',
    encounter: Encounter.DSR,
    fflogsLink: 'fflogsLink',
    username: 'username',
    world: 'world',
  };

  beforeEach(async () => {
    doc = createMock<DocumentReference>();

    // TODO: Why do we need to cast `as any` in jest ESM configuration? Without this TSC fails
    collection = createMock<CollectionReference<DocumentData>>({
      get: jest.fn() as any,
      where: jest.fn() as any,
      limit: jest.fn() as any,
      doc: jest.fn().mockReturnValue(doc) as any,
    });

    firestore = createMock<Firestore>({
      collection: jest.fn().mockReturnValue(collection) as any,
    });

    const fixture = await Test.createTestingModule({
      providers: [
        SignupRepository,
        {
          provide: FIRESTORE,
          useValue: firestore,
        },
      ],
    })
      .useMocker(() => createMock())
      .compile();

    repository = fixture.get(SignupRepository);
  });

  it('should call set if document exists', async () => {
    doc.get.mockResolvedValueOnce(
      createMock<DocumentSnapshot>({ exists: true }),
    );

    await repository.createSignup(signupRequest);

    expect(doc.set).toHaveBeenCalledWith(signupRequest, {
      mergeFields: ['fflogsLink', 'character', 'world', 'availability'],
    });

    expect(doc.create).not.toHaveBeenCalled();
  });

  it('should call create if document does not exist', async () => {
    doc.get.mockResolvedValueOnce(
      createMock<DocumentSnapshot>({ exists: false }),
    );

    await repository.createSignup(signupRequest);

    expect(doc.create).toHaveBeenCalledWith({
      ...signupRequest,
      status: SignupStatus.PENDING,
    });
    expect(doc.set).not.toHaveBeenCalled();
  });

  it('should call updateSignupStatus with the correct arguments', async () => {
    const key = {
      username: 'username',
      encounter: Encounter.DSR,
    };

    await repository.updateSignupStatus(
      SignupStatus.APPROVED,
      key,
      'reviewedBy',
    );

    expect(doc.update).toHaveBeenCalledWith({
      status: SignupStatus.APPROVED,
      reviewedBy: 'reviewedBy',
    });
  });

  it('should call setReviewMessageId with the correct arguments', async () => {
    const key = {
      username: 'username',
      encounter: Encounter.DSR,
    };

    await repository.setReviewMessageId(key, 'messageId');

    expect(doc.update).toHaveBeenCalledWith({
      reviewMessageId: 'messageId',
    });
  });

  describe('#findByReviewId', () => {
    const mockFetch = (empty = false, signup: Signup) => {
      collection.where.mockReturnValueOnce(
        createMock<Query>({
          limit: () =>
            createMock<Query>({
              get: () =>
                Promise.resolve(
                  createMock<QuerySnapshot>({
                    empty,
                    docs: [
                      createMock<QueryDocumentSnapshot<Signup>>({
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
      const signup = {
        ...signupRequest,
        reviewMessageId,
        status: SignupStatus.PENDING,
      };

      mockFetch(false, signup);

      const result = await repository.findByReviewId(reviewMessageId);

      expect(result).toEqual(signup);
    });

    it('should throw an error if no signup exists', () => {
      mockFetch(true, {} as Signup);

      expect(repository.findByReviewId('reviewMessageId')).rejects.toThrow(
        `No signup found for review message id: ${'reviewMessageId'}`,
      );
    });
  });
});
