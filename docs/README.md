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

## What the Bot Does

The bot provides Discord-based tooling for organizing FFXIV raid progression groups:

- **Signups** — Players submit signup requests with proof of progression (FF Logs link or screenshot)
- **Review workflow** — Coordinators review signups via emoji reactions in a dedicated channel; the bot assigns appropriate Discord roles on approval
- **Sheets sync** — Approved signups are mirrored to Google Sheets for public roster visibility
- **Clear checking** — A daily job queries FF Logs to automatically remove signups from players who have cleared the encounter
- **Moderation** — Blacklist management, role cleanup utilities, and audit logging to a mod channel
