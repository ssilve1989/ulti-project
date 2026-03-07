import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAutoMock } from '../../test-utils/mock-factory.js';
import { FIRESTORE } from '../firebase.consts.js';
import { SettingsCollection } from './settings-collection.js';

describe.each([
  { cache: true },
  { cache: false },
])('SettingsCollection with cache: $cache', ({ cache }) => {
  let service: SettingsCollection;
  let firestoreMock: { collection: ReturnType<typeof vi.fn> };
  let collectionMock: {
    doc: ReturnType<typeof vi.fn>;
    where: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };
  let docMock: {
    set: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  const guildId = 'guildId';

  beforeEach(async () => {
    docMock = {
      set: vi.fn(),
      get: vi.fn().mockResolvedValue({ data: () => undefined }),
      update: vi.fn(),
      create: vi.fn(),
    };
    collectionMock = {
      doc: vi.fn().mockReturnValue(docMock),
      where: vi.fn(),
      limit: vi.fn(),
      get: vi.fn(),
    };
    firestoreMock = { collection: vi.fn().mockReturnValue(collectionMock) };

    const module = await Test.createTestingModule({
      providers: [
        SettingsCollection,
        { provide: FIRESTORE, useValue: firestoreMock },
      ],
    })
      .useMocker(createAutoMock)
      .compile();

    service = module.get<SettingsCollection>(SettingsCollection);
    // Mock the cache behavior by setting up service internal cache
    if (cache) {
      (service as any).cache.set('settings:guildId', {});
    }
  });

  it('should call upsert with with correct arguments', async () => {
    const settings = { reviewChannel: 'channel', reviewerRole: 'role' };

    await service.upsert(guildId, settings);

    expect(firestoreMock.collection).toHaveBeenCalledWith('settings');
    expect(collectionMock.doc).toHaveBeenCalledWith(guildId);
    expect(docMock.set).toHaveBeenCalledWith(settings, { merge: true });
  });

  it('should call getReviewChannel with correct arguments', async () => {
    await service.getReviewChannel(guildId);
    expect(firestoreMock.collection).toHaveBeenCalledWith('settings');

    if (cache) {
      expect(collectionMock.doc).not.toHaveBeenCalled();
    } else {
      expect(collectionMock.doc).toHaveBeenCalledWith(guildId);
      expect(docMock.get).toHaveBeenCalled();
    }
  });

  it('should call getSettings with correct arguments', async () => {
    await service.getSettings(guildId);
    expect(firestoreMock.collection).toHaveBeenCalledWith('settings');

    if (cache) {
      expect(collectionMock.doc).not.toHaveBeenCalled();
    } else {
      expect(collectionMock.doc).toHaveBeenCalledWith(guildId);
      expect(docMock.get).toHaveBeenCalled();
    }
  });
});
