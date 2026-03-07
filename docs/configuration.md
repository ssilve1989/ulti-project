# Configuration

## Why Zod for Environment Validation

All configuration is loaded from environment variables and validated at startup using Zod schemas (`src/config/app.ts`, `src/config/firebase.ts`).

**The benefit:** If a required variable is missing or malformed, the process exits immediately with a clear, human-readable error message — before establishing any connections. Without this, the bot might start, connect to Discord, and then crash mid-command when trying to access an undefined config value. Fail-fast at startup is far easier to diagnose than a runtime crash.

Zod also narrows types: after parsing, `appConfig.APPLICATION_MODE` is typed as `('savage' | 'ultimate' | 'legacy')[]` rather than `string`, and `appConfig.DISCORD_REFRESH_COMMANDS` is a `boolean` rather than a string.

---

## Environment Variables

### Required

| Variable | Type | Description |
|----------|------|-------------|
| `DISCORD_TOKEN` | string | Discord bot token |
| `CLIENT_ID` | string | Discord application (bot) client ID |
| `GCP_ACCOUNT_EMAIL` | string | GCP service account email (used for Firestore + Sheets) |
| `GCP_PRIVATE_KEY` | string | GCP service account private key |
| `GCP_PROJECT_ID` | string | GCP project ID |

### Optional

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `APPLICATION_MODE` | `savage\|ultimate\|legacy` (plus-separated) | `ultimate` | Controls which encounters and command options are active. See below. |
| `DISCORD_REFRESH_COMMANDS` | boolean | `false` | If `true`, re-registers all slash commands with Discord on startup. See below. |
| `FFLOGS_API_ACCESS_TOKEN` | string | — | Bearer token for FF Logs GraphQL API. If absent, FF Logs integration is disabled. |
| `FIRESTORE_DATABASE_ID` | string | — | Named Firestore database (defaults to the project's default database). |
| `LOG_LEVEL` | `debug\|info\|warn\|error\|silent\|fatal` | `info` | Pino log level. |
| `NODE_ENV` | `development\|production\|test` | `development` | Affects log formatting (pretty-print vs JSON) and may affect other environment-specific behavior. |

---

## APPLICATION_MODE

This variable controls which raid content the bot is configured for:

```
APPLICATION_MODE=ultimate            # Single mode
APPLICATION_MODE=savage+ultimate     # Multiple modes combined
APPLICATION_MODE=savage+ultimate+legacy
```

**What it affects:**
- Which encounter choices appear in `/signup` and other commands
- Which encounter-specific command options are registered with Discord

**Why a runtime flag rather than separate bots?** Some communities run multiple content types (e.g., both Savage and Ultimate progression groups) in the same Discord server. A single bot instance can serve all of them. Separate deployments can be used for servers that only need one mode.

The `+` separator was chosen over commas because some deployment environments (particularly Docker/Fly.io) have issues passing comma-containing values through environment variable expansion.

**Default:** `ultimate` — the original use case this bot was built for.

---

## DISCORD_REFRESH_COMMANDS

When `true`, the bot registers (or re-registers) all slash commands with Discord's API on startup via a bulk HTTP request. Discord caches slash command definitions; this flag forces a refresh.

**When to use `true`:**
- After adding, removing, or changing any slash command definitions or options
- When setting up a new bot instance

**Why default `false`:**
- Discord rate-limits command registration. Refreshing on every startup would hit this limit in normal production operation.
- Discord propagates command updates globally within minutes — there's no need to refresh unless the definitions actually changed.

---

## Deployment

### Docker

A `Dockerfile` is included at the project root. The typical build and run:

```sh
docker build -t ulti-project .
docker run --env-file .env ulti-project
```

### Fly.io

A `fly.toml` is included for deployment to [Fly.io](https://fly.io). The bot runs as a persistent VM (not a serverless function) — necessary because it maintains a persistent WebSocket connection to Discord.

Key considerations for Fly.io deployment:
- Set all environment variables as Fly secrets (`fly secrets set KEY=value`)
- The bot has no HTTP port to expose; configure Fly to run it as a background worker

### Local Development

```sh
cp .env.example .env   # fill in required variables
pnpm start:dev         # hot reload via ts-node-dev
```

For local development with Sentry instrumentation:
```sh
pnpm start:dev:sentry
```

---

## Config Module Structure

```
src/config/
├── app.ts       # Main app config (Discord, GCP, FF Logs, mode, logging)
└── firebase.ts  # Firebase-specific config (FIRESTORE_DATABASE_ID)
```

Both files export a typed config object parsed at module load time:

```ts
export const appConfig = appSchema.parse(process.env);
```

This means config is a plain object — no `ConfigService` injection needed. Any module can import `appConfig` directly. This is intentional: it avoids the extra indirection of NestJS's `ConfigModule` for a use case where the config is fully known at startup and doesn't need to vary per-request.
