import {
  FieldPath,
  FieldValue,
  Filter,
  Timestamp,
} from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryFirestore } from './in-memory-firestore.js';

describe('InMemoryFirestore', () => {
  let db: InMemoryFirestore;

  beforeEach(() => {
    db = new InMemoryFirestore();
  });

  describe('documents', () => {
    it('reads back what was written', async () => {
      await db.collection('signups').doc('a').set({ name: 'A' });

      const snapshot = await db.collection('signups').doc('a').get();

      expect(snapshot.exists).toBe(true);
      expect(snapshot.id).toBe('a');
      expect(snapshot.data()).toEqual({ name: 'A' });
    });

    it('reports a missing document as not existing', async () => {
      const snapshot = await db.collection('signups').doc('missing').get();

      expect(snapshot.exists).toBe(false);
      expect(snapshot.data()).toBeUndefined();
    });

    it('rejects create() when the document already exists', async () => {
      db.seed('signups/a', { name: 'A' });

      await expect(
        db.collection('signups').doc('a').create({ name: 'B' }),
      ).rejects.toThrow('ALREADY_EXISTS');
    });

    it('rejects update() when the document does not exist', async () => {
      await expect(
        db.collection('signups').doc('a').update({ name: 'B' }),
      ).rejects.toThrow('NOT_FOUND');
    });

    it('merges top-level fields on update()', async () => {
      db.seed('signups/a', { name: 'A', status: 'PENDING' });

      await db.collection('signups').doc('a').update({ status: 'APPROVED' });

      expect(db.read('signups/a')).toEqual({ name: 'A', status: 'APPROVED' });
    });

    it('drops undefined fields, like ignoreUndefinedProperties', async () => {
      db.seed('signups/a', { name: 'A', progPoint: 'P6' });

      await db
        .collection('signups')
        .doc('a')
        .update({ progPoint: undefined, status: 'APPROVED' });

      expect(db.read('signups/a')).toEqual({
        name: 'A',
        progPoint: 'P6',
        status: 'APPROVED',
      });
    });

    it('deep-merges nested maps on set() with merge', async () => {
      db.seed('settings/g', { progRoles: { DSR: 'r1' }, reviewChannel: 'c1' });

      await db
        .collection('settings')
        .doc('g')
        .set({ progRoles: { TOP: 'r2' } }, { merge: true });

      expect(db.read('settings/g')).toEqual({
        progRoles: { DSR: 'r1', TOP: 'r2' },
        reviewChannel: 'c1',
      });
    });

    it('replaces a field with an empty map on set() with merge, like Firestore', async () => {
      db.seed('settings/g', { progRoles: { DSR: 'r1' } });

      await db
        .collection('settings')
        .doc('g')
        .set({ progRoles: {} }, { merge: true });

      expect(db.read('settings/g')).toEqual({ progRoles: {} });
    });

    it('replaces only the named nested map on set() with mergeFields', async () => {
      db.seed('settings/g', {
        progPointRoles: { DSR: { P6: 'r1', P7: 'r2' }, TOP: { P1: 'r3' } },
      });

      await db
        .collection('settings')
        .doc('g')
        .set(
          { progPointRoles: { DSR: { P6: 'r9' } } },
          { mergeFields: [new FieldPath('progPointRoles', 'DSR')] },
        );

      expect(db.read('settings/g')).toEqual({
        progPointRoles: { DSR: { P6: 'r9' }, TOP: { P1: 'r3' } },
      });
    });

    it('keeps class instances such as Timestamp intact', async () => {
      const expiresAt = Timestamp.fromMillis(1_000);
      await db.collection('signups').doc('a').set({ expiresAt });

      const data = (await db.collection('signups').doc('a').get()).data();

      expect(data?.expiresAt).toBeInstanceOf(Timestamp);
    });

    it('returns copies, so mutating read data does not change what is stored', async () => {
      db.seed('settings/g', { progRoles: { DSR: 'r1' } });

      const data = (await db.collection('settings').doc('g').get()).data();
      if (data) data.progRoles = { DSR: 'mutated' };

      expect(db.read('settings/g')).toEqual({ progRoles: { DSR: 'r1' } });
    });

    it('generates an id for add()', async () => {
      const ref = await db.collection('signups').add({ name: 'A' });

      expect(db.read(`signups/${ref.id}`)).toEqual({ name: 'A' });
    });
  });

  describe('queries', () => {
    beforeEach(() => {
      db.seed('signups/a', { status: 'PENDING', order: 2 });
      db.seed('signups/b', { status: 'APPROVED', order: 1 });
      db.seed('signups/c', { status: 'PENDING', order: 3 });
      db.seed('signups/c/notes/x', { status: 'PENDING', order: 0 });
    });

    it('filters with ==', async () => {
      const snapshot = await db
        .collection('signups')
        .where('status', '==', 'PENDING')
        .get();

      expect(snapshot.docs.map((doc) => doc.id)).toEqual(['a', 'c']);
    });

    it('filters with in', async () => {
      const snapshot = await db
        .collection('signups')
        .where('status', 'in', ['APPROVED'])
        .get();

      expect(snapshot.docs.map((doc) => doc.id)).toEqual(['b']);
    });

    it('filters with >', async () => {
      const snapshot = await db
        .collection('signups')
        .where('order', '>', 1)
        .get();

      expect(snapshot.docs.map((doc) => doc.id)).toEqual(['a', 'c']);
    });

    it('orders descending and limits', async () => {
      const snapshot = await db
        .collection('signups')
        .orderBy('order', 'desc')
        .limit(2)
        .get();

      expect(snapshot.docs.map((doc) => doc.id)).toEqual(['c', 'a']);
    });

    it('does not include subcollection documents in the parent collection', async () => {
      const snapshot = await db.collection('signups').get();

      expect(snapshot.docs).toHaveLength(3);
    });

    it('queries a subcollection through its parent document', async () => {
      const snapshot = await db
        .collection('signups')
        .doc('c')
        .collection('notes')
        .get();

      expect(snapshot.docs.map((doc) => doc.id)).toEqual(['x']);
    });

    it('reports an empty result as empty', async () => {
      const snapshot = await db
        .collection('signups')
        .where('status', '==', 'DECLINED')
        .get();

      expect(snapshot.empty).toBe(true);
    });

    it('deletes a document through a query result reference', async () => {
      const snapshot = await db
        .collection('signups')
        .where('status', '==', 'APPROVED')
        .get();

      await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));

      expect(db.read('signups/b')).toBeUndefined();
    });

    it('rejects an in filter with an empty array, like Firestore', () => {
      expect(() => db.collection('signups').where('status', 'in', [])).toThrow(
        'non-empty array',
      );
    });

    it('refuses Filter objects it does not implement', () => {
      expect(() =>
        db
          .collection('signups')
          .where(Filter.or(Filter.where('status', '==', 'PENDING'))),
      ).toThrow('does not support');
    });

    it('refuses operators it does not implement', () => {
      expect(() =>
        db.collection('signups').where('tags', 'array-contains', 'x'),
      ).toThrow('does not support');
    });
  });

  describe('batches and transactions', () => {
    it('applies every batched write on commit', async () => {
      db.seed('items/a', { order: 0 });
      db.seed('items/b', { order: 1 });
      const batch = db.batch();

      batch.update(db.collection('items').doc('a'), { order: 1 });
      batch.update(db.collection('items').doc('b'), { order: 0 });
      await batch.commit();

      expect(db.read('items/a')).toEqual({ order: 1 });
      expect(db.read('items/b')).toEqual({ order: 0 });
    });

    it('applies nothing when one batched write fails', async () => {
      db.seed('items/a', { order: 0 });
      const batch = db.batch();

      batch.update(db.collection('items').doc('a'), { order: 5 });
      batch.update(db.collection('items').doc('missing'), { order: 1 });

      await expect(batch.commit()).rejects.toThrow('NOT_FOUND');
      expect(db.read('items/a')).toEqual({ order: 0 });
    });

    it('commits transaction writes after the callback resolves', async () => {
      db.seed('signups/a', { status: 'DECLINED' });
      const ref = db.collection('signups').doc('a');

      const result = await db.runTransaction(async (tx) => {
        const snapshot = await tx.get(ref);
        tx.update(ref, { declineReason: 'late' });
        return snapshot.data()?.status;
      });

      expect(result).toBe('DECLINED');
      expect(db.read('signups/a')).toEqual({
        status: 'DECLINED',
        declineReason: 'late',
      });
    });

    it('applies nothing when the transaction callback throws', async () => {
      db.seed('signups/a', { status: 'DECLINED' });
      const ref = db.collection('signups').doc('a');

      await expect(
        db.runTransaction(async (tx) => {
          await tx.get(ref);
          tx.update(ref, { declineReason: 'late' });
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      expect(db.read('signups/a')).toEqual({ status: 'DECLINED' });
    });
  });

  describe('what real Firestore rejects', () => {
    it('rejects an undefined query value', () => {
      expect(() =>
        db.collection('signups').where('status', '==', undefined),
      ).toThrow('Unsupported field value: undefined');
    });

    it('rejects an in filter with more than 30 values', () => {
      const values = Array.from({ length: 31 }, (_, i) => `v${i}`);

      expect(() =>
        db.collection('signups').where('status', 'in', values),
      ).toThrow('at most 30');
    });

    it('rejects running a query that needs a composite index', async () => {
      await expect(
        db
          .collection('signups')
          .where('status', '==', 'PENDING')
          .orderBy('order')
          .get(),
      ).rejects.toThrow('composite index');
    });

    it('refuses FieldValue sentinels it does not implement', async () => {
      await expect(
        db
          .collection('signups')
          .doc('a')
          .set({ updatedAt: FieldValue.serverTimestamp() }),
      ).rejects.toThrow('does not support');
    });
  });

  describe('transaction contention', () => {
    it('reruns the transaction when a document it read changes before commit', async () => {
      db.seed('counters/a', { count: 0 });
      const ref = db.collection('counters').doc('a');
      let attempts = 0;

      await db.runTransaction(async (tx) => {
        attempts++;
        const snapshot = await tx.get(ref);
        if (attempts === 1) {
          // another writer lands between this transaction's read and commit
          await ref.update({ count: 10 });
        }
        const count = snapshot.data()?.count;
        tx.update(ref, { count: typeof count === 'number' ? count + 1 : -1 });
      });

      expect(attempts).toBe(2);
      expect(db.read('counters/a')).toEqual({ count: 11 });
    });
  });
});
