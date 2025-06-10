import type { CollectionReference, Firestore } from 'firebase-admin/firestore';

/**
 *
 * @param firestore
 * @param options
 * @returns
 */
export function getGuildCollection<T>(
  firestore: Firestore,
  options: { collectionName: string; guildId: string },
) {
  return firestore.collection(
    `${options.collectionName}/${options.guildId}/documents`,
  ) as CollectionReference<T>;
}
