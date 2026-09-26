import { Test } from '@nestjs/testing';
import { Encounter } from '@ulti-project/shared';
import { test as base, describe, expect } from 'vitest';
import { InMemoryFirestore } from '../../test-utils/firestore/in-memory-firestore.js';
import { fresh } from '../../test-utils/fixtures.js';
import { FIRESTORE } from '../firebase.consts.js';
import { SettingsCollection } from './settings-collection.js';

const GUILD = 'guild-1';
const PATH = `settings/${GUILD}`;

const it = base.extend<{
  db: InMemoryFirestore;
  settings: SettingsCollection;
}>({
  db: fresh(() => new InMemoryFirestore()),
  settings: async ({ db }, use) => {
    const moduleRef = await Test.createTestingModule({
      providers: [SettingsCollection, { provide: FIRESTORE, useValue: db }],
    }).compile();
    await use(moduleRef.get(SettingsCollection));
  },
});

describe('SettingsCollection', () => {
  it('reads the review channel from stored settings', async ({
    db,
    settings,
  }) => {
    db.seed(PATH, { reviewChannel: 'review' });

    await expect(settings.getReviewChannel(GUILD)).resolves.toBe('review');
  });

  it('reads the whole stored settings document', async ({ db, settings }) => {
    db.seed(PATH, {
      reviewChannel: 'review',
      signupChannel: 'signups',
      progRoles: { DSR: 'r1' },
    });

    await expect(settings.getSettings(GUILD)).resolves.toEqual(db.read(PATH));
  });

  it('returns undefined for a guild with no settings', async ({ settings }) => {
    await expect(settings.getSettings(GUILD)).resolves.toBeUndefined();
  });

  it('merges an upsert into the existing settings', async ({
    db,
    settings,
  }) => {
    db.seed(PATH, { reviewChannel: 'review', progRoles: { DSR: 'r1' } });

    await settings.upsert(GUILD, { signupChannel: 'signups' });

    expect(db.read(PATH)).toEqual({
      reviewChannel: 'review',
      signupChannel: 'signups',
      progRoles: { DSR: 'r1' },
    });
  });

  it('ignores empty role maps so they do not wipe existing roles', async ({
    db,
    settings,
  }) => {
    db.seed(PATH, { progRoles: { DSR: 'r1' }, clearRoles: { DSR: 'c1' } });

    await settings.upsert(GUILD, { progRoles: {}, clearRoles: {} });

    expect(db.read(PATH)).toEqual({
      progRoles: { DSR: 'r1' },
      clearRoles: { DSR: 'c1' },
    });
  });

  it('replaces only the given encounter prog point role map', async ({
    db,
    settings,
  }) => {
    db.seed(PATH, {
      progPointRoles: { DSR: { P6: 'r1', P7: 'r2' }, TOP: { P1: 'r3' } },
    });

    await settings.setProgPointRoles(GUILD, Encounter.DSR, { P6: 'r9' });

    expect(db.read(PATH)).toEqual({
      progPointRoles: { DSR: { P6: 'r9' }, TOP: { P1: 'r3' } },
    });
  });

  describe('caching', () => {
    it('serves settings from cache after the first read', async ({
      db,
      settings,
    }) => {
      db.seed(PATH, { reviewChannel: 'review' });
      await settings.getSettings(GUILD);

      db.seed(PATH, { reviewChannel: 'changed-outside-the-bot' });

      // the stored document changed, so only a cached copy can still say 'review'
      await expect(settings.getSettings(GUILD)).resolves.toEqual({
        reviewChannel: 'review',
      });
    });

    it('refreshes the cache when settings are written', async ({
      db,
      settings,
    }) => {
      db.seed(PATH, { reviewChannel: 'review' });
      await settings.getSettings(GUILD);

      await settings.upsert(GUILD, { reviewChannel: 'new-review' });

      await expect(settings.getSettings(GUILD)).resolves.toEqual({
        reviewChannel: 'new-review',
      });
    });

    it('refreshes the cache when prog point roles are set', async ({
      db,
      settings,
    }) => {
      db.seed(PATH, { progPointRoles: { DSR: { P6: 'r1' } } });
      await settings.getSettings(GUILD);

      await settings.setProgPointRoles(GUILD, Encounter.DSR, { P6: 'r9' });

      await expect(settings.getSettings(GUILD)).resolves.toEqual({
        progPointRoles: { DSR: { P6: 'r9' } },
      });
    });
  });
});
