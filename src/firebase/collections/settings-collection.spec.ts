import { Test } from '@nestjs/testing';
import { Firestore } from 'firebase-admin/firestore';
import { SettingsCollection } from './settings-collection.js';
import { FIRESTORE } from '../firebase.consts.js';
import { DeepMocked, createMock } from '../../../test/create-mock.js';

describe('SettingsCollection', () => {
  let service: SettingsCollection;
  let firestore: DeepMocked<Firestore>;
  const guildId = 'guildId';

  beforeEach(async () => {
    const docMock = {
      set: vi.fn(),
      get: vi.fn<any>().mockResolvedValue({
        data: () => ({ reviewChannel: 'channel', reviewerRole: 'role' }),
      }),
    };

    const collectionMock = {
      doc: vi.fn().mockReturnValue(docMock),
    };

    firestore = createMock<Firestore>({
      collection: vi.fn().mockReturnValue(collectionMock),
    });

    const module = await Test.createTestingModule({
      providers: [
        SettingsCollection,
        { provide: FIRESTORE, useValue: firestore },
      ],
    }).compile();

    service = module.get<SettingsCollection>(SettingsCollection);
  });

  it('should call upsertSettings with correct arguments', async () => {
    const settings = { reviewChannel: 'channel', reviewerRole: 'role' };

    await service.upsertSettings(guildId, settings);

    expect(firestore.collection).toHaveBeenCalledWith('settings');
    expect(firestore.collection('').doc).toHaveBeenCalledWith(guildId);
    expect(firestore.collection('').doc().set).toHaveBeenCalledWith(settings, {
      merge: true,
    });
  });

  it('should call getReviewChannel with correct arguments', async () => {
    await service.getReviewChannel(guildId);

    expect(firestore.collection).toHaveBeenCalledWith('settings');
    expect(firestore.collection('').doc).toHaveBeenCalledWith(guildId);
    expect(firestore.collection('').doc().get).toHaveBeenCalled();
  });

  it('should call getSettings with correct arguments', async () => {
    await service.getSettings(guildId);

    expect(firestore.collection).toHaveBeenCalledWith('settings');
    expect(firestore.collection('').doc).toHaveBeenCalledWith(guildId);
    expect(firestore.collection('').doc().get).toHaveBeenCalled();
  });
});
