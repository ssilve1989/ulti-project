import { subscribe, unsubscribe } from 'node:diagnostics_channel';
import { EventEmitter } from 'node:events';
import { setImmediate, setTimeout } from 'node:timers/promises';

/**
 * Channel Node publishes every node:http request on, as soon as it's created.
 * gaxios uses node-fetch, so this covers the googleapis client.
 */
export const HTTP_REQUEST_CREATED = 'http.client.request.created';

/** A node:http client request, as `http.client.request.created` carries it. */
export interface CreatedRequest {
  readonly request: EventEmitter;
  readonly host: string;
  readonly method: string;
  readonly path: string;
}

/**
 * The request a `http.client.request.created` message carries, if it is one.
 * Checked by shape, not `instanceof ClientRequest`: nock replaces
 * `http.ClientRequest` while it intercepts, so a class captured then no longer
 * matches the requests made after it restores (or the other way round).
 */
export function createdRequest(message: unknown): CreatedRequest | undefined {
  if (
    typeof message !== 'object' ||
    message === null ||
    !('request' in message) ||
    !(message.request instanceof EventEmitter)
  ) {
    return undefined;
  }
  const { request } = message;
  const host: unknown = Reflect.get(request, 'host');
  const method: unknown = Reflect.get(request, 'method');
  const path: unknown = Reflect.get(request, 'path');
  return typeof host === 'string' &&
    typeof method === 'string' &&
    typeof path === 'string'
    ? { request, host, method, path }
    : undefined;
}

/** undici (Node's fetch): `trailers` fires once the body is complete. */
const UNDICI_STARTED = 'undici:request:create';
const UNDICI_ENDED = ['undici:request:trailers', 'undici:request:error'];

/** How long waitUntilIdle() waits for the app to go idle before failing the test. */
const IDLE_TIMEOUT_MS = 30_000;

export interface ActivityTracker {
  /**
   * HTTP requests in flight plus tracked calls whose promise hasn't settled.
   * node:http requests count until their `close` event, which fires once the
   * whole response body has arrived (not `response.finish`, which fires at the
   * headers). Work a client does after a request closes (decompressing,
   * parsing) is only covered by tracked calls, so route external HTTP through a
   * tracked adapter.
   */
  readonly pending: number;
  /** Resolves the next time nothing is pending (immediately if nothing is). */
  drained(): Promise<void>;
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
  let pending = 0;
  let waiters: Array<() => void> = [];

  const begin = () => {
    pending++;
  };
  const end = () => {
    pending--;
    if (pending === 0) {
      for (const wake of waiters) wake();
      waiters = [];
    }
  };
  const httpRequestCreated = (message: unknown) => {
    const created = createdRequest(message);
    if (created) {
      begin();
      created.request.once('close', end);
    }
  };
  subscribe(HTTP_REQUEST_CREATED, httpRequestCreated);
  subscribe(UNDICI_STARTED, begin);
  for (const name of UNDICI_ENDED) subscribe(name, end);

  return {
    get pending() {
      return pending;
    },
    drained() {
      if (pending === 0) return Promise.resolve();
      return new Promise((resolve) => waiters.push(resolve));
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
              begin();
              result.then(end, end);
            }
            return result;
          },
        });
      }
    },
    dispose() {
      unsubscribe(HTTP_REQUEST_CREATED, httpRequestCreated);
      unsubscribe(UNDICI_STARTED, begin);
      for (const name of UNDICI_ENDED) unsubscribe(name, end);
    },
  };
}

/**
 * Waits until nothing is pending: in-process work drains within an event-loop
 * turn (each turn empties the microtask queue), HTTP responses and tracked
 * calls finish later. Idle means nothing pending for several consecutive turns.
 */
export async function waitUntilIdle(tracker: ActivityTracker): Promise<void> {
  const deadline = setTimeout(IDLE_TIMEOUT_MS, 'timed out', { ref: false });
  let idleTurns = 0;
  while (idleTurns < 10) {
    await setImmediate();
    if (tracker.pending === 0) {
      idleTurns++;
      continue;
    }
    idleTurns = 0;
    const outcome = await Promise.race([tracker.drained(), deadline]);
    if (outcome === 'timed out') {
      throw new Error(
        `The app did not go idle within ${IDLE_TIMEOUT_MS} ms (${tracker.pending} HTTP request(s) or tracked call(s) still pending)`,
      );
    }
  }
}
