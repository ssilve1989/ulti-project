import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { SignupService } from './signup.service.js';
import { DeepMocked, createMock } from '@golevelup/ts-jest';
import {
  CollectionReference,
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
  Firestore,
} from 'firebase-admin/firestore';
import { FIRESTORE } from '../firebase/firebase.consts.js';
import { Encounter } from '../app.consts.js';
import { SignupRequest } from './signup.interfaces.js';

describe('Signup Service', () => {
  let service: SignupService;
  let firestore: DeepMocked<Firestore>;
  let collection: DeepMocked<CollectionReference<DocumentData>>;
  let doc: DeepMocked<DocumentReference<DocumentData>>;
  const signup: SignupRequest = {
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
      doc: jest.fn().mockReturnValue(doc) as any,
    });

    firestore = createMock<Firestore>({
      collection: jest.fn().mockReturnValue(collection) as any,
    });

    const fixture = await Test.createTestingModule({
      providers: [
        SignupService,
        {
          provide: FIRESTORE,
          useValue: firestore,
        },
      ],
    }).compile();

    service = fixture.get(SignupService);
  });

  it('should call set if document exists', async () => {
    doc.get.mockResolvedValueOnce(
      createMock<DocumentSnapshot>({ exists: true }),
    );

    await service.upsertSignup(signup);

    expect(doc.set).toHaveBeenCalledWith(signup, {
      mergeFields: ['fflogsLink', 'character', 'world', 'availability'],
    });

    expect(doc.create).not.toHaveBeenCalled();
  });

  it('should call create if document does not exist', async () => {
    doc.get.mockResolvedValueOnce(
      createMock<DocumentSnapshot>({ exists: false }),
    );

    await service.upsertSignup(signup);

    expect(doc.create).toHaveBeenCalledWith({ ...signup, approved: false });
    expect(doc.set).not.toHaveBeenCalled();
  });
});
