import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import {
  type CollectionReference,
  type DocumentData,
  Filter,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { InjectFirestore } from '../firebase.decorators.js';
import type { BlacklistDocument } from '../models/blacklist.model.js';

type BlacklistDocumentKeys = Pick<
  BlacklistDocument,
  'characterName' | 'discordId'
>;

@Injectable()
class BlacklistCollection {
  constructor(@InjectFirestore() private readonly firestore: Firestore) {}

  public async getBlacklist(guildId: string): Promise<BlacklistDocument[]> {
    const collection = this.getCollection(guildId);
    const snapshot = await collection.get();
    return snapshot.docs.map((doc) => doc.data());
  }

  /**
   * Upsert a BlacklistDocument into the collection
   * @param props
   * @returns the upserted document
   */
  public async upsert(
    guildId: string,
    source: BlacklistDocument,
  ): Promise<BlacklistDocument> {
    // The reason we are not using `.set()` here with merge to perform an upsert
    // is because we cannot rely on knowing the unique key of the document
    // It is possible to add an entry without a discordId or lodestoneId
    const collection = this.getCollection(guildId);
    const document = collection.doc(source.discordId);

    await document.set(source, { merge: true });
    const snapshot = await document.get();

    return snapshot.data() as BlacklistDocument;
  }

  /**
   * Remove a matching BlacklistDocument from the collection if it exists
   * @param props
   * @returns
   */
  public async remove(
    guildId: string,
    discordId: string,
  ): Promise<BlacklistDocument | undefined> {
    const snapshot = await this.getCollection(guildId).doc(discordId).get();
    if (!snapshot.exists) return undefined;

    const doc = snapshot.data();
    await snapshot.ref.delete();
    return doc;
  }

  public async search({
    guildId,
    discordId,
    characterName,
  }: { guildId: string } & Pick<
    BlacklistDocument,
    'discordId' | 'characterName'
  >): Promise<BlacklistDocument | undefined> {
    const res = await this.query(guildId, { discordId, characterName });
    return res?.data();
  }

  /**
   * Query the collection for the given data and emit the first result
   * @param data
   * @returns
   */
  @SentryTraced('blacklist.query')
  private async query(
    guildId: string,
    data: Partial<BlacklistDocumentKeys>,
  ): Promise<QueryDocumentSnapshot<BlacklistDocument, DocumentData> | null> {
    const collection = this.getCollection(guildId);

    const conditions = Object.entries(data)
      .filter(([_, value]) => !!value)
      .map(([key, value]) => Filter.where(key, '==', value));

    const res = await collection
      .where(Filter.or(...conditions))
      .limit(1)
      .get();

    if (res.empty) return null;

    return res.docs[0];
  }

  private getCollection(
    guildId: string,
  ): CollectionReference<BlacklistDocument> {
    return this.firestore.collection(`blacklist/${guildId}/documents`);
  }
}

export { BlacklistCollection };
