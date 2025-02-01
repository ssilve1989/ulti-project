import { Injectable } from '@nestjs/common';
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
    const { reason, ...props } = source;
    const collection = this.getCollection(guildId);

    // so we search by fields with an OR condition to find if a record exists
    const res = await this.query(guildId, props);
    // and if it does we call set to update it
    if (res) {
      await res.ref.set(source, {
        merge: true,
      });
      return res.data();
    }

    // otherwise we create the document and return it
    const doc = await collection.add(source);
    const snapshot = await doc.get();
    return snapshot.data() as BlacklistDocument;
  }

  /**
   * Remove a matching BlacklistDocument from the collection if it exists
   * @param props
   * @returns
   */
  public async remove(
    guildId: string,
    props: ExactType<
      BlacklistDocument,
      'discordId' | 'characterName' | 'lodestoneId'
    >,
  ): Promise<BlacklistDocument | undefined> {
    const res = await this.query(guildId, props);

    if (!res) return undefined;

    await res.ref.delete();
    return res.data();
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
  private async query(
    guildId: string,
    data: BlacklistDocumentKeys,
  ): Promise<QueryDocumentSnapshot<BlacklistDocument, DocumentData> | null> {
    const collection = this.getCollection(guildId);

    const conditions = Object.entries(data).map(([key, value]) =>
      Filter.where(key, '==', value),
    );

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
