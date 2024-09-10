import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CollectionReference, Firestore } from 'firebase-admin/firestore';
import { SentryTraced } from '../../observability/span.decorator.js';
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

    const result = await this.collection.doc(guildId).set(
      {
        ...settings,
        progRoles: progRolesUpdate,
        clearRoles: clearRolesUpdate,
      },
      { merge: true },
    );

    await this.cacheManager.set(this.cacheKey(guildId), result);
    return result;
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

  private cacheKey = (guildId: string) => `settings:${guildId}`;
}

export { SettingsCollection };
