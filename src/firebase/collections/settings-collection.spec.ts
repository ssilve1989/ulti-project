import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test } from '@nestjs/testing';
import type { Cache } from 'cache-manager';
import { Firestore } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import { FIRESTORE } from '../firebase.consts.js';
import { SettingsCollection } from './settings-collection.js';

describe.each([{ cache: true }, { cache: false }])(
  'SettingsCollection with cache: $cache',
  ({ cache }) => {
    let service: SettingsCollection;
    let firestore: DeepMocked<Firestore>;
    let cacheManager: DeepMocked<Cache>;
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
      cacheManager = module.get<DeepMocked<Cache>>(CACHE_MANAGER);
      cacheManager.get.mockResolvedValueOnce(cache ? {} : undefined);
    });

    it('should call upsert with with correct arguments', async () => {
      const settings = { reviewChannel: 'channel', reviewerRole: 'role' };

      await service.upsert(guildId, settings);

      expect(firestore.collection).toHaveBeenCalledWith('settings');
      expect(firestore.collection('').doc).toHaveBeenCalledWith(guildId);
      expect(firestore.collection('').doc().set).toHaveBeenCalledWith(
        settings,
        {
          merge: true,
        },
      );
    });

    it('should call getReviewChannel with correct arguments', async () => {
      await service.getReviewChannel(guildId);
      expect(firestore.collection).toHaveBeenCalledWith('settings');

      if (cache) {
        expect(firestore.collection('').doc).not.toHaveBeenCalled();
      } else {
        expect(firestore.collection('').doc).toHaveBeenCalledWith(guildId);
        expect(firestore.collection('').doc().get).toHaveBeenCalled();
      }
    });

    it('should call getSettings with correct arguments', async () => {
      await service.getSettings(guildId);
      expect(firestore.collection).toHaveBeenCalledWith('settings');

      if (cache) {
        expect(firestore.collection('').doc).not.toHaveBeenCalled();
      } else {
        expect(firestore.collection('').doc).toHaveBeenCalledWith(guildId);
        expect(firestore.collection('').doc().get).toHaveBeenCalled();
      }
    });
  },
);
