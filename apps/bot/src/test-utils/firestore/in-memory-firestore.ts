import { randomUUID } from 'node:crypto';
import type { FieldPath } from 'firebase-admin/firestore';

type Data = Record<string, unknown>;
type Operator = '==' | 'in' | '>' | '<';

interface Condition {
  field: string;
  operator: Operator;
  value: unknown;
}

interface Ordering {
  field: string;
  direction: 'asc' | 'desc';
}

interface SetOptions {
  merge?: boolean;
  mergeFields?: ReadonlyArray<string | FieldPath>;
}

const OPERATORS: ReadonlySet<string> = new Set<Operator>([
  '==',
  'in',
  '>',
  '<',
]);

function isOperator(value: string): value is Operator {
  return OPERATORS.has(value);
}

function unsupported(feature: string): never {
  throw new Error(
    `InMemoryFirestore does not support ${feature}. Extend apps/bot/src/test-utils/firestore/in-memory-firestore.ts when a collection starts relying on it.`,
  );
}

function isPlainObject(value: unknown): value is Data {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * Deep-copies plain objects and arrays so stored documents can't be changed
 * through a returned reference, and drops `undefined` fields (the app enables
 * `ignoreUndefinedProperties`). Class instances such as `Timestamp` are kept.
 */
function copyValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(copyValue);
  if (isPlainObject(value)) return copyData(value);
  return value;
}

function copyData(data: object): Data {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, copyValue(value)]),
  );
}

/** Firestore's `merge: true`: non-empty maps merge field by field, while an empty map is a leaf value that replaces the field. */
function mergeInto(target: Data, source: Data): Data {
  const result: Data = { ...target };
  for (const [key, value] of Object.entries(source)) {
    const existing = result[key];
    result[key] =
      isPlainObject(existing) &&
      isPlainObject(value) &&
      Object.keys(value).length > 0
        ? mergeInto(existing, value)
        : value;
  }
  return result;
}

function fieldSegments(field: string | FieldPath): string[] {
  const formatted = String(field);
  if (formatted.includes('`')) {
    unsupported(`quoted field path segments (${formatted})`);
  }
  return formatted.split('.');
}

function valueAt(data: Data, segments: readonly string[]): unknown {
  let current: unknown = data;
  for (const segment of segments) {
    if (!isPlainObject(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function withValueAt(
  data: Data,
  [head, ...rest]: readonly string[],
  value: unknown,
): Data {
  if (head === undefined) unsupported('an empty field path');
  if (rest.length === 0) return { ...data, [head]: value };
  const child = data[head];
  return {
    ...data,
    [head]: withValueAt(isPlainObject(child) ? child : {}, rest, value),
  };
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }
  return unsupported(`comparing a ${typeof a} with a ${typeof b}`);
}

function matches(data: Data, { field, operator, value }: Condition): boolean {
  const actual = data[field];
  switch (operator) {
    case '==':
      return actual === value;
    case 'in':
      return Array.isArray(value) && value.includes(actual);
    case '>':
      return actual !== undefined && compare(actual, value) > 0;
    case '<':
      return actual !== undefined && compare(actual, value) < 0;
  }
}

function settleWrite(write: () => void): Promise<void> {
  try {
    write();
    return Promise.resolve();
  } catch (error) {
    return Promise.reject(error);
  }
}

class DocumentSnapshot {
  constructor(
    readonly ref: DocumentReference,
    private readonly stored: Data | undefined,
  ) {}

  get id(): string {
    return this.ref.id;
  }

  get exists(): boolean {
    return this.stored !== undefined;
  }

  data(): Data | undefined {
    return this.stored === undefined ? undefined : copyData(this.stored);
  }
}

class QuerySnapshot {
  constructor(readonly docs: DocumentSnapshot[]) {}

  get empty(): boolean {
    return this.docs.length === 0;
  }
}

class Query {
  constructor(
    protected readonly db: InMemoryFirestore,
    protected readonly collectionPath: string,
    private readonly conditions: readonly Condition[] = [],
    private readonly orderings: readonly Ordering[] = [],
    private readonly maxResults?: number,
  ) {}

  where(field: unknown, operator?: string, value?: unknown): Query {
    if (typeof field !== 'string') {
      return unsupported('Filter objects in where() (Filter.or / Filter.and)');
    }
    if (field.includes('.')) {
      return unsupported(`nested field paths in where() ("${field}")`);
    }
    if (operator === undefined || !isOperator(operator)) {
      return unsupported(`the "${operator}" where() operator`);
    }
    if (operator === 'in' && (!Array.isArray(value) || value.length === 0)) {
      throw new Error("'in' filters require a non-empty array");
    }
    if (operator === '==' && typeof value === 'object' && value !== null) {
      return unsupported('== against maps, arrays or class instances');
    }
    return new Query(
      this.db,
      this.collectionPath,
      [...this.conditions, { field, operator, value }],
      this.orderings,
      this.maxResults,
    );
  }

  orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): Query {
    return new Query(
      this.db,
      this.collectionPath,
      this.conditions,
      [...this.orderings, { field, direction }],
      this.maxResults,
    );
  }

  limit(count: number): Query {
    return new Query(
      this.db,
      this.collectionPath,
      this.conditions,
      this.orderings,
      count,
    );
  }

  get(): Promise<QuerySnapshot> {
    return Promise.resolve(new QuerySnapshot(this.run()));
  }

  private run(): DocumentSnapshot[] {
    const docs = this.db
      .documentsIn(this.collectionPath)
      .filter(({ data }) =>
        this.conditions.every((condition) => matches(data, condition)),
      )
      // Firestore leaves out documents missing an ordered-by field
      .filter(({ data }) =>
        this.orderings.every(({ field }) => data[field] !== undefined),
      )
      .sort((a, b) => {
        for (const { field, direction } of this.orderings) {
          const result = compare(a.data[field], b.data[field]);
          if (result !== 0) return direction === 'asc' ? result : -result;
        }
        return compare(a.id, b.id);
      });

    const limited =
      this.maxResults === undefined ? docs : docs.slice(0, this.maxResults);

    return limited.map(
      ({ path, data }) =>
        new DocumentSnapshot(new DocumentReference(this.db, path), data),
    );
  }
}

class CollectionReference extends Query {
  doc(id: string = randomUUID()): DocumentReference {
    return new DocumentReference(this.db, `${this.collectionPath}/${id}`);
  }

  async add(data: object): Promise<DocumentReference> {
    const ref = this.doc();
    await ref.create(data);
    return ref;
  }
}

class DocumentReference {
  constructor(
    private readonly db: InMemoryFirestore,
    readonly path: string,
  ) {}

  get id(): string {
    return this.path.slice(this.path.lastIndexOf('/') + 1);
  }

  collection(path: string): CollectionReference {
    return new CollectionReference(this.db, `${this.path}/${path}`);
  }

  get(): Promise<DocumentSnapshot> {
    return Promise.resolve(this.db.snapshot(this));
  }

  create(data: object): Promise<void> {
    return settleWrite(() => this.db.create(this.path, data));
  }

  set(data: object, options?: SetOptions): Promise<void> {
    return settleWrite(() => this.db.set(this.path, data, options));
  }

  update(data: object): Promise<void> {
    return settleWrite(() => this.db.update(this.path, data));
  }

  delete(): Promise<void> {
    return settleWrite(() => this.db.delete(this.path));
  }
}

class PendingWrites {
  private readonly writes: Array<() => void> = [];

  constructor(protected readonly db: InMemoryFirestore) {}

  set(ref: DocumentReference, data: object, options?: SetOptions): this {
    this.writes.push(() => this.db.set(ref.path, data, options));
    return this;
  }

  update(ref: DocumentReference, data: object): this {
    this.writes.push(() => this.db.update(ref.path, data));
    return this;
  }

  delete(ref: DocumentReference): this {
    this.writes.push(() => this.db.delete(ref.path));
    return this;
  }

  protected get hasWrites(): boolean {
    return this.writes.length > 0;
  }

  protected apply(): void {
    this.db.atomically(() => {
      for (const write of this.writes) write();
    });
  }
}

class WriteBatch extends PendingWrites {
  commit(): Promise<void> {
    return settleWrite(() => this.apply());
  }
}

class Transaction extends PendingWrites {
  get(ref: DocumentReference): Promise<DocumentSnapshot> {
    if (this.hasWrites) {
      return Promise.reject(
        new Error(
          'Firestore transactions require all reads to be executed before all writes',
        ),
      );
    }
    return ref.get();
  }

  commit(): void {
    this.apply();
  }
}

/**
 * In-memory stand-in for the Firestore SDK, provided under the `FIRESTORE`
 * token so the real collection classes run against it. It implements only the
 * operations the collections use and throws on anything else, so it can't
 * silently diverge from real Firestore.
 */
export class InMemoryFirestore {
  private readonly documents = new Map<string, Data>();

  collection(path: string): CollectionReference {
    return new CollectionReference(this, path);
  }

  batch(): WriteBatch {
    return new WriteBatch(this);
  }

  async runTransaction<T>(
    updateFunction: (transaction: Transaction) => Promise<T>,
  ): Promise<T> {
    const transaction = new Transaction(this);
    const result = await updateFunction(transaction);
    transaction.commit();
    return result;
  }

  /** Test setup: writes a document directly, bypassing the app. */
  seed(path: string, data: object): void {
    this.documents.set(path, copyData(data));
  }

  /** Test assertion: the stored document at `path`, or undefined. */
  read(path: string): Data | undefined {
    const stored = this.documents.get(path);
    return stored === undefined ? undefined : copyData(stored);
  }

  // The members below are used by the reference classes in this file.

  snapshot(ref: DocumentReference): DocumentSnapshot {
    return new DocumentSnapshot(ref, this.documents.get(ref.path));
  }

  documentsIn(
    collectionPath: string,
  ): Array<{ id: string; path: string; data: Data }> {
    const prefix = `${collectionPath}/`;
    return [...this.documents]
      .filter(
        ([path]) =>
          path.startsWith(prefix) && !path.slice(prefix.length).includes('/'),
      )
      .map(([path, data]) => ({ id: path.slice(prefix.length), path, data }));
  }

  create(path: string, data: object): void {
    if (this.documents.has(path)) {
      throw new Error(`ALREADY_EXISTS: Document already exists: ${path}`);
    }
    this.documents.set(path, copyData(data));
  }

  set(path: string, data: object, options: SetOptions = {}): void {
    const incoming = copyData(data);
    const existing = this.documents.get(path) ?? {};

    if (options.mergeFields) {
      let next = existing;
      for (const field of options.mergeFields) {
        const segments = fieldSegments(field);
        next = withValueAt(next, segments, valueAt(incoming, segments));
      }
      this.documents.set(path, copyData(next));
    } else if (options.merge) {
      this.documents.set(path, mergeInto(existing, incoming));
    } else {
      this.documents.set(path, incoming);
    }
  }

  update(path: string, data: object): void {
    const existing = this.documents.get(path);
    if (existing === undefined) {
      throw new Error(`NOT_FOUND: No document to update: ${path}`);
    }
    const incoming = copyData(data);
    const dotted = Object.keys(incoming).find((key) => key.includes('.'));
    if (dotted) unsupported(`dotted field paths in update() ("${dotted}")`);
    this.documents.set(path, { ...existing, ...incoming });
  }

  delete(path: string): void {
    this.documents.delete(path);
  }

  /** Runs `apply`; if it throws, restores every document to its prior state. */
  atomically(apply: () => void): void {
    const before = new Map(this.documents);
    try {
      apply();
    } catch (error) {
      this.documents.clear();
      for (const [path, data] of before) this.documents.set(path, data);
      throw error;
    }
  }
}
