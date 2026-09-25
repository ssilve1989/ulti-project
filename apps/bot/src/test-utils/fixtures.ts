/**
 * A Vitest fixture (for `test.extend`) built fresh for every test and torn down
 * after it, so tests share no state and need no reassigned `let`s.
 */
export function fresh<T>(
  create: () => T | Promise<T>,
  teardown?: (value: T) => unknown,
) {
  // biome-ignore lint/correctness/noEmptyPattern: Vitest reads a fixture's dependencies from its destructured first parameter; this fixture has none
  return async ({}, use: (value: T) => Promise<void>): Promise<void> => {
    const value = await create();
    try {
      await use(value);
    } finally {
      await teardown?.(value);
    }
  };
}
