import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import { CollectionReference, Firestore } from 'firebase-admin/firestore';
import { InjectFirestore } from '../firebase.decorators.js';
import type { SettingsDocument } from '../models/settings.model.js';

@Injectable()
class SettingsCollection {
  private readonly collection: CollectionReference<SettingsDocument>;
  private readonly logger = new Logger(SettingsCollection.name);

  constructor(
    @InjectFirestore() firestore: Firestore,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {
    this.collection = firestore.collection(
      'settings',
    ) as CollectionReference<SettingsDocument>;
  }

  @SentryTraced()
  public async upsert(
    guildId: string,
    { progRoles, clearRoles, ...settings }: Partial<SettingsDocument>,
  ) {
    // prevent empty object from overriding all existing prog roles
    // quick n dirty fix for now
    const progRolesUpdate =
      progRoles && Object.keys(progRoles).length === 0 ? undefined : progRoles;

    const clearRolesUpdate =
      clearRoles && Object.keys(clearRoles).length === 0
        ? undefined
        : clearRoles;

    await this.collection.doc(guildId).set(
      {
        ...settings,
        progRoles: progRolesUpdate,
        clearRoles: clearRolesUpdate,
      },
      { merge: true },
    );

    await this.updateCache(guildId);
  }

  @SentryTraced()
  public async getSettings(guildId: string) {
    const key = this.cacheKey(guildId);
    const cachedValue = await this.cacheManager.get<SettingsDocument>(key);

    if (cachedValue) {
      return Promise.resolve(cachedValue);
    }

    const doc = await this.collection.doc(guildId).get();

    await this.cacheManager.set(key, doc.data());

    return doc.data();
  }

  @SentryTraced()
  public async getReviewChannel(guildId: string) {
    const settings = await this.getSettings(guildId);
    return settings?.reviewChannel;
  }

  private async updateCache(guildId: string) {
    const key = this.cacheKey(guildId);
    try {
      const settings = await this.collection.doc(guildId).get();
      await this.cacheManager.set(key, settings.data());
    } catch (e: unknown) {
      this.logger.warn(`failed to update cache: invalidating key ${key}`);
      this.logger.error(e);
      await this.cacheManager.del(this.cacheKey(guildId));
    }
  }

  private cacheKey = (guildId: string) => `settings:${guildId}`;
}

export { SettingsCollection };
