import type {
  CollectionReference,
  DocumentData,
} from 'firebase-admin/firestore';

/** Anything that can open a subcollection: a `Firestore` or a `DocumentReference`. */
interface CollectionParent {
  collection(collectionPath: string): CollectionReference<DocumentData>;
}

/**
 * Firestore types `.collection(path)` as `CollectionReference<DocumentData>`
 * because a collection path carries no schema. This helper is the single place
 * that asserts the document shape for a path we own; callers pass the real `<T>`,
 * so every downstream `.doc()`, `.get()`, `.set()` and `doc.data()` is then
 * type-checked against `T` and a model change is caught at compile time.
 */
export function typedCollection<T extends DocumentData>(
  parent: CollectionParent,
  path: string,
): CollectionReference<T> {
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: Firestore cannot infer a document type from a collection path; this is the one sanctioned boundary assertion for typed collections — callers supply <T> and are checked against it everywhere else.
  return parent.collection(path) as CollectionReference<T>;
}
