import { subscribe, unsubscribe } from 'node:diagnostics_channel';

/** Diagnostics channels Node publishes outbound HTTP requests on: node:http (used by gaxios/node-fetch, so the googleapis client) and undici (Node's fetch). */
const REQUEST_STARTED = [
  // `created`, not `start`: `start` only fires once DNS and TLS are done, so
  // counting from it leaves a window where a request looks idle
  'http.client.request.created',
  'undici:request:create',
];
const REQUEST_ENDED = [
  'http.client.response.finish',
  'http.client.request.error',
  'undici:request:trailers',
  'undici:request:error',
];

/** How long waitUntilIdle() waits for the app to go idle before failing the test. */
const IDLE_TIMEOUT_MS = 30_000;

export interface ActivityTracker {
  /** HTTP requests in flight plus tracked calls whose promise hasn't settled. */
  readonly pending: number;
  /**
   * Counts every method call on `instance` as pending until its promise
   * settles. For an app's adapter to an external system (e.g. SheetsService):
   * a call does non-HTTP work between its requests (token handling, module
   * loading) that request counting alone can't see. Observation only: the
   * original result or rejection is returned unchanged.
   */
  trackCalls(instance: object): void;
  dispose(): void;
}

function methodNames(instance: object): string[] {
  const names = new Set<string>();
  for (
    let prototype = Object.getPrototypeOf(instance);
    prototype !== null && prototype !== Object.prototype;
    prototype = Object.getPrototypeOf(prototype)
  ) {
    for (const name of Object.getOwnPropertyNames(prototype)) {
      if (name !== 'constructor') names.add(name);
    }
  }
  return [...names];
}

export function createActivityTracker(): ActivityTracker {
  let requests = 0;
  let calls = 0;
  const started = () => {
    requests++;
  };
  const finished = () => {
    requests--;
  };
  for (const name of REQUEST_STARTED) subscribe(name, started);
  for (const name of REQUEST_ENDED) subscribe(name, finished);

  const settleCall = () => {
    calls--;
  };

  return {
    get pending() {
      return requests + calls;
    },
    trackCalls(instance) {
      for (const name of methodNames(instance)) {
        const original: unknown = Reflect.get(instance, name);
        if (typeof original !== 'function') continue;
        Object.defineProperty(instance, name, {
          configurable: true,
          writable: true,
          value: (...args: unknown[]) => {
            const result: unknown = Reflect.apply(original, instance, args);
            if (result instanceof Promise) {
              calls++;
              result.then(settleCall, settleCall);
            }
            return result;
          },
        });
      }
    },
    dispose() {
      for (const name of REQUEST_STARTED) unsubscribe(name, started);
      for (const name of REQUEST_ENDED) unsubscribe(name, finished);
    },
  };
}

/**
 * Waits until nothing is pending: in-process work drains within an event-loop
 * turn (each turn empties the microtask queue), HTTP responses and tracked
 * calls finish later. Idle means nothing pending for several consecutive turns.
 */
export async function waitUntilIdle(tracker: ActivityTracker): Promise<void> {
  const deadline = Date.now() + IDLE_TIMEOUT_MS;
  let idleTurns = 0;
  while (idleTurns < 10) {
    await new Promise<void>((resolve) => setImmediate(resolve));
    if (tracker.pending > 0) {
      idleTurns = 0;
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    } else {
      idleTurns++;
    }
    if (Date.now() > deadline) {
      throw new Error(
        `The app did not go idle within ${IDLE_TIMEOUT_MS} ms (${tracker.pending} HTTP request(s) or tracked call(s) still pending)`,
      );
    }
  }
}
