# Pnpm Workspace Migration with Native-TS Shared Packages — Design

Date: 2026-08-29

## Goal

Restructure the monorepo around proper package boundaries:

- Nothing ever depends on an application package. Applications are leaves.
- Library code lives in a true package that contains no runtime executables.
- Node 26+ native type-stripping lets library packages ship `.ts` source as
  their runtime artifact instead of compiled JS.

The CLI gets project references to the shared package; the bot compiles to JS
as today but imports the shared package's `.ts` source at runtime.

## Target layout

```
<root>                       private orchestration root (config + scripts, no src)
  package.json               private, name "ulti-project", no version, tooling devDeps only
  apps/bot                   @ulti-project/bot  v2.6.4 — compiles to JS (dist)
  apps/cli                   @ulti-project/cli        — runs natively from .ts source
  packages/shared            @ulti-project/shared     — pure erasable TS; emits d.ts only
```

Dependency graph (invariant): bot → shared, cli → shared. shared → {zod,
firebase-admin}. Nothing depends on bot or cli.

## Native-TS mechanism

`@ulti-project/shared` uses a dual-condition exports map:

```json
"exports": { ".": { "types": "./dist/index.d.ts", "default": "./src/index.ts" } }
```

- TypeScript consumers resolve types from the emitted `dist/*.d.ts`.
- Node 26 resolves `default` → `src/index.ts` and strips types at runtime
  (verified in Phase 0: a compiled JS entry importing the `.ts` source through
  a workspace symlink runs cleanly).
- Shared emits declarations only (`composite` + `emitDeclarationOnly`), so it
  stays a valid project-reference target without producing runnable JS.

Confirmed empirically in Phase 0 (TS 7.0.2, Node 26.7.0):

- `allowImportingTsExtensions`, `rewriteRelativeImportExtensions`,
  `erasableSyntaxOnly`, `emitDeclarationOnly`+`composite` all accepted by
  `tsc -b`.
- `types → dist/index.d.ts` resolves the barrel's internal `export * from
  './a.ts'` declaration refs under `moduleResolution: nodenext` even with
  `skipLibCheck: false`.
- `node` runs emitted JS importing a `.ts`-exporting workspace package.

## Constraints that force source rewrites

- Native type-stripping permits only erasable syntax: no enums, namespaces, or
  constructor parameter properties. Shared's `Encounter`, `SignupStatus`,
  `PartyStatus` enums are rewritten to `as const` objects + union types.
- Node runtime resolution requires explicit `.ts` extension on relative
  imports inside packages that run natively (shared, cli). `./x.js` →
  `./x.ts`. Bot keeps `.js` relative imports (it compiles).

## What moves

### apps/bot
- `src/**` → `apps/bot/src/**` (relative imports unaffected), plus
  `instrumentation.ts`, `global.d.ts`.
- `package.json`: `@ulti-project/bot` @ 2.6.4 (identity migrates from root);
  runtime deps + `@ulti-project/shared: workspace:*`. `main: dist/main.js`.
- tsconfigs: `tsconfig.build.json` (composite, `rootDir: src`, `outDir: dist`,
  references `../../packages/shared`), `tsconfig.typecheck.json` (noEmit,
  specs + build ref).

### packages/shared
- Modules moved from bot `src/`:
  - `firebase/models/signup.model.ts`
  - `firebase/models/encounter.model.ts`
  - `firebase/create-firestore.ts`
  - `encounters/encounters.consts.ts`
  - new `config/app-types.ts` (`ApplicationMode`, `ApplicationModeConfig`)
- Enums → const objects; relative imports → `.ts`; barrel `src/index.ts`.
- `exports` dual-condition map; `sideEffects: false`.
- `tsconfig.json`: `composite`, `emitDeclarationOnly`, `declarationMap`,
  `erasableSyntaxOnly`, `allowImportingTsExtensions`,
  `rewriteRelativeImportExtensions`.
- Bot's `src/config/app.ts` keeps its zod schema/env parse and re-exports the
  two types from shared so its ~10 type-only importers stay unchanged.

### apps/cli
- `src/cli/**` → `apps/cli/src/**`; relative `.js` imports → `.ts`.
- Runs `node apps/cli/src/main.ts` directly (no build step).
- `tsconfig.json`: noEmit typecheck, `erasableSyntaxOnly`,
  `allowImportingTsExtensions`, references shared.
- Deps: `@ulti-project/shared`, `commander`, `@clack/prompts`, `yaml`, `zod`,
  `graphql-request`, `firebase-admin`.

## Build / typecheck orchestration

- Root `build` = `tsc -b apps/bot/tsconfig.build.json` (builds shared d.ts via
  reference).
- `build:all` = `pnpm -r --if-present run build`.
- `build:check` = `pnpm -r run build:check` (one command over all packages and
  specs; per-package `tsc -b <typecheck>`).
- Root `tsconfig.json` stays an extends-only compiler-options base.
- Reference graph: bot → shared; cli → shared. No app references another app.

## Root scripts (unchanged developer UX; `.env` handled by dotenvx at root)

- `cli`/`cli:prod` = `dotenvx run ... -- node apps/cli/src/main.ts`
- `start`/`start:dev` = `dotenvx run ... -- node apps/bot/dist/main.js`
- `test` = single root vitest config; alias `@ulti-project/shared` →
  `packages/shared/src/index.ts` (tests run against source).
- coverage: `apps/bot/src/**` + `packages/shared/**`; exclude `apps/cli/**`.

## Tooling

- knip: entries/glob re-targeted to `apps/*/src`, `packages/*/src`.
- codegen + `.graphqlrc.yml`: targets → `apps/bot/src/fflogs/...`.
- biome/lefthook: unaffected.
- Dockerfile: installs workspace, builds bot (`pnpm build`); runtime image
  ships `apps/bot/dist` + `packages/shared/src` (the runtime TS artifact) +
  node_modules symlinks; prod install filtered to `@ulti-project/bot`.
- release-please: `release-please-config.json` + `.release-please-manifest.json`
  redirected to `apps/bot`; CHANGELOG moves there.
- Renovate picks up new manifests automatically.

## Known trade-off

~85 bot import lines plus the CLI's cross-boundary imports are rewritten to
`@ulti-project/shared`; shared/cli sources get the enum and `.ts`-extension
rewrites. This is the inherent cost of the no-depend-on-apps rule.

## Verification

1. `pnpm install` then `pnpm build:check` (all packages + specs)
2. `pnpm test --run` and `pnpm knip`
3. `pnpm build`; `pnpm cli --help` runs natively from `.ts`
4. `pnpm docker:build`; container boots and resolves `@ulti-project/shared`
   to `.ts` at runtime