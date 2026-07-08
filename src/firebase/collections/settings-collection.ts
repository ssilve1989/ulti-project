import { Injectable, Logger } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import {
  CollectionReference,
  FieldPath,
  Firestore,
} from 'firebase-admin/firestore';
import type { Encounter } from '../../encounters/encounters.consts.js';
import { InjectFirestore } from '../firebase.decorators.js';
import type { SettingsDocument } from '../models/settings.model.js';

@Injectable()
class SettingsCollection {
  private readonly collection: CollectionReference<SettingsDocument>;
  private readonly logger = new Logger(SettingsCollection.name);
  private readonly cache = new Map<string, unknown>();

  constructor(@InjectFirestore() firestore: Firestore) {
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
  public async setProgPointRoles(
    guildId: string,
    encounter: Encounter,
    progPointRoles: Record<string, string>,
  ) {
    // mergeFields replaces exactly this encounter's map, so removed
    // prog point keys don't linger the way they would with { merge: true }
    await this.collection
      .doc(guildId)
      .set(
        { progPointRoles: { [encounter]: progPointRoles } },
        { mergeFields: [new FieldPath('progPointRoles', encounter)] },
      );

    await this.updateCache(guildId);
  }

  @SentryTraced()
  public async getSettings(guildId: string) {
    const key = this.cacheKey(guildId);
    const cachedValue = this.cache.get(key) as SettingsDocument | undefined;

    if (cachedValue) {
      return Promise.resolve(cachedValue);
    }

    const doc = await this.collection.doc(guildId).get();

    this.cache.set(key, doc.data());

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
      this.cache.set(key, settings.data());
    } catch (e: unknown) {
      this.logger.warn(`failed to update cache: invalidating key ${key}`);
      this.logger.error(e);
      this.cache.delete(this.cacheKey(guildId));
    }
  }

  private cacheKey = (guildId: string) => `settings:${guildId}`;
}

export { SettingsCollection };
