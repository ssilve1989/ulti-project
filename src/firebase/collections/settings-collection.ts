import { Injectable } from '@nestjs/common';
import { CollectionReference, Firestore } from 'firebase-admin/firestore';
import { InjectFirestore } from '../firebase.decorators.js';
import { SettingsDocument } from '../models/settings.model.js';

@Injectable()
class SettingsCollection {
  private readonly collection: CollectionReference<SettingsDocument>;

  constructor(@InjectFirestore() firestore: Firestore) {
    this.collection = firestore.collection(
      'settings',
    ) as CollectionReference<SettingsDocument>;
  }

  public upsertSettings(guildId: string, settings: Partial<SettingsDocument>) {
    return this.collection.doc(guildId).set(settings, { merge: true });
  }

  public async getSettings(guildId: string) {
    const doc = await this.collection.doc(guildId).get();
    return doc.data();
  }

  public async getReviewChannel(guildId: string) {
    const doc = await this.collection.doc(guildId).get();
    return doc.data()?.reviewChannel;
  }
}

export { SettingsCollection };
