# Script and Deploy Config Co-Location

**Date:** 2026-08-29
**Status:** Draft
**Branch:** a new feature branch off `master`

## Context

The workspace migration (2026-08-29-workspace-migration-design.md) restructured the
repo into `apps/bot`, `apps/cli`, and `packages/shared`, but left every package
script, the Dockerfile, and `fly.toml` in the root `package.json` and repo root.

This spec co-locates package-owned concerns with the packages that own them:

- runtime invocation commands (`start`, `start:dev`, `cli`, `cli:prod`)
- deploy tooling (`docker:build`, `sentry:sourcemaps`) and deploy config
  (`Dockerfile`, `fly.toml`)
- bot-only dev tooling (`graphql:codegen`, `g:slash-command`) and its config
  (`codegen.ts`, `.graphqlrc.yml`, `schema.graphql`, `_templates/`)
- per-package env files (copies, for now)

Root `package.json` keeps only workspace-wide orchestration and repo conventions,
plus thin **delegating shims** so muscle-memory root commands keep working.

## Current State (inventory)

All of these live at the repo root today:

| Script | Owner | Destination |
|--------|-------|-------------|
| `build` | bot (compiles bot + shared via refs) | root shim keeps it available |
| `build:all` | orchestration (all workspace builds) | stays at root |
| `build:check` | orchestration (all members + root graph) | stays at root |
| `check` / `format` / `lint` / `lint:ci` | repo-wide biome | stays at root |
| `commit` / `commitlint` / `prepare` | repo conventions (git-cz, lefthook) | stays at root |
| `docker:build` | bot | moves to apps/bot |
| `g:slash-command` | bot (hygen) | moves to apps/bot |
| `graphql:codegen` | bot (FFLogs SDK generator) | moves to apps/bot |
| `knip` | repo-wide | stays at root |
| `start` / `start:dev` / `start:dev:sentry` | bot | moves to apps/bot |
| `cli` / `cli:prod` | cli | moves to apps/cli |
| `test` / `test:ci` / `test:cov` / `test:ui` | repo-wide vitest (coverage aggregates bot + shared) | stays at root |
| `sentry:sourcemaps` | bot | moves to apps/bot |

Root files moving to `apps/bot/`: `Dockerfile`, `fly.toml`, `codegen.ts`,
`.graphqlrc.yml`, `schema.graphql`, `_templates/`.

Root devDeps moving with their scripts: `@dotenvx/dotenvx` (bot + cli),
`@sentry/cli`, `@graphql-codegen/*` (cli, schema-ast, typescript,
typescript-graphql-request, typescript-operations), `hygen` (bot).

pnpm 12 (Rust rewrite) was assessed: commands, flags, settings, and lockfile
format carry over unchanged; it does not affect any decision in this spec.

## Decisions

1. **Approach A — full app ownership**: each package owns its runtime, deploy,
   and bot-only tooling scripts and configs.
2. **Root delegating shims**: root keeps thin `pnpm --filter <pkg> run <script>`
   shims for every moved command so `pnpm start`, `pnpm cli`,
   `pnpm graphql:codegen`, etc. keep working from the repo root unchanged. This
   also keeps CI invocations of those commands unchanged.
3. **Env files co-located (copies, for now)**: `.env`, `.env.development`,
   `.env.production` are copied into `apps/bot/` and `apps/cli/`. They remain
   gitignored and are never committed. A future migration can make them
   genuinely per-app; today they are copies of the root files for the one-time
   setup.
4. **Build context stays the repo root** for both `docker build` and
   `flyctl deploy`; only the Dockerfile/fly.toml *locations* move. The
   multi-workspace Dockerfile depends on this.

## Changes

### apps/bot/package.json

```jsonc
"scripts": {
  "start": "dotenvx run -f .env -f .env.production -- node dist/main.js",
  "start:dev": "dotenvx run -f .env -f .env.development -- node dist/main.js",
  "start:dev:sentry": "NODE_OPTIONS=\"--import=./instrumentation.ts\" dotenvx run -f .env -f .env.development -- node dist/main.js",
  "build": "tsc -b tsconfig.build.json",
  "build:check": "tsc -b tsconfig.typecheck.json",
  "docker:build": "docker build -f Dockerfile -t ulti-project-bot:latest ../..",
  "sentry:sourcemaps": "sentry-cli sourcemaps inject --org ulti-project --project ulti-project-bot ./dist && sentry-cli sourcemaps upload --org ulti-project --project ulti-project-bot ./dist",
  "graphql:codegen": "graphql-codegen --config codegen.ts",
  "g:slash-command": "hygen slash-command new"
}
```

devDependencies **add**: `@dotenvx/dotenvx`, `@sentry/cli`,
`@graphql-codegen/cli`, `@graphql-codegen/schema-ast`,
`@graphql-codegen/typescript`, `@graphql-codegen/typescript-graphql-request`,
`@graphql-codegen/typescript-operations`, `hygen`.

`NODE_OPTIONS` note: `--import=./instrumentation.ts` is relative to the bot
package (the script runs with cwd = apps/bot under `pnpm run`).

### apps/cli/package.json

```jsonc
"scripts": {
  "cli": "dotenvx run -f .env -f .env.development -- node src/main.ts",
  "cli:prod": "dotenvx run -f .env -f .env.production -- node src/main.ts",
  "build:check": "tsc -b"
}
```

devDependencies **add**: `@dotenvx/dotenvx`.

### CLI cwd independence (required by the move)

A root shim (`pnpm --filter @ulti-project/cli cli`) runs the script with cwd =
`apps/cli`. Today `push`/`pull` resolve the encounter library via
`join(process.cwd(), 'data', 'encounters')`, which would silently point at
`apps/cli/data/encounters`.

- Add `apps/cli/src/utils/repo-root.ts`: walks up from `import.meta.dirname`
  until it finds `pnpm-workspace.yaml` and returns the monorepo root
  (fallback: `fileURLToPath(new URL('.', import.meta.url))` if `import.meta.dirname`
  is unavailable in the type environment).
- `push/index.ts` and `pull/index.ts`: `join(process.cwd(), 'data', 'encounters')`
  → `join(REPO_ROOT, 'data', 'encounters')`.
- Add a small unit test (e.g. `repo-root.spec.ts`) asserting `REPO_ROOT` ends
  with the repo root and `pnpm-workspace.yaml` exists there.
- `data/` stays at the repo root and is unchanged.

### Root package.json

```jsonc
"scripts": {
  "build": "pnpm --filter @ulti-project/bot build",
  "build:all": "pnpm -r --if-present run build",
  "build:check": "pnpm -r run build:check && tsc -b tsconfig.typecheck.json",
  "check": "biome check",
  "cli": "pnpm --filter @ulti-project/cli cli",
  "cli:prod": "pnpm --filter @ulti-project/cli cli:prod",
  "commit": "git-cz",
  "commitlint": "commitlint --edit",
  "docker:build": "pnpm --filter @ulti-project/bot docker:build",
  "format": "biome format --write",
  "g:slash-command": "pnpm --filter @ulti-project/bot g:slash-command",
  "graphql:codegen": "pnpm --filter @ulti-project/bot graphql:codegen",
  "knip": "knip",
  "lint": "biome lint --diagnostic-level=error",
  "lint:ci": "biome ci --diagnostic-level=error",
  "prepare": "node scripts/install-hooks.js",
  "start": "pnpm --filter @ulti-project/bot start",
  "start:dev": "pnpm --filter @ulti-project/bot start:dev",
  "start:dev:sentry": "pnpm --filter @ulti-project/bot start:dev:sentry",
  "sentry:sourcemaps": "pnpm --filter @ulti-project/bot sentry:sourcemaps",
  "test": "vitest",
  "test:ci": "CI=true vitest run --coverage",
  "test:cov": "vitest run --coverage",
  "test:ui": "vitest --ui"
}
```

devDependencies **remove**: `@dotenvx/dotenvx`, `@sentry/cli`,
`@graphql-codegen/cli`, `@graphql-codegen/schema-ast`,
`@graphql-codegen/typescript`, `@graphql-codegen/typescript-graphql-request`,
`@graphql-codegen/typescript-operations`, `hygen`.

### File moves (all `git mv`)

| From | To | In-place rewrite |
|------|----|------------------|
| `Dockerfile` | `apps/bot/Dockerfile` | none (body unchanged; context stays repo root) |
| `fly.toml` | `apps/bot/fly.toml` | none |
| `codegen.ts` | `apps/bot/codegen.ts` | output paths: `./apps/bot/src/...` → `./src/...`; documents: `apps/bot/src/...` → `src/...` |
| `.graphqlrc.yml` | `apps/bot/.graphqlrc.yml` | `schema: "apps/bot/src/..."` → `"src/..."`, same for documents |
| `schema.graphql` | `apps/bot/schema.graphql` | none (orphaned snapshot; kept for co-location) |
| `_templates/` | `apps/bot/_templates/` | `to:` lines drop the `apps/bot/` prefix (`to: apps/bot/src/...` → `to: src/...`) |

Env file copies (gitignored, never committed): `.env`, `.env.development`,
`.env.production` → into `apps/bot/` and `apps/cli/`.

### .dockerignore

- `_templates` → `apps/bot/_templates`
- `fly.toml` → `apps/bot/fly.toml`
- `codegen.ts` → `apps/bot/codegen.ts`
- `schema.graphql` → `apps/bot/schema.graphql`
- `.graphqlrc.yml` → `apps/bot/.graphqlrc.yml`
- `.env*` already applies at any depth (covers app-level env copies)

### Workflows

- `ci.yml`: unchanged — `pnpm graphql:codegen` resolves through the root shim.
- `docker-image.yml`: `file: ./apps/bot/Dockerfile`.
- `fly.yml`:
  - `pnpm build`, `pnpm sentry:sourcemaps` → unchanged (root shims).
  - `flyctl deploy --remote-only --ha=false --config ./apps/bot/fly.toml --dockerfile ./apps/bot/Dockerfile`

### Docs

- `AGENTS.md`: update Commands section — moved scripts are package-owned; root
  commands are delegating shims; scripts run with cwd = package dir; env files
  are per-package copies; deploy uses `--config`/`--dockerfile` pointing at
  `apps/bot/`.
- `CONTRIBUTING.md` / `README.md`: update any references to the moved commands
  and paths discovered by grep.

## Out of Scope

- pnpm 12 adoption.
- Deleting the orphaned root `schema.graphql` (moved, not deleted; candidate for
  future cleanup).
- Moving `data/` (encounter YAML content stays at the repo root; the CLI becomes
  cwd-independent instead).
- Making env files genuinely per-app/divergent (copies today).

## Verification

1. `pnpm install` — new per-package devDeps resolved, root deps removed.
2. `pnpm build:check` — passes (root `build:check` unaffected; app `build`/`build:check` scripts still resolve `tsc`).
3. `pnpm lint:ci` — biome clean (root-delegated commands intact).
4. `pnpm knip` — no unused deps (the moved devDeps must be recognized as used via script/bin usage and codegen.ts imports).
5. `pnpm test:ci` — 467/467, coverage unchanged.
6. `pnpm graphql:codegen` — regenerates `apps/bot/src/fflogs/graphql/*` at the new paths (needs FFLOGS token, or a schema-ast-only dry run with local schema).
7. `pnpm start:dev` — boots against `apps/bot/.env` copies (or fails on missing env as before — env files absent in clean checkouts).
8. `pnpm docker:build` — fresh `docker build -f apps/bot/Dockerfile` with context repo root; container smoke: imports `@ulti-project/shared` from the built bot dist.
9. `pnpm cli --help` — runs from apps/cli CWD via the root shim.
10. `pnpm test:ci` includes the new `repo-root.spec.ts` (CLI resolves
    `data/encounters` against the monorepo root, not cwd).