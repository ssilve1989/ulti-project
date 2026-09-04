# Architecture Documentation

This directory contains architecture documentation for the **ulti-project** — a Discord bot that manages FFXIV (Final Fantasy XIV) raid group signups, role assignment, and progression tracking.

## Quick Start for Developers

See [`CLAUDE.md`](../CLAUDE.md) at the project root for development commands (build, test, lint, etc.).

**Key commands:**

```sh
pnpm start:dev        # Start bot with hot reload
pnpm test             # Run tests
pnpm lint             # Lint with Biome
pnpm build:check      # Type-check + compile (tsc -b, emits dist/)
```

### Local Firestore (one-time setup)

The bot and CLI run against a local Firestore emulator, not a shared cloud project. One-time prerequisites:

- A local Java runtime (the Firestore emulator is JVM-based) — `mise install` provides it (`java` is pinned in `mise.toml`).
- The repo-root `.env.keys` file (gitignored — get it from a maintainer). No per-developer env edits are needed: `apps/bot/.env.development` and `apps/cli/.env.development` are committed encrypted and already set `FIRESTORE_EMULATOR_HOST=localhost:8080`. `GCP_PROJECT_ID` and `FIRESTORE_DATABASE_ID` may still hold real per-env values in these files (kept for reference) — `createFirestore()` (`packages/shared/src/firebase/create-firestore.ts`) always overrides both to the emulator's project (`demo-ulti-project`, matching `.firebaserc`) and its `(default)` database whenever `FIRESTORE_EMULATOR_HOST` is set. If you ever see `[createFirestore] FIRESTORE_EMULATOR_HOST is not set — connecting to LIVE Firestore` in the logs while running locally, that override didn't kick in — check `FIRESTORE_EMULATOR_HOST` in the env file being loaded.
- **Only Firestore is emulated.** `GCP_ACCOUNT_EMAIL`/`GCP_PRIVATE_KEY` remain real credentials and Google Sheets sync is intentionally live in local dev — `pnpm seed:emulator` seeds a real dev/test spreadsheet id on purpose, so approving a seeded signup exercises the real Sheets write path against that dev sheet. Don't repoint `settings.spreadsheetId` at a production sheet while testing locally.
- `pnpm seed:emulator` and `pnpm cli` run straight from TypeScript source via `node` (no build step); only `pnpm start:dev` needs a prior `pnpm build`.

Each time you start fresh (or after clearing `.emulator-data/`):

```sh
pnpm emulators                    # start the emulator (keep running in its own terminal)
pnpm seed:emulator                # push all real encounters from data/encounters/*.yaml, then seed sample signups
pnpm start:dev                    # or: pnpm cli
```

`pnpm seed:emulator` runs `pnpm cli encounters push --yes` first — without it the encounters/prog-points data is missing and signup review embeds render with no prog point choices. Run `pnpm cli encounters push --yes` on its own any time you only need to refresh encounter data (e.g. after editing a `data/encounters/*.yaml` file) without re-seeding signups.

To wipe back to an empty emulator without restarting it, run `pnpm emulators:reset` (then `pnpm seed:emulator` again if you want fixture data back).

Emulator data persists across restarts in `.emulator-data/` (gitignored). Inspect it live at the Emulator UI: http://localhost:4000

If `pnpm seed:emulator`, `pnpm cli encounters push --yes`, or the bot itself hangs with no output or error, check that `pnpm emulators` is actually running first — the Admin SDK doesn't fail fast against an unreachable `FIRESTORE_EMULATOR_HOST`, it retries with backoff, so a missing emulator looks like a silent hang rather than a clear connection error.

## What the Bot Does

The bot provides Discord-based tooling for organizing FFXIV raid progression groups:

- **Signups** — Players submit signup requests with proof of progression (FF Logs link or screenshot)
- **Review workflow** — Coordinators review signups via emoji reactions in a dedicated channel; the bot assigns appropriate Discord roles on approval
- **Sheets sync** — Approved signups are mirrored to Google Sheets for public roster visibility
- **Clear checking** — A daily job queries FF Logs to automatically remove signups from players who have cleared the encounter
- **Moderation** — Blacklist management, role cleanup utilities, and audit logging to a mod channel
