import type { BoardErrorBody } from '@ulti-project/shared';

export type ApiResult<T> =
  | { readonly ok: true; readonly status: number; readonly body: T }
  | {
      readonly ok: false;
      readonly status: number;
      readonly body: BoardErrorBody;
    };

/** A request's options; `json` is sent as its body. */
export type ApiInit = Omit<RequestInit, 'body'> & { readonly json?: unknown };

const INTERNAL: BoardErrorBody = Object.freeze({ reason: 'internal' });

/** The board API's answer to a request: its JSON body, typed by whether it succeeded. Status 0 is a network failure. */
export async function api<T>(
  path: string,
  { json, ...init }: ApiInit = {},
): Promise<ApiResult<T>> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (json !== undefined) headers.set('Content-Type', 'application/json');
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      ...init,
      ...(json !== undefined && { body: JSON.stringify(json) }),
      headers,
    });
  } catch {
    return { ok: false, status: 0, body: INTERNAL };
  }
  const { ok, status } = response;
  try {
    // The one place an untyped JSON body is returned as a typed one: the shared API types describe it.
    return ok
      ? { ok, status, body: await response.json() }
      : { ok, status, body: await response.json() };
  } catch {
    return { ok: false, status, body: INTERNAL };
  }
}
