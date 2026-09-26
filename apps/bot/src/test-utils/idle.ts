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

/** Consecutive event-loop turns with nothing pending that count as idle. */
const IDLE_TURNS = 10;

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

/** The prototypes `instance` inherits methods from, below Object.prototype. */
function prototypesOf(instance: object): object[] {
  const prototype: unknown = Object.getPrototypeOf(instance);
  return typeof prototype === 'object' &&
    prototype !== null &&
    prototype !== Object.prototype
    ? [prototype, ...prototypesOf(prototype)]
    : [];
}

function methodNames(instance: object): string[] {
  const names = prototypesOf(instance).flatMap((prototype) =>
    Object.getOwnPropertyNames(prototype),
  );
  return [...new Set(names)].filter((name) => name !== 'constructor');
}

/** The request an undici diagnostics message is about. */
function undiciRequest(message: unknown): object | undefined {
  const request: unknown =
    typeof message === 'object' && message !== null
      ? Reflect.get(message, 'request')
      : undefined;
  return typeof request === 'object' && request !== null ? request : undefined;
}

export function createActivityTracker(): ActivityTracker {
  // each in-flight request or tracked call, until it finishes
  const inFlight = new Set<object>();
  const waiters = new Set<() => void>();

  const begin = (work: object) => {
    inFlight.add(work);
  };
  const end = (work: object) => {
    inFlight.delete(work);
    if (inFlight.size > 0) return;
    for (const wake of waiters) wake();
    waiters.clear();
  };
  const httpRequestCreated = (message: unknown) => {
    const created = createdRequest(message);
    if (!created) return;
    begin(created.request);
    created.request.once('close', () => end(created.request));
  };
  const undiciStarted = (message: unknown) => {
    const request = undiciRequest(message);
    if (request) begin(request);
  };
  const undiciEnded = (message: unknown) => {
    const request = undiciRequest(message);
    if (request) end(request);
  };
  subscribe(HTTP_REQUEST_CREATED, httpRequestCreated);
  subscribe(UNDICI_STARTED, undiciStarted);
  for (const name of UNDICI_ENDED) subscribe(name, undiciEnded);

  return {
    get pending() {
      return inFlight.size;
    },
    drained() {
      if (inFlight.size === 0) return Promise.resolve();
      return new Promise((resolve) => waiters.add(resolve));
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
              begin(result);
              result.then(
                () => end(result),
                () => end(result),
              );
            }
            return result;
          },
        });
      }
    },
    dispose() {
      unsubscribe(HTTP_REQUEST_CREATED, httpRequestCreated);
      unsubscribe(UNDICI_STARTED, undiciStarted);
      for (const name of UNDICI_ENDED) unsubscribe(name, undiciEnded);
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
  const drainedInTime = async () => {
    const outcome = await Promise.race([tracker.drained(), deadline]);
    if (outcome === 'timed out') {
      throw new Error(
        `The app did not go idle within ${IDLE_TIMEOUT_MS} ms (${tracker.pending} HTTP request(s) or tracked call(s) still pending)`,
      );
    }
  };
  const idleFor = async (idleTurns: number): Promise<void> => {
    if (idleTurns >= IDLE_TURNS) return;
    await setImmediate();
    if (tracker.pending === 0) return idleFor(idleTurns + 1);
    await drainedInTime();
    return idleFor(0);
  };
  await idleFor(0);
}
