import { randomUUID } from 'node:crypto';
import {
  type FieldPath,
  FieldValue,
  Filter,
  Timestamp,
} from 'firebase-admin/firestore';

type Data = Record<string, unknown>;
type Operator = '==' | 'in' | '>' | '<';

interface Condition {
  field: string;
  operator: Operator;
  value: unknown;
}

/** A where() clause: one condition, or an OR of several (`Filter.or`). */
type Clause = Condition | { readonly anyOf: readonly Condition[] };

const conditionsIn = (clause: Clause): readonly Condition[] =>
  'anyOf' in clause ? clause.anyOf : [clause];

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

/** The error Firestore raises before sending a value it can't store. */
function invalidValue(field: string, problem: string): Error {
  return new Error(
    `Value for argument "data" is not a valid Firestore document. ${problem} (found in field "${field}").`,
  );
}

/**
 * Converts a value to what Firestore stores, deep-copying maps and arrays so
 * stored documents can't be changed through a returned reference. Like the
 * real client it turns a `Date` into a `Timestamp`, drops `undefined` map
 * fields (the app enables `ignoreUndefinedProperties`) and rejects what it
 * can't serialize.
 */
function copyValue(value: unknown, field: string): unknown {
  if (value === null) return null;
  switch (typeof value) {
    case 'string':
    case 'number':
    case 'boolean':
      return value;
    case 'undefined':
      throw invalidValue(field, 'Cannot use "undefined" as a Firestore value');
    case 'object':
      break;
    default:
      throw invalidValue(field, `Unsupported field value: ${typeof value}`);
  }
  if (isDeleteSentinel(value)) {
    // top-level deletes in update() and set() with merge are handled before this
    throw new Error(
      `FieldValue.delete() must appear at the top-level and can only be used in update() or set() with {merge:true} (found in field "${field}").`,
    );
  }
  if (value instanceof FieldValue) {
    return unsupported('FieldValue sentinels (serverTimestamp, increment, …)');
  }
  if (value instanceof Timestamp) return value;
  if (value instanceof Date) return Timestamp.fromDate(value);
  if (Array.isArray(value)) {
    return value.map((element, index) => {
      if (Array.isArray(element)) {
        throw invalidValue(field, 'Nested arrays are not supported');
      }
      return copyValue(element, `${field}.${index}`);
    });
  }
  if (isPlainObject(value)) return copyData(value, `${field}.`);
  // GeoPoint, DocumentReference, bytes and vectors are storable but unmodelled
  const type = value.constructor?.name ?? 'Object';
  if (
    [
      'GeoPoint',
      'DocumentReference',
      'Buffer',
      'Uint8Array',
      'VectorValue',
    ].includes(type)
  ) {
    return unsupported(`${type} values`);
  }
  throw invalidValue(
    field,
    `Couldn't serialize object of type "${type}". Firestore doesn't support JavaScript objects with custom prototypes (i.e. objects that were created via the "new" operator)`,
  );
}

function isDeleteSentinel(value: unknown): boolean {
  return value instanceof FieldValue && value.isEqual(FieldValue.delete());
}

/**
 * Splits a write's top-level fields into the ones FieldValue.delete() removes
 * and the rest, as update() and set() with merge apply them.
 */
function splitDeletes(data: object): { deleted: string[]; rest: Data } {
  const entries = Object.entries(data);
  return {
    deleted: entries
      .filter(([, value]) => isDeleteSentinel(value))
      .map(([key]) => key),
    rest: Object.fromEntries(
      entries.filter(([, value]) => !isDeleteSentinel(value)),
    ),
  };
}

/** `data` without the fields in `keys`. */
function without(data: Data, keys: readonly string[]): Data {
  return Object.fromEntries(
    Object.entries(data).filter(([key]) => !keys.includes(key)),
  );
}

function copyData(data: object, prefix = ''): Data {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, copyValue(value, `${prefix}${key}`)]),
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

function satisfies(data: Data, clause: Clause): boolean {
  return 'anyOf' in clause
    ? clause.anyOf.some((condition) => matches(data, condition))
    : matches(data, clause);
}

/** Validates a where() condition the way Firestore does, or refuses what the fake doesn't model. */
function condition(
  field: unknown,
  operator: unknown,
  value: unknown,
): Condition {
  if (typeof field !== 'string') {
    return unsupported(`FieldPath objects in where() ("${String(field)}")`);
  }
  if (field.includes('.')) {
    return unsupported(`nested field paths in where() ("${field}")`);
  }
  if (typeof operator !== 'string' || !isOperator(operator)) {
    return unsupported(`the "${String(operator)}" where() operator`);
  }
  if (value === undefined) {
    throw new Error(
      'Function Query.where() called with invalid data. Unsupported field value: undefined',
    );
  }
  if (operator === 'in' && (!Array.isArray(value) || value.length === 0)) {
    throw new Error("'in' filters require a non-empty array");
  }
  if (operator === 'in' && Array.isArray(value) && value.length > 30) {
    throw new Error("'in' filters support at most 30 values");
  }
  if (operator === '==' && typeof value === 'object' && value !== null) {
    return unsupported('== against maps, arrays or class instances');
  }
  return { field, operator, value };
}

/**
 * The clauses a `Filter` stands for. Filter's fields aren't in its typings,
 * so they're read by name: a unary filter has field/operator/value, a
 * composite has filters and an 'AND'/'OR' operator.
 */
function clausesOf(filter: Filter): Clause[] {
  const filters: unknown = Reflect.get(filter, 'filters');
  const operator: unknown = Reflect.get(filter, 'operator');
  if (!Array.isArray(filters)) {
    return [
      condition(
        Reflect.get(filter, 'field'),
        operator,
        Reflect.get(filter, 'value'),
      ),
    ];
  }
  const conditions = filters.map((inner: unknown) => {
    if (
      !(inner instanceof Filter) ||
      Array.isArray(Reflect.get(inner, 'filters'))
    ) {
      return unsupported(
        'nested composite filters (Filter.or inside Filter.and, …)',
      );
    }
    return condition(
      Reflect.get(inner, 'field'),
      Reflect.get(inner, 'operator'),
      Reflect.get(inner, 'value'),
    );
  });
  if (operator === 'AND') return conditions;
  if (operator === 'OR') return [{ anyOf: conditions }];
  return unsupported(`the "${String(operator)}" composite filter`);
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

/** What Firestore resolves a write with. */
class WriteResult {
  constructor(readonly writeTime: Timestamp) {}

  isEqual(other: WriteResult): boolean {
    return this.writeTime.isEqual(other.writeTime);
  }
}

/** Applies a write, resolving like Firestore or rejecting if it throws. */
function written(write: () => void): Promise<WriteResult> {
  return Promise.try(() => {
    write();
    return new WriteResult(Timestamp.now());
  });
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

interface QueryState {
  readonly conditions: readonly Clause[];
  readonly orderings: readonly Ordering[];
  readonly maxResults?: number;
}

class Query {
  constructor(
    protected readonly db: InMemoryFirestore,
    protected readonly collectionPath: string,
    private readonly state: QueryState = { conditions: [], orderings: [] },
  ) {}

  private with(changes: Partial<QueryState>): Query {
    return new Query(this.db, this.collectionPath, {
      ...this.state,
      ...changes,
    });
  }

  where(field: unknown, operator?: string, value?: unknown): Query {
    const clauses =
      field instanceof Filter
        ? clausesOf(field)
        : [condition(field, operator, value)];
    return this.with({ conditions: [...this.state.conditions, ...clauses] });
  }

  orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): Query {
    return this.with({
      orderings: [...this.state.orderings, { field, direction }],
    });
  }

  limit(count: number): Query {
    return this.with({ maxResults: count });
  }

  get(): Promise<QuerySnapshot> {
    return Promise.try(() => new QuerySnapshot(this.run()));
  }

  /**
   * Real Firestore rejects these unless a matching composite index is
   * deployed. This repo has no index config, so the fake can't know which
   * exist and refuses them rather than pretending they work.
   */
  private assertServableWithoutCompositeIndex(): void {
    const conditions = this.state.conditions.flatMap(conditionsIn);
    const inequalityFields = new Set(
      conditions
        .filter(({ operator }) => operator === '>' || operator === '<')
        .map(({ field }) => field),
    );
    const [firstOrdering] = this.state.orderings;
    const filterOnOtherField =
      firstOrdering !== undefined &&
      conditions.some(({ field }) => field !== firstOrdering.field);

    if (inequalityFields.size > 1 || filterOnOtherField) {
      throw new Error(
        `This query on "${this.collectionPath}" needs a composite index; real Firestore rejects it unless one is deployed, and this repo has no index config.`,
      );
    }
  }

  /**
   * The order Firestore returns results in: the explicit orderBy()s, then any
   * inequality-filtered field not already ordered (lexicographically), then the
   * document id, the implicit ones in the last explicit direction (ascending
   * when there is none), as the SDK's createImplicitOrderBy does.
   */
  private effectiveOrderings(): {
    orderings: Ordering[];
    idDirection: 'asc' | 'desc';
  } {
    const orderings = [...this.state.orderings];
    const idDirection = orderings.at(-1)?.direction ?? 'asc';
    const inequalityFields = [
      ...new Set(
        this.state.conditions
          .flatMap(conditionsIn)
          .filter(({ operator }) => operator === '>' || operator === '<')
          .map(({ field }) => field),
      ),
    ].sort();
    for (const field of inequalityFields) {
      if (!orderings.some((ordering) => ordering.field === field)) {
        orderings.push({ field, direction: idDirection });
      }
    }
    return { orderings, idDirection };
  }

  private run(): DocumentSnapshot[] {
    this.assertServableWithoutCompositeIndex();
    const { orderings, idDirection } = this.effectiveOrderings();
    const docs = this.db
      .documentsIn(this.collectionPath)
      .filter(({ data }) =>
        this.state.conditions.every((clause) => satisfies(data, clause)),
      )
      // Firestore leaves out documents missing an ordered-by field
      .filter(({ data }) =>
        orderings.every(({ field }) => data[field] !== undefined),
      )
      .sort((a, b) => {
        for (const { field, direction } of orderings) {
          const result = compare(a.data[field], b.data[field]);
          if (result !== 0) return direction === 'asc' ? result : -result;
        }
        const byId = compare(a.id, b.id);
        return idDirection === 'asc' ? byId : -byId;
      });

    const limited =
      this.state.maxResults === undefined
        ? docs
        : docs.slice(0, this.state.maxResults);

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
    return Promise.try(() => this.db.snapshot(this));
  }

  create(data: object): Promise<WriteResult> {
    return written(() => this.db.create(this.path, data));
  }

  set(data: object, options?: SetOptions): Promise<WriteResult> {
    return written(() => this.db.set(this.path, data, options));
  }

  update(data: object): Promise<WriteResult> {
    return written(() => this.db.update(this.path, data));
  }

  delete(): Promise<WriteResult> {
    return written(() => this.db.delete(this.path));
  }
}

class ContentionError extends Error {}

/** Firestore's default number of attempts for a contended transaction. */
const MAX_TRANSACTION_ATTEMPTS = 5;

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

  protected get writeCount(): number {
    return this.writes.length;
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
  /** Like Firestore, resolves with one write result per write. */
  commit(): Promise<WriteResult[]> {
    return Promise.try(() => {
      this.apply();
      const writeTime = Timestamp.now();
      return Array.from(
        { length: this.writeCount },
        () => new WriteResult(writeTime),
      );
    });
  }
}

class Transaction extends PendingWrites {
  /** path → document version when this transaction read it */
  private readonly reads = new Map<string, number>();

  get(ref: DocumentReference): Promise<DocumentSnapshot> {
    if (this.hasWrites) {
      return Promise.reject(
        new Error(
          'Firestore transactions require all reads to be executed before all writes',
        ),
      );
    }
    this.reads.set(ref.path, this.db.version(ref.path));
    return ref.get();
  }

  /** Commits, or throws ContentionError if a document it read has since changed. */
  commit(): void {
    for (const [path, version] of this.reads) {
      if (this.db.version(path) !== version) {
        throw new ContentionError(`${path} changed during the transaction`);
      }
    }
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
  /** path → number of writes, for transaction contention checks */
  private readonly versions = new Map<string, number>();
  private readonly writeListeners = new Set<(path: string) => void>();
  private unreachable = false;

  /**
   * Makes every later read and write fail the way the Firestore client does
   * when it can't reach Firestore: gRPC status 14, UNAVAILABLE. Seeding and
   * reading as a test still work.
   */
  goOffline(): void {
    this.unreachable = true;
  }

  collection(path: string): CollectionReference {
    return new CollectionReference(this, path);
  }

  batch(): WriteBatch {
    return new WriteBatch(this);
  }

  /** Like Firestore, reruns the callback when a document it read changed before commit. */
  async runTransaction<T>(
    updateFunction: (transaction: Transaction) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt++) {
      const transaction = new Transaction(this);
      const result = await updateFunction(transaction);
      try {
        transaction.commit();
        return result;
      } catch (error) {
        if (!(error instanceof ContentionError)) throw error;
      }
    }
    throw new Error(
      `ABORTED: transaction still contended after ${MAX_TRANSACTION_ATTEMPTS} attempts`,
    );
  }

  /** Test setup: writes a document directly, bypassing the app. */
  seed(path: string, data: object): void {
    this.store(path, copyData(data));
  }

  /**
   * Test observation: calls `listener` with the path of every document the app
   * creates, sets, updates or deletes (not seeds), as the write lands.
   * Returns a function that stops listening.
   */
  onWrite(listener: (path: string) => void): () => void {
    this.writeListeners.add(listener);
    return () => this.writeListeners.delete(listener);
  }

  /** Test assertion: the stored document at `path`, or undefined. */
  read(path: string): Data | undefined {
    const stored = this.documents.get(path);
    return stored === undefined ? undefined : copyData(stored);
  }

  // The members below are used by the reference classes in this file.

  version(path: string): number {
    return this.versions.get(path) ?? 0;
  }

  snapshot(ref: DocumentReference): DocumentSnapshot {
    this.assertReachable();
    return new DocumentSnapshot(ref, this.documents.get(ref.path));
  }

  documentsIn(
    collectionPath: string,
  ): Array<{ id: string; path: string; data: Data }> {
    this.assertReachable();
    const prefix = `${collectionPath}/`;
    return [...this.documents]
      .filter(
        ([path]) =>
          path.startsWith(prefix) && !path.slice(prefix.length).includes('/'),
      )
      .map(([path, data]) => ({ id: path.slice(prefix.length), path, data }));
  }

  create(path: string, data: object): void {
    this.assertReachable();
    if (this.documents.has(path)) {
      throw new Error(`ALREADY_EXISTS: Document already exists: ${path}`);
    }
    this.write(path, copyData(data));
  }

  set(path: string, data: object, options: SetOptions = {}): void {
    this.assertReachable();
    const incoming = options.merge ? {} : copyData(data);
    const existing = this.documents.get(path) ?? {};

    if (options.mergeFields) {
      let next = existing;
      for (const field of options.mergeFields) {
        const segments = fieldSegments(field);
        const value = valueAt(incoming, segments);
        if (value === undefined) {
          throw new Error(
            `Input data is missing for field "${segments.join('.')}".`,
          );
        }
        next = withValueAt(next, segments, value);
      }
      this.write(path, copyData(next));
    } else if (options.merge) {
      const { deleted, rest } = splitDeletes(data);
      this.write(path, without(mergeInto(existing, copyData(rest)), deleted));
    } else {
      this.write(path, incoming);
    }
  }

  update(path: string, data: object): void {
    this.assertReachable();
    const existing = this.documents.get(path);
    if (existing === undefined) {
      throw new Error(`NOT_FOUND: No document to update: ${path}`);
    }
    const { deleted, rest } = splitDeletes(data);
    const incoming = copyData(rest);
    const dotted = [...Object.keys(incoming), ...deleted].find((key) =>
      key.includes('.'),
    );
    if (dotted) unsupported(`dotted field paths in update() ("${dotted}")`);
    this.write(path, without({ ...existing, ...incoming }, deleted));
  }

  delete(path: string): void {
    this.assertReachable();
    this.documents.delete(path);
    this.versions.set(path, this.version(path) + 1);
    this.notify(path);
  }

  /** Runs `apply`; if it throws, restores every document to its prior state. */
  atomically(apply: () => void): void {
    const documents = new Map(this.documents);
    const versions = new Map(this.versions);
    try {
      apply();
    } catch (error) {
      this.documents.clear();
      for (const [path, data] of documents) this.documents.set(path, data);
      this.versions.clear();
      for (const [path, version] of versions) this.versions.set(path, version);
      throw error;
    }
  }

  private write(path: string, data: Data): void {
    this.store(path, data);
    this.notify(path);
  }

  private store(path: string, data: Data): void {
    this.documents.set(path, data);
    this.versions.set(path, this.version(path) + 1);
  }

  private assertReachable(): void {
    if (this.unreachable) {
      throw Object.assign(
        new Error('14 UNAVAILABLE: No connection established'),
        { code: 14, details: 'No connection established' },
      );
    }
  }

  private notify(path: string): void {
    for (const listener of this.writeListeners) listener(path);
  }
}
