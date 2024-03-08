import { Test } from '@nestjs/testing';
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
import { DeepMocked, createMock } from '../../../test/create-mock.js';
import { SignupInteractionDto } from '../../commands/signup/signup-request.dto.js';
import { Encounter } from '../../encounters/encounters.consts.js';
import { FIRESTORE } from '../firebase.consts.js';
import { SignupDocument, SignupStatus } from '../models/signup.model.js';
import { SignupRepository } from './signup.repository.js';

const SIGNUP_KEY = {
  discordId: '12345',
  encounter: Encounter.DSR,
};

describe('Signup Repository', () => {
  let repository: SignupRepository;
  let firestore: DeepMocked<Firestore>;
  let collection: DeepMocked<CollectionReference<DocumentData>>;
  let doc: DeepMocked<DocumentReference<DocumentData>>;
  const signupRequest = createMock<SignupInteractionDto>(SIGNUP_KEY);

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

    expect(doc.set).toHaveBeenCalledWith(
      {
        ...signupRequest,
        status: SignupStatus.PENDING,
        reviewedBy: null,
      },
      {
        merge: true,
      },
    );

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
    const mockFetch = (empty, signup: SignupDocument) => {
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
      mockFetch(true, {} as SignupDocument);

      expect(repository.findByReviewId('reviewMessageId')).rejects.toThrow(
        `No signup found for review message id: ${'reviewMessageId'}`,
      );
    });
  });
});
