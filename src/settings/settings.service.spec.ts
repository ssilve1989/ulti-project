import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { DeepMocked, createMock } from '@golevelup/ts-jest';
import { Firestore } from 'firebase-admin/firestore';
import { SettingsService } from './settings.service.js';
import { FIRESTORE } from '../firebase/firebase.consts.js';

describe('SettingsService', () => {
  let service: SettingsService;
  let firestore: DeepMocked<Firestore>;

  beforeEach(async () => {
    const docMock = {
      set: jest.fn(),
      get: jest.fn<any>().mockResolvedValue({
        data: () => ({ reviewChannel: 'channel', reviewerRole: 'role' }),
      }),
    };

    const collectionMock = {
      doc: jest.fn().mockReturnValue(docMock),
    };

    firestore = createMock<Firestore>({
      collection: jest.fn<any>().mockReturnValue(collectionMock),
    });

    const module = await Test.createTestingModule({
      providers: [SettingsService, { provide: FIRESTORE, useValue: firestore }],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
  });

  it('should call upsertSettings with correct arguments', async () => {
    const guildId = 'guildId';
    const settings = { reviewChannel: 'channel', reviewerRole: 'role' };

    await service.upsertSettings(guildId, settings);

    expect(firestore.collection).toHaveBeenCalledWith('settings');
    expect(firestore.collection('').doc).toHaveBeenCalledWith(guildId);
    expect(firestore.collection('').doc().set).toHaveBeenCalledWith(settings, {
      merge: true,
    });
  });

  it('should call getReviewChannel with correct arguments', async () => {
    const guildId = 'guildId';

    await service.getReviewChannel(guildId);

    expect(firestore.collection).toHaveBeenCalledWith('settings');
    expect(firestore.collection('').doc).toHaveBeenCalledWith(guildId);
    expect(firestore.collection('').doc().get).toHaveBeenCalled();
  });

  it('should call getReviewerRole with correct arguments', async () => {
    const guildId = 'guildId';

    await service.getReviewerRole(guildId);

    expect(firestore.collection).toHaveBeenCalledWith('settings');
    expect(firestore.collection('').doc).toHaveBeenCalledWith(guildId);
    expect(firestore.collection('').doc().get).toHaveBeenCalled();
  });

  it('should call getSettings with correct arguments', async () => {
    const guildId = 'guildId';

    await service.getSettings(guildId);

    expect(firestore.collection).toHaveBeenCalledWith('settings');
    expect(firestore.collection('').doc).toHaveBeenCalledWith(guildId);
    expect(firestore.collection('').doc().get).toHaveBeenCalled();
  });
});
