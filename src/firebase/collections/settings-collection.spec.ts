import { DeepMocked, createMock } from '@golevelup/ts-vitest';
import { Test } from '@nestjs/testing';
import { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firebase.consts.js';
import { SettingsCollection } from './settings-collection.js';

describe('SettingsCollection', () => {
  let service: SettingsCollection;
  let firestore: DeepMocked<Firestore>;
  const guildId = 'guildId';

  beforeEach(async () => {
    firestore = createMock<Firestore>();

    const module = await Test.createTestingModule({
      providers: [SettingsCollection],
    })
      .useMocker(() => createMock())
      .compile();

    service = module.get<SettingsCollection>(SettingsCollection);
    firestore = module.get(FIRESTORE);
  });

  it('should call upsert with correct arguments', async () => {
    const settings = { reviewChannel: 'channel', reviewerRole: 'role' };

    await service.upsert(guildId, settings);

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
