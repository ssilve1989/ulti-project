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

- A local Java runtime (the Firestore emulator is JVM-based)
- `.env.development` with `FIRESTORE_EMULATOR_HOST=localhost:8080` and `GCP_PROJECT_ID=ulti-project-emulator` set (matches `.firebaserc`). `GCP_ACCOUNT_EMAIL`/`GCP_PRIVATE_KEY` can be any non-empty placeholder value — they're ignored once `FIRESTORE_EMULATOR_HOST` is set. Leave `FIRESTORE_DATABASE_ID` unset.
- `pnpm build` (or `pnpm build:all`) run at least once — `pnpm cli` runs the compiled `dist/cli/main.js`, which doesn't exist on a fresh clone.

Each time you start fresh (or after clearing `.emulator-data/`):

```sh
pnpm emulators                    # start the emulator (keep running in its own terminal)
pnpm cli encounters push --yes    # seed all real encounters from data/encounters/*.yaml
pnpm seed:emulator                # seed a handful of sample signups
pnpm start:dev                    # or: pnpm cli
```

Emulator data persists across restarts in `.emulator-data/` (gitignored). Inspect it live at the Emulator UI: http://localhost:4000

If `pnpm cli encounters push --yes`, `pnpm seed:emulator`, or the bot itself hangs with no output or error, check that `pnpm emulators` is actually running first — the Admin SDK doesn't fail fast against an unreachable `FIRESTORE_EMULATOR_HOST`, it retries with backoff, so a missing emulator looks like a silent hang rather than a clear connection error.

## What the Bot Does

The bot provides Discord-based tooling for organizing FFXIV raid progression groups:

- **Signups** — Players submit signup requests with proof of progression (FF Logs link or screenshot)
- **Review workflow** — Coordinators review signups via emoji reactions in a dedicated channel; the bot assigns appropriate Discord roles on approval
- **Sheets sync** — Approved signups are mirrored to Google Sheets for public roster visibility
- **Clear checking** — A daily job queries FF Logs to automatically remove signups from players who have cleared the encounter
- **Moderation** — Blacklist management, role cleanup utilities, and audit logging to a mod channel
