# Firestore emulator for local development

**Date:** 2026-08-28
**Status:** Approved

## Problem

Today's local bot dev (`pnpm start:dev`, `pnpm cli`) points `firebase-admin` at a real, separate GCP "dev" Firestore project — `src/firebase/create-firestore.ts` always calls `cert()` with credentials from `.env.development` (`GCP_ACCOUNT_EMAIL`, `GCP_PRIVATE_KEY`, `GCP_PROJECT_ID`). This is a live cloud project: every contributor needs real service-account credentials to develop locally, and local runs consume that project's real Firestore quota.

This is phase 1 of a 3-phase project introducing a public read-only web app (Cloudflare Pages) that fronts this same Firestore data (see the phase-2 and phase-3 specs, once written). Phase 2's Cloudflare Pages Function will also need a local Firestore to iterate against, without burning free-tier quota or requiring cloud credentials for every contributor.

Rather than standing up a second, separate local-dev story for the web app, cut the bot's local dev over to a local Firestore emulator now. It's a self-contained improvement to the bot's dev workflow on its own, and phase 2/3 inherit it for free.

`.env.development` is not tracked in git (`.env*` is gitignored, and unlike other checked-in env files in this repo, `.env.development` has no dotenvx-committed copy), so all changes to it in this spec are local edits + documented instructions, not a repo change.

## Architecture

**`firebase.json`** (new, repo root) configures the emulator suite:
```json
{
  "emulators": {
    "firestore": { "port": 8080 },
    "ui": { "enabled": true, "port": 4000 }
  }
}
```
No `firestore.rules` reference — the bot only ever talks to the emulator through the Admin SDK, which bypasses Security Rules entirely (rules only apply to client-SDK/REST access with an end-user auth context). Rules become relevant in phase 2, scoped to that spec.

**`.firebaserc`** (new, repo root) associates a project id with the CLI so `firebase emulators:start` doesn't need `--project` on every invocation:
```json
{ "projects": { "default": "ulti-project-emulator" } }
```
This id is local-only and never needs to correspond to a real GCP project.

**`src/firebase/create-firestore.ts`** gets an emulator-aware branch — explicit, not relying on `cert()`'s lazy validation behavior with placeholder credentials:
```typescript
export function createFirestore(config: CreateFirestoreConfig): Firestore {
  const app: App = initializeApp(
    process.env.FIRESTORE_EMULATOR_HOST
      ? { projectId: config.projectId }
      : {
          credential: cert({
            clientEmail: config.clientEmail,
            privateKey: config.privateKey,
            projectId: config.projectId,
          }),
        },
    config.appName ?? '[DEFAULT]',
  );
  // ...unchanged from here
}
```
When `FIRESTORE_EMULATOR_HOST` is set, the Admin SDK auto-detects it and redirects all Firestore calls to the emulator — this is documented SDK behavior, not custom emulator-detection logic. `src/cli/config.ts` calls the same `createFirestore()`, so the CLI is covered by this one change.

**Encounters seeding — reuse the existing CLI, no new code.** `pnpm cli encounters push --yes` (`src/cli/commands/encounters/push/index.ts`) already reads every YAML file under `data/encounters/` (the real, canonical encounter definitions — `FRU`, `DSR`, `DMU`, `UCOB`, `TOP`, `UWU`, `TEA`) and upserts each into Firestore via `ctx.db`, which resolves through the same `createFirestore()` this spec makes emulator-aware. Pointed at the emulator (`.env.development` with `FIRESTORE_EMULATOR_HOST` set), this command seeds every real encounter and its full prog-point list with zero new code — better fixture fidelity than hand-written synthetic encounters, and it can never drift from the real YAML source of truth.

**Signups seeding** (`scripts/seed-emulator.ts`, new) — encounters have no signups-equivalent YAML source (signups are user-generated), so a small standalone script calls `createFirestore()` (with `FIRESTORE_EMULATOR_HOST` set) and writes a handful of representative `signups` docs referencing real encounter ids from the YAML files (e.g. a few `FRU` and `DSR` signups across different `partyStatus` values, at least one non-`APPROVED` status), so the bot's review flow has data to exercise without needing to drive the full Discord signup flow manually every time the emulator resets. Idempotent: re-running it clears and re-writes the same fixture set rather than accumulating duplicates.

## Configuration changes

**`package.json`** (new devDependency + scripts):
- `firebase-tools` as a devDependency
- `"emulators": "firebase emulators:start --import=./.emulator-data --export-on-exit=./.emulator-data"` — persists data across restarts
- `"seed:emulator": "tsx scripts/seed-emulator.ts"` (or the project's existing script-running convention) — seeds `signups` only; encounters are seeded via the existing `pnpm cli encounters push --yes`, not this script

**`.gitignore`**: add `.emulator-data/`

**`.env.development`** (local edit, not committed — documented in dev-setup docs):
- `FIRESTORE_EMULATOR_HOST=localhost:8080`
- `GCP_PROJECT_ID=ulti-project-emulator` (matches `.firebaserc`)
- `GCP_ACCOUNT_EMAIL` / `GCP_PRIVATE_KEY` — no longer read once the emulator branch is taken; can stay as whatever placeholder value already exists, or be removed if `appSchema` allows (it doesn't — both are required `z.string()`; leave placeholder values in place rather than relaxing the schema, since production/CI still require real values)
- `FIRESTORE_DATABASE_ID` — unset/empty, so `createFirestore` uses the default database (`getFirestore(app)` with no `databaseId`); the emulator's support for named databases is not something this project depends on

**Docs**: update the dev-setup section (README or equivalent) with:
1. One-time prerequisite: a local Java runtime (the Firestore emulator is JVM-based)
2. `pnpm emulators` in one terminal
3. `pnpm cli encounters push --yes` once per fresh emulator data dir — seeds all real encounters from `data/encounters/*.yaml`
4. `pnpm seed:emulator` once per fresh emulator data dir — seeds sample signups
5. `pnpm start:dev` / `pnpm cli` as today

## What doesn't change

- **CI test suite** (`pnpm test:ci`) — untouched. Existing spec files use the documented mocked-Firestore-chain convention (`firestoreMock → collectionMock → docMock`); the emulator is local-dev-only tooling and never runs in CI.
- **`.env.production`** — untouched; production continues using real `cert()` credentials, no `FIRESTORE_EMULATOR_HOST`.
- **Any application code outside `create-firestore.ts`** — the emulator redirect is entirely transparent to `SignupCollection`, `SettingsCollection`, etc.

## Error handling

- If `FIRESTORE_EMULATOR_HOST` is set but no emulator is actually running, Admin SDK calls fail with a connection-refused error at the same call sites that would fail on any other Firestore outage — no new error handling needed, existing behavior applies.
- Seed script failing mid-write (e.g. emulator not started yet) exits non-zero with the underlying Admin SDK error; no partial-state recovery logic needed since it's idempotent and safe to re-run.

## Testing

- Manual verification: `pnpm emulators`, `pnpm cli encounters push --yes`, `pnpm seed:emulator`, `pnpm start:dev`, confirm the bot's existing commands (e.g. viewing settings, signing up) operate against the emulator with the seeded data, and that data is visible in the Emulator UI (`localhost:4000`).
- No new unit tests — `create-firestore.ts` has no existing spec file and the added branch is a straight conditional on `initializeApp`'s config shape; not meaningfully testable without either mocking `firebase-admin` internals (low value) or an integration test against a real emulator (out of scope for this phase's CI, per "What doesn't change" above).

## Out of scope

- Cloudflare Pages Function's use of the emulator (REST API path, Security Rules) — phase 2.
- Any change to how production or CI resolve Firestore credentials.
- Named-database emulator support.
