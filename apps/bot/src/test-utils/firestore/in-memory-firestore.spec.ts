import {
  FieldPath,
  FieldValue,
  Filter,
  Timestamp,
} from 'firebase-admin/firestore';
import { test as base, describe, expect, vi } from 'vitest';
import { fresh } from '#src/test-utils/fixtures.js';
import { InMemoryFirestore } from './in-memory-firestore.js';

const it = base.extend<{ db: InMemoryFirestore }>({
  db: fresh(() => new InMemoryFirestore()),
});

/** The map stored under `field` of `data`, for mutating it in place. */
function nestedMap(data: Record<string, unknown> | undefined, field: string) {
  const value = data?.[field];
  if (typeof value !== 'object' || value === null) {
    throw new Error(`expected a map under ${field}`);
  }
  return value;
}

describe('InMemoryFirestore', () => {
  describe('documents', () => {
    it('reads back what was written', async ({ db }) => {
      await db.collection('signups').doc('a').set({ name: 'A' });

      const snapshot = await db.collection('signups').doc('a').get();

      expect(snapshot.exists).toBe(true);
      expect(snapshot.id).toBe('a');
      expect(snapshot.data()).toEqual({ name: 'A' });
    });

    it('reports a missing document as not existing', async ({ db }) => {
      const snapshot = await db.collection('signups').doc('missing').get();

      expect(snapshot.exists).toBe(false);
      expect(snapshot.data()).toBeUndefined();
    });

    it('rejects create() when the document already exists', async ({ db }) => {
      db.seed('signups/a', { name: 'A' });

      await expect(
        db.collection('signups').doc('a').create({ name: 'B' }),
      ).rejects.toThrow('ALREADY_EXISTS');
    });

    it('rejects update() when the document does not exist', async ({ db }) => {
      await expect(
        db.collection('signups').doc('a').update({ name: 'B' }),
      ).rejects.toThrow('NOT_FOUND');
    });

    it('merges top-level fields on update()', async ({ db }) => {
      db.seed('signups/a', { name: 'A', status: 'PENDING' });

      await db.collection('signups').doc('a').update({ status: 'APPROVED' });

      expect(db.read('signups/a')).toEqual({ name: 'A', status: 'APPROVED' });
    });

    it('drops undefined fields, like ignoreUndefinedProperties', async ({
      db,
    }) => {
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

    it('deep-merges nested maps on set() with merge', async ({ db }) => {
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

    it('replaces a field with an empty map on set() with merge, like Firestore', async ({
      db,
    }) => {
      db.seed('settings/g', { progRoles: { DSR: 'r1' } });

      await db
        .collection('settings')
        .doc('g')
        .set({ progRoles: {} }, { merge: true });

      expect(db.read('settings/g')).toEqual({ progRoles: {} });
    });

    it('replaces only the named nested map on set() with mergeFields', async ({
      db,
    }) => {
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

    it('stores a Date as a Timestamp, like Firestore', async ({ db }) => {
      await db
        .collection('signups')
        .doc('a')
        .set({ at: new Date(1_000) });

      expect(db.read('signups/a')).toStrictEqual({
        at: Timestamp.fromMillis(1_000),
      });
    });

    it('keeps class instances such as Timestamp intact', async ({ db }) => {
      const expiresAt = Timestamp.fromMillis(1_000);
      await db.collection('signups').doc('a').set({ expiresAt });

      const data = (await db.collection('signups').doc('a').get()).data();

      expect(data).toStrictEqual({ expiresAt: Timestamp.fromMillis(1_000) });
    });

    it('returns copies, so mutating read data does not change what is stored', async ({
      db,
    }) => {
      db.seed('settings/g', { progRoles: { DSR: 'r1' } });

      const data = (await db.collection('settings').doc('g').get()).data();
      Reflect.set(nestedMap(data, 'progRoles'), 'DSR', 'mutated');

      expect(db.read('settings/g')).toEqual({ progRoles: { DSR: 'r1' } });
    });

    it('returns copies from read(), so a test cannot change what is stored', ({
      db,
    }) => {
      db.seed('settings/g', { progRoles: { DSR: 'r1' } });

      const data = db.read('settings/g');
      Reflect.set(nestedMap(data, 'progRoles'), 'DSR', 'mutated');

      expect(db.read('settings/g')).toEqual({ progRoles: { DSR: 'r1' } });
    });
  });

  describe('queries', () => {
    it.beforeEach(({ db }) => {
      db.seed('signups/a', { status: 'PENDING', order: 2 });
      db.seed('signups/b', { status: 'APPROVED', order: 1 });
      db.seed('signups/c', { status: 'PENDING', order: 3 });
      db.seed('signups/c/notes/x', { status: 'PENDING', order: 0 });
    });

    it('filters with ==', async ({ db }) => {
      const snapshot = await db
        .collection('signups')
        .where('status', '==', 'PENDING')
        .get();

      expect(snapshot.docs.map((doc) => doc.id)).toEqual(['a', 'c']);
    });

    it('filters with in', async ({ db }) => {
      const snapshot = await db
        .collection('signups')
        .where('status', 'in', ['APPROVED'])
        .get();

      expect(snapshot.docs.map((doc) => doc.id)).toEqual(['b']);
    });

    it('orders and limits', async ({ db }) => {
      const snapshot = await db
        .collection('signups')
        .orderBy('order')
        .limit(2)
        .get();

      expect(snapshot.docs.map((doc) => doc.id)).toEqual(['b', 'a']);
    });

    it('refuses a descending order, which it does not implement', ({ db }) => {
      expect(() => db.collection('signups').orderBy('order', 'desc')).toThrow(
        'does not support "desc" orderBy()',
      );
    });

    it('does not include subcollection documents in the parent collection', async ({
      db,
    }) => {
      const snapshot = await db.collection('signups').get();

      expect(snapshot.docs.map((doc) => doc.id)).toEqual(['a', 'b', 'c']);
    });

    it('queries a subcollection through its parent document', async ({
      db,
    }) => {
      const snapshot = await db
        .collection('signups')
        .doc('c')
        .collection('notes')
        .get();

      expect(snapshot.docs.map((doc) => doc.id)).toEqual(['x']);
    });

    it('reports an empty result as empty', async ({ db }) => {
      const snapshot = await db
        .collection('signups')
        .where('status', '==', 'DECLINED')
        .get();

      expect(snapshot.empty).toBe(true);
    });

    it('deletes a document through a query result reference', async ({
      db,
    }) => {
      const snapshot = await db
        .collection('signups')
        .where('status', '==', 'APPROVED')
        .get();

      await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));

      expect(db.read('signups/b')).toBeUndefined();
    });

    it('rejects an in filter with an empty array, like Firestore', ({ db }) => {
      expect(() => db.collection('signups').where('status', 'in', [])).toThrow(
        'non-empty array',
      );
    });

    it('matches any of the conditions in a Filter.or', async ({ db }) => {
      const snapshot = await db
        .collection('signups')
        .where(
          Filter.or(
            Filter.where('status', '==', 'APPROVED'),
            Filter.where('order', '==', 3),
          ),
        )
        .get();

      expect(snapshot.docs.map((doc) => doc.id)).toEqual(['b', 'c']);
    });

    it('refuses a Filter.and, which it does not implement', ({ db }) => {
      expect(() =>
        db
          .collection('signups')
          .where(Filter.and(Filter.where('status', '==', 'PENDING'))),
      ).toThrow('does not support the "AND" composite filter');
    });

    it('refuses nested composite filters it does not implement', ({ db }) => {
      expect(() =>
        db
          .collection('signups')
          .where(
            Filter.or(Filter.and(Filter.where('status', '==', 'PENDING'))),
          ),
      ).toThrow('does not support nested composite filters');
    });

    it('refuses operators it does not implement', ({ db }) => {
      expect(() =>
        db.collection('signups').where('tags', 'array-contains', 'x'),
      ).toThrow('does not support');
    });
  });

  describe('result order, as Firestore returns it', () => {
    it.beforeEach(({ db }) => {
      db.seed('orders/a', { order: 5 });
      db.seed('orders/b', { order: 5 });
      db.seed('orders/c', { order: 1 });
      db.seed('orders/z', { order: 2 });
    });

    it('orders by the field, then by id, leaving out documents missing it', async ({
      db,
    }) => {
      db.seed('orders/unordered', { name: 'no order field' });

      const snapshot = await db.collection('orders').orderBy('order').get();

      expect(snapshot.docs.map((doc) => doc.id)).toEqual(['c', 'z', 'a', 'b']);
    });
  });

  describe('transactions', () => {
    it('commits transaction writes after the callback resolves', async ({
      db,
    }) => {
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

    it('applies nothing when the transaction callback throws', async ({
      db,
    }) => {
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
    it('rejects an undefined query value', ({ db }) => {
      expect(() =>
        db.collection('signups').where('status', '==', undefined),
      ).toThrow('Unsupported field value: undefined');
    });

    it('rejects an in filter with more than 30 values', ({ db }) => {
      const values = Array.from({ length: 31 }, (_, i) => `v${i}`);

      expect(() =>
        db.collection('signups').where('status', 'in', values),
      ).toThrow('at most 30');
    });

    it('rejects running a query that needs a composite index', async ({
      db,
    }) => {
      await expect(
        db
          .collection('signups')
          .where('status', '==', 'PENDING')
          .orderBy('order')
          .get(),
      ).rejects.toThrow('composite index');
    });

    it('rejects a class instance it cannot serialize', async ({ db }) => {
      class Custom {
        readonly value = 1;
      }

      await expect(
        db.collection('signups').doc('a').set({ custom: new Custom() }),
      ).rejects.toThrow("Couldn't serialize");
      expect(db.read('signups/a')).toBeUndefined();
    });

    it('rejects nested arrays', async ({ db }) => {
      await expect(
        db
          .collection('signups')
          .doc('a')
          .set({ grid: [[1]] }),
      ).rejects.toThrow('Nested arrays');
    });

    it('rejects set() with mergeFields naming a field the data lacks', async ({
      db,
    }) => {
      db.seed('settings/g', { progRoles: { DSR: 'r1' }, reviewChannel: 'c1' });

      await expect(
        db
          .collection('settings')
          .doc('g')
          .set({ reviewChannel: 'c2' }, { mergeFields: ['progRoles'] }),
      ).rejects.toThrow('missing');
      expect(db.read('settings/g')).toEqual({
        progRoles: { DSR: 'r1' },
        reviewChannel: 'c1',
      });
    });

    it('rejects set() naming both merge and mergeFields, which Firestore refuses to combine', async ({
      db,
    }) => {
      db.seed('settings/g', { progPointRoles: { DSR: { P6: 'r1' } } });

      await expect(
        db
          .collection('settings')
          .doc('g')
          .set(
            { progPointRoles: { DSR: { P6: 'r9' } } },
            {
              merge: true,
              mergeFields: [new FieldPath('progPointRoles', 'DSR')],
            },
          ),
      ).rejects.toThrow('You cannot specify both "merge" and "mergeFields"');
      expect(db.read('settings/g')).toEqual({
        progPointRoles: { DSR: { P6: 'r1' } },
      });
    });

    it('refuses == against a map, which it does not implement', ({ db }) => {
      expect(() =>
        db.collection('signups').where('progRoles', '==', { DSR: 'r1' }),
      ).toThrow('does not support == against maps');
    });

    it('refuses dotted field paths in update(), which it does not implement', async ({
      db,
    }) => {
      db.seed('settings/g', { progRoles: { DSR: 'r1' } });

      await expect(
        db.collection('settings').doc('g').update({ 'progRoles.DSR': 'r2' }),
      ).rejects.toThrow('does not support dotted field paths');
    });

    it('removes a field set to FieldValue.delete() in update() or set() with merge', async ({
      db,
    }) => {
      db.seed('signups/a', { status: 'DECLINED', declineReason: 'late' });
      db.seed('signups/b', { status: 'DECLINED', declineReason: 'late' });

      await db
        .collection('signups')
        .doc('a')
        .update({ status: 'APPROVED', declineReason: FieldValue.delete() });
      await db
        .collection('signups')
        .doc('b')
        .set({ declineReason: FieldValue.delete() }, { merge: true });

      expect([db.read('signups/a'), db.read('signups/b')]).toEqual([
        { status: 'APPROVED' },
        { status: 'DECLINED' },
      ]);
    });

    it('rejects FieldValue.delete() in create() or set() without merge', async ({
      db,
    }) => {
      const ref = db.collection('signups').doc('a');

      await expect(
        ref.create({ declineReason: FieldValue.delete() }),
      ).rejects.toThrow('FieldValue.delete() must appear at the top-level');
      await expect(
        ref.set({ declineReason: FieldValue.delete() }),
      ).rejects.toThrow('FieldValue.delete() must appear at the top-level');
    });

    it('refuses FieldValue sentinels it does not implement', async ({ db }) => {
      await expect(
        db
          .collection('signups')
          .doc('a')
          .set({ updatedAt: FieldValue.serverTimestamp() }),
      ).rejects.toThrow('does not support');
    });
  });

  describe('what Firestore refuses in a transaction', () => {
    it('rejects a read after a write', async ({ db }) => {
      db.seed('signups/a', { status: 'DECLINED' });
      const ref = db.collection('signups').doc('a');

      await expect(
        db.runTransaction(async (tx) => {
          tx.update(ref, { status: 'APPROVED' });
          await tx.get(ref);
        }),
      ).rejects.toThrow('reads to be executed before all writes');
      expect(db.read('signups/a')).toEqual({ status: 'DECLINED' });
    });
  });

  describe('transaction contention', () => {
    it('reruns the transaction when a document it read changes before commit', async ({
      db,
    }) => {
      db.seed('counters/a', { count: 0 });
      const ref = db.collection('counters').doc('a');
      const transaction = vi.fn<
        Parameters<InMemoryFirestore['runTransaction']>[0]
      >(async (tx) => {
        const snapshot = await tx.get(ref);
        if (transaction.mock.calls.length === 1) {
          // another writer lands between this transaction's read and commit
          await ref.update({ count: 10 });
        }
        const count = snapshot.data()?.count;
        tx.update(ref, { count: typeof count === 'number' ? count + 1 : -1 });
      });

      await db.runTransaction(transaction);

      expect(transaction).toHaveBeenCalledTimes(2);
      expect(db.read('counters/a')).toEqual({ count: 11 });
    });
  });

  describe('observing writes', () => {
    it('reports every write the app makes, but not seeds, until unsubscribed', async ({
      db,
    }) => {
      const written: string[] = [];
      const stop = db.onWrite((path) => written.push(path));
      db.seed('signups/seeded', { name: 'S' });
      const ref = db.collection('signups').doc('a');

      await ref.create({ name: 'A' });
      await ref.set({ name: 'B' });
      await ref.update({ name: 'C' });
      await ref.delete();
      stop();
      await ref.set({ name: 'D' });

      expect(written).toEqual([
        'signups/a',
        'signups/a',
        'signups/a',
        'signups/a',
      ]);
    });
  });

  describe('when Firestore is unreachable', () => {
    it('fails reads, queries and writes like the client does, but not seeding', async ({
      db,
    }) => {
      db.seed('signups/a', { name: 'A' });
      db.goOffline();
      const ref = db.collection('signups').doc('a');

      await expect(ref.get()).rejects.toThrow('14 UNAVAILABLE');
      await expect(db.collection('signups').get()).rejects.toThrow(
        '14 UNAVAILABLE',
      );
      await expect(ref.set({ name: 'B' })).rejects.toThrow('14 UNAVAILABLE');
      db.seed('signups/b', { name: 'seeded while offline' });
      expect([db.read('signups/a'), db.read('signups/b')]).toEqual([
        { name: 'A' },
        { name: 'seeded while offline' },
      ]);
    });
  });
});
