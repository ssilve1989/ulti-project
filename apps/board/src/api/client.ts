import type { BoardErrorBody } from '@ulti-project/shared';

export type ApiResult<T> =
  | { readonly ok: true; readonly status: number; readonly body: T }
  | {
      readonly ok: false;
      readonly status: number;
      readonly body: BoardErrorBody;
    };

const INTERNAL: BoardErrorBody = Object.freeze({ reason: 'internal' });

/** The board API's answer to a request: its JSON body, typed by whether it succeeded. Status 0 is a network failure. */
export async function api<T>(
  path: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      ...init,
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
