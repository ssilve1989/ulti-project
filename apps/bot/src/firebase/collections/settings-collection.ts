import { Injectable, Logger } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import {
  type Encounter,
  type Job,
  typedCollection,
} from '@ulti-project/shared';
import {
  CollectionReference,
  FieldPath,
  Firestore,
} from 'firebase-admin/firestore';
import { InjectFirestore } from '../firebase.decorators.js';
import type { SettingsDocument } from '../models/settings.model.js';

@Injectable()
class SettingsCollection {
  private readonly collection: CollectionReference<SettingsDocument>;
  private readonly logger = new Logger(SettingsCollection.name);
  private readonly cache = new Map<string, SettingsDocument | undefined>();

  constructor(@InjectFirestore() firestore: Firestore) {
    this.collection = typedCollection<SettingsDocument>(firestore, 'settings');
  }

  @SentryTraced()
  public async upsert(guildId: string, settings: Partial<SettingsDocument>) {
    await this.collection.doc(guildId).set(settings, { merge: true });

    await this.updateCache(guildId);
  }

  @SentryTraced()
  public async setJobEmojis(
    guildId: string,
    jobEmojis: Partial<Record<Job, string>>,
  ) {
    // mergeFields replaces the whole map, so a cleared job's key disappears;
    // { merge: true } would keep it
    await this.collection
      .doc(guildId)
      .set({ jobEmojis }, { mergeFields: ['jobEmojis'] });
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
    const cachedValue = this.cache.get(key);

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
