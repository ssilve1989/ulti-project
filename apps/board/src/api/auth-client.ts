import { createAuthClient } from 'better-auth/client';

/** better-auth's client, at this origin's `/api/auth`. */
export const authClient = createAuthClient({
  // better-auth keeps the `fetch` it saw at creation; this looks it up per request, so a stubbed one is used.
  fetchOptions: { customFetchImpl: (input, init) => fetch(input, init) },
});
