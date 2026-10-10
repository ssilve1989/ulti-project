/** The stored value for `key`, if it's one of `allowed`. Blocked storage just means no stored choice. */
export function readChoice<T extends string>(
  key: string,
  allowed: readonly T[],
): T | undefined {
  try {
    const stored = localStorage.getItem(key);
    return allowed.find((choice) => choice === stored);
  } catch {
    return undefined;
  }
}

/** Remembers a choice; blocked storage just means it isn't remembered. */
export function storeChoice(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // no persistence
  }
}
