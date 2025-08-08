import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test } from '@nestjs/testing';
import type { Cache } from 'cache-manager';
import { Firestore } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FIRESTORE } from '../firebase.consts.js';
import { SettingsCollection } from './settings-collection.js';

describe.each([{ cache: true }, { cache: false }])(
  'SettingsCollection with cache: $cache',
  ({ cache }) => {
    let service: SettingsCollection;
    let firestore: any;
    let cacheManager: any;
    const guildId = 'guildId';

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [SettingsCollection],
      })
        .useMocker((token) => {
          if (token === FIRESTORE) {
            return {
              collection: vi.fn().mockReturnValue({
                doc: vi.fn().mockReturnValue({
                  get: vi.fn().mockResolvedValue({
                    data: vi.fn().mockReturnValue({}),
                  }),
                  set: vi.fn(),
                  update: vi.fn(),
                }),
              }),
            };
          }
          if (token === CACHE_MANAGER) {
            return {
              get: vi.fn(),
              set: vi.fn(),
              del: vi.fn(),
            };
          }
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

      service = module.get<SettingsCollection>(SettingsCollection);
      firestore = module.get(FIRESTORE);
      cacheManager = module.get(CACHE_MANAGER);
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
