# @ulti-project/web

Public web app + read-only API for Ulti-Project, deployed as a **single Cloudflare Pages project** from this directory.

- `public/` — static assets. Phase 2 ships a placeholder `index.html`; phase 3 replaces it with the Vite + SolidJS build output.
- `functions/` — Cloudflare Pages Functions (file-based routing). Cloudflare only routes files that export an `onRequest*` handler; `*.spec.ts` files create no routes and are ignored by the Functions build.

## Endpoints

| Method & path | Returns |
| --- | --- |
| `GET /api/encounters` | `{ id, name, description, mode?, emoji? }[]` — active encounters. |
| `GET /api/encounters/:id/signups` | `{ character, world, role, progPoint, partyStatus }[]` — approved signups, excluding `partyStatus === 'Cleared'`. `404` if `:id` is unknown. |

Both are GET-only and public. `200` responses are edge-cached for 60s. Upstream failures return `502 { "error": "upstream unavailable" }` and are not cached.

## Cloudflare Pages configuration

**Project settings**
- Connect the repo; set the project root / build directory to `apps/web`.
- Build command: _none_ (phase 2). Build output directory: `public`.

**Environment variable** (plain, not secret)
- `GCP_PROJECT_ID`

**Secrets** (`wrangler pages secret put <NAME>` — encrypted)
- `GCP_SERVICE_ACCOUNT_EMAIL`
- `GCP_SERVICE_ACCOUNT_PRIVATE_KEY` — the full PEM including `-----BEGIN PRIVATE KEY-----` / newlines. Literal `\n` sequences are also accepted (the client normalises them).

**GCP service account** — create a **dedicated** account with **only** `roles/datastore.viewer` (read-only, least privilege, separate from the bot's read/write account).

## Local development

`pnpm web:dev` (alias for `pnpm --filter @ulti-project/web dev` → `wrangler pages dev`) reads local vars from `apps/web/.dev.vars` (gitignored):

```
GCP_PROJECT_ID=ulti-project-local
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
```

When `FIRESTORE_EMULATOR_HOST` is set, the client skips the JWT exchange and talks to the emulator unauthenticated — so no service-account secret is needed locally.

1. Start the phase-1 Firestore emulator and seed it (`pnpm cli encounters push --yes`, plus the phase-1 signup seeder).
2. `pnpm web:dev`.
3. Verify:
   ```bash
   curl -s localhost:8788/api/encounters | jq
   curl -s localhost:8788/api/encounters/FRU/signups | jq
   ```
   Confirm the encounters shape, that signups contain only the five public fields, and that no `Cleared` rows appear.
