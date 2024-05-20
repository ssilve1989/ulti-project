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

  public async upsert(
    guildId: string,
    { progRoles, ...settings }: Partial<SettingsDocument>,
  ) {
    // prevent empty object from overriding all existing prog roles
    // quick n dirty fix for now
    const progRolesUpdate =
      progRoles && Object.keys(progRoles).length === 0 ? undefined : progRoles;

    return await this.collection
      .doc(guildId)
      .set({ ...settings, progRoles: progRolesUpdate }, { merge: true });
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
