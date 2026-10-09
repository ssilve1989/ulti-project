import { onTestFinished, vi } from 'vitest';

export interface SentRequest {
  readonly method: string;
  readonly path: string;
  readonly body: string | undefined;
  readonly contentType: string | null;
}

/**
 * Stubs `fetch` with fixed answers by `"METHOD /path"`; an unexpected request fails the test
 * when it finishes (the app would only see a network failure). Call it inside a test.
 */
export function stubApi(
  routes: Readonly<
    Record<string, Response | (() => Response | Promise<Response>)>
  >,
): { readonly sent: readonly SentRequest[] } {
  const sent: SentRequest[] = [];
  const unexpected: string[] = [];
  onTestFinished(() => {
    if (unexpected.length > 0)
      throw new Error(`Unexpected requests: ${unexpected.join(', ')}`);
  });
  vi.stubGlobal(
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      // Node-environment specs have no `location` to resolve a relative path against.
      const base = globalThis.location?.href ?? 'http://board.test/';
      const request =
        input instanceof Request
          ? new Request(input, init)
          : new Request(new URL(input, base), init);
      const url = new URL(request.url);
      const path = `${url.pathname}${url.search}`;
      const text = await request.text();
      sent.push({
        method: request.method,
        path,
        body: text === '' ? undefined : text,
        contentType: request.headers.get('Content-Type'),
      });
      const route = routes[`${request.method} ${path}`];
      if (route === undefined) {
        unexpected.push(`${request.method} ${path}`);
        throw new Error(`Unexpected request ${request.method} ${path}`);
      }
      // A Response's body can be read once, so a fixed answer is cloned per request.
      return typeof route === 'function' ? route() : route.clone();
    },
  );
  return { sent };
}

/** A JSON response, as the board API sends it. */
export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
