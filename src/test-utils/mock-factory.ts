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

/**
 * Creates a shallow auto-mock for use with NestJS `.useMocker()` and simple
 * dependency injection. Every property returns a consistent `vi.fn()` — calling
 * those functions returns `undefined` by default. Tests must call
 * `.mockResolvedValue()` etc. to specify return values, which makes test intent
 * explicit rather than relying on deep auto-mocking.
 */
export function createAutoMock(
  _token?: unknown,
): Record<string, ReturnType<typeof vi.fn>> {
  const cache = new Map<string | symbol, ReturnType<typeof vi.fn>>();
  return new Proxy({} as Record<string, ReturnType<typeof vi.fn>>, {
    get(_, prop) {
      if (TRANSPARENT_PROPS.has(prop)) return undefined;
      if (!cache.has(prop))
        cache.set(prop, vi.fn().mockResolvedValue(undefined));
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
  });
}
