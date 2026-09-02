# AGENTS.md

Non-discoverable constraints and workflow gotchas. Everything else (stack, architecture, scripts) is in `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `biome.json`, `vitest.config.ts`, and `lefthook.yml`.

## Workspace layout

pnpm workspace: `apps/*` (deployable applications) + `packages/*` (libraries).

- **Invariant: applications are leaves.** Nothing may depend (directly or transitively) on `@ulti-project/bot` or `@ulti-project/cli`. Applications may depend only on `@ulti-project/shared`.
- `packages/shared` (and `apps/cli`) are **native-TS**: erasable-syntax-only source that Node 26 runs directly from `.ts`. Their relative imports must use explicit `.ts` extensions (Node does not map `.js` → `.ts`). The bot is **not** native: it compiles to `apps/bot/dist` and its relative imports keep `.js` extensions.
- `@ulti-project/shared` ships a dual exports map (`types` → `dist/index.d.ts`, `default` → `src/index.ts`): TS consumers compile against the emitted declarations; Node executes the source. Its `src/` is **not** erasable-safe to edit naively — enums are forbidden (`erasableSyntaxOnly`), use `as const` objects + union types.
- Never move files across workspace packages by hand-forking them. `git mv` so history is preserved, then rewrite the imports.

## Commands

- **Typecheck**: `pnpm build:check` — `pnpm -r run build:check` runs each package's own step (bot: `tsc -b apps/bot/tsconfig.typecheck.json`, which builds the app project, emitting `apps/bot/dist/`, and type-checks bot specs; `apps/cli` and `packages/shared` check themselves natively) plus root config scripts via `tsc -b tsconfig.typecheck.json`. A pure no-emit check isn't possible: `tsc -b --noEmit` is rejected (TS6310) because referenced projects must emit their declarations — hence the bot emitting `dist/`.
- **Build**: `pnpm build` builds the bot (and `@ulti-project/shared` via the reference graph). `pnpm build:all` builds every package (`pnpm -r --if-present run build`). The CLI runs straight from source — there is no CLI build step.
- **Run the CLI**: `pnpm cli` / `pnpm cli:prod` (no build needed).
- **Auto-fix lint/format**: No npm script wraps `--fix`. Run `biome check --fix .` directly. `pnpm check` and `pnpm lint` only report errors.
- **New slash command**: copy an existing command directory under `apps/bot/src/slash-commands/` (its `.slash-command.ts` + `.command-handler.ts` + `.command.ts` + `.module.ts`), rename, and register the new module in `apps/bot/src/slash-commands/slash-commands.module.ts`. (There is no generator — hygen was removed.)
- **App scripts run from the package dir, not the repo root**: root scripts delegate via `pnpm --filter` shims, so `process.cwd()` inside a script is the package dir. The CLI never uses `process.cwd()` for repo-relative paths — use `REPO_ROOT` (`apps/cli/src/utils/repo-root.ts`).
- **Env files are a two-layer dotenvx hierarchy**: one encrypted `.env` at the repo root holds shared secrets (GCP service-account creds, FFLogs token) and is committed. Each app has its own committed, encrypted `apps/<app>/.env.development` for dev-only values and overrides (e.g. `GCP_PROJECT_ID=demo-ulti-project`, `FIRESTORE_EMULATOR_HOST`). App `start:dev`/`cli` scripts run `dotenvx run -fk ../../.env.keys -f .env.development -f ../../.env` — dotenvx is **first-`-f`-wins**, so the app file must precede the root file, and `-fk` is required because the one keyfile (`.env.keys`, gitignored, never committed) lives only at the root. `.env.production` is **not** committed even though encryption would allow it; the prod `cli:prod` shim reads a local `.env.production` you supply (the bot has no `start` script — it runs from its container). Root `start:dev*`/`cli*` scripts are `pnpm --filter` shims.
- **Deploy config is in `apps/bot/`**: `Dockerfile`, `fly.toml`, `codegen.ts`, `.graphqlrc.yml`, `schema.graphql`. Fly/Docker builds still run from the repo root (`flyctl deploy --config ./apps/bot/fly.toml --dockerfile ./apps/bot/Dockerfile`, `docker build -f apps/bot/Dockerfile .`).

## Workflow

- Don't commit spec/design files during brainstorming. Write them to disk but only commit once on a feature branch.