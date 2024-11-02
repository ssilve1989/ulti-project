import { Injectable } from '@nestjs/common';
import type { CollectionReference, Firestore } from 'firebase-admin/firestore';
import {
  EMPTY,
  EmptyError,
  catchError,
  concatMap,
  filter,
  first,
  from,
  lastValueFrom,
  map,
  mergeMap,
} from 'rxjs';
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
    const { reason, ...props } = source;
    const collection = this.getCollection(guildId);
    const pipeline$ = this.query$(guildId, props).pipe(
      mergeMap(async (result) => {
        const doc = result.docs[0];
        await doc.ref.update(source as Record<string, any>, {
          exists: true,
        });
        return await doc.ref.get();
      }),
      catchError(async (err) => {
        if (err instanceof EmptyError) {
          const doc = await collection.add(source);
          return await doc.get();
        }
        throw err;
      }),
    );

    const snapshot = await lastValueFrom(pipeline$);
    return snapshot.data() as BlacklistDocument;
  }

  /**
   * Remove a matching BlacklistDocument from the collection if it exists
   * @param props
   * @returns
   */
  public remove(
    guildId: string,
    props: ExactType<
      BlacklistDocument,
      'discordId' | 'characterName' | 'lodestoneId'
    >,
  ): Promise<BlacklistDocument | undefined> {
    const pipeline$ = this.query$(guildId, props).pipe(
      mergeMap(async (result) => {
        const doc = result.docs[0];
        const data = doc.data() as BlacklistDocument;
        await doc.ref.delete();
        return data;
      }),
      catchError((err) => {
        if (err instanceof EmptyError) {
          return EMPTY;
        }
        throw err;
      }),
    );

    return lastValueFrom(pipeline$, { defaultValue: undefined });
  }

  public search({
    guildId,
    discordId,
    characterName,
  }: { guildId: string } & Pick<
    BlacklistDocument,
    'discordId' | 'characterName'
  >) {
    return this.query$(guildId, { discordId, characterName }).pipe(
      map((result) => result.docs[0]!.data()),
    );
  }

  /**
   * Query the collection for the given data and emit the first result
   * @param data
   * @returns
   */
  private query$(guildId: string, data: BlacklistDocumentKeys) {
    const collection = this.getCollection(guildId);
    return from(Object.entries(data)).pipe(
      filter(([_, value]) => !!value),
      // use concatMap to potentially save on query costs if one query returns successfully early
      concatMap(([key, value]) =>
        collection.where(key, '==', value).limit(1).get(),
      ),
      first((result) => !result.empty),
    );
  }

  private getCollection(
    guildId: string,
  ): CollectionReference<BlacklistDocument> {
    return this.firestore.collection(`blacklist/${guildId}/documents`);
  }
}

export { BlacklistCollection };
