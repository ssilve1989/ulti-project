import type { Mocked } from 'vitest';
import { vi } from 'vitest';

// Prevent proxy being treated as a Promise, iterable, or primitive
const TRANSPARENT_PROPS = new Set<string | symbol>([
  'then',
  'catch',
  'finally',
  Symbol.toPrimitive,
  Symbol.iterator,
  Symbol.asyncIterator,
]);

/** Loose shape for a bare `createAutoMock()` with no type argument. */
export type AutoMockRecord = Record<string, ReturnType<typeof vi.fn>>;

/**
 * A recursively-optional view of `T`: every property may be omitted, and nested
 * objects follow the same rule. Functions and arrays are left as-is.
 */
export type DeepPartial<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends ReadonlyArray<infer U>
    ? ReadonlyArray<DeepPartial<U>>
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T;

/**
 * Builds a stand-in for `T` from a partial object literal, keeping the value
 * checked against the real type. The argument is a `DeepPartial<T>`, so a field
 * that is renamed, removed, or retyped in the source breaks the test at compile
 * time — unlike `{ … } as unknown as T`, which silently rots.
 *
 * The `DeepPartial<T>` → `T` gap lives here in overload signatures rather than an
 * `as` cast so it is not repeated at every call site.
 */
export function partialMock<T>(value: DeepPartial<T>): T;
export function partialMock(value: object): unknown {
  return value;
}

/**
 * Stand-in for a value whose deep type is impractical to satisfy in a unit test —
 * almost always a third-party shape (discord.js `GuildMember`, `Message`,
 * `Interaction`, …) reached through only a couple of properties, and often with
 * hostile method types (`toString(): \`<@${string}>\``) that make a structural
 * partial unusable.
 *
 * The literal is still checked against `keyof T`, so a property that is renamed
 * or removed upstream is caught; only the *values* are unchecked. Prefer
 * `partialMock<T>` for our own domain types, where the full structural check
 * works and is worth having.
 */
export function mockOf<T>(value: Partial<Record<keyof T, unknown>>): T;
export function mockOf(value: object): unknown {
  return value;
}

/**
 * Views a real instance through a type that exposes members `private` to the
 * class — for tests that must spy on a private method or seed private state.
 * Keep `Shape` to just the members the test touches; the reach into internals is
 * then explicit and lives at the one line that needs it.
 */
export function withInternals<Shape>(instance: object): Shape;
export function withInternals(instance: object): unknown {
  return instance;
}

/**
 * Creates a shallow auto-mock for use with NestJS `.useMocker()` and simple
 * dependency injection. Every property returns a consistent `vi.fn()` — calling
 * those functions returns `undefined` by default. Tests must call
 * `.mockResolvedValue()` etc. to specify return values, which makes test intent
 * explicit rather than relying on deep auto-mocking.
 *
 * Pass the mocked type as a type argument — `createAutoMock<SignupCollection>()` —
 * so every member access on the result is checked against the real shape and a
 * source-side rename or signature change fails the build instead of silently
 * passing through an `as unknown as` cast. Called with no type argument (e.g.
 * `.useMocker(createAutoMock)`) it returns a loose record of mock functions.
 *
 * The gap between "a Proxy of `vi.fn()`s" and `Mocked<T>` is expressed with
 * overload signatures rather than an `as` cast, so it stays in this one file and
 * every call site is still type-checked against the `T` it passes.
 */
export function createAutoMock(token?: unknown): AutoMockRecord;
export function createAutoMock<T>(token?: unknown): Mocked<T>;
export function createAutoMock(_token?: unknown): unknown {
  const cache = new Map<string | symbol, ReturnType<typeof vi.fn>>();
  return new Proxy(
    {},
    {
      get(_, prop) {
        if (TRANSPARENT_PROPS.has(prop)) return undefined;
        if (!cache.has(prop))
          cache.set(prop, vi.fn().mockResolvedValue(undefined));
        // biome-ignore lint/style/noNonNullAssertion: just populated above
        return cache.get(prop)!;
      },
      set(_, prop, value) {
        cache.set(prop, value);
        return true;
      },
      defineProperty(_, prop, descriptor) {
        if ('value' in descriptor) {
          cache.set(prop, descriptor.value);
        }
        return true;
      },
    },
  );
}
