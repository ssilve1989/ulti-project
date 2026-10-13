import { createSignal } from 'solid-js';

/** Which requests are in flight, by key. */
export function createPendingKeys() {
  const [keys, setKeys] = createSignal<ReadonlySet<string>>(new Set());
  return {
    pending: (key: string) => keys().has(key),
    setPending: (key: string, pending: boolean) =>
      setKeys((current) => {
        const next = new Set(current);
        if (pending) next.add(key);
        else next.delete(key);
        return next;
      }),
  };
}
