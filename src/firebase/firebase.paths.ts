import type {
  CollectionReference,
  DocumentReference,
  Firestore,
} from 'firebase-admin/firestore';

const GUILDS_COLLECTION = 'guilds';

/**
 * The document that scopes everything the bot stores for a guild. Settings live
 * directly on this document; every other collection hangs off it as a subcollection.
 */
export function guildDoc(
  firestore: Firestore,
  guildId: string,
): DocumentReference {
  return firestore.collection(GUILDS_COLLECTION).doc(guildId);
}

export function guildCollection<T>(
  firestore: Firestore,
  guildId: string,
  name: string,
): CollectionReference<T> {
  return guildDoc(firestore, guildId).collection(
    name,
  ) as CollectionReference<T>;
}
