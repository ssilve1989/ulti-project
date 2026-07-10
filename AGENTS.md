# AGENTS.md

Non-discoverable constraints and workflow gotchas. Everything else (stack, architecture, scripts) is in `package.json`, `tsconfig.json`, `biome.json`, `vitest.config.ts`, and `lefthook.yml`.

## Commands

- **Typecheck**: `pnpm build:check` (there is no `typecheck` script) — runs `tsc -b tsconfig.typecheck.json` over the project-reference graph: builds the app (`tsconfig.build.json`) and CLI (`tsconfig.cli.json`) projects (this **emits `dist/`**) and type-checks specs + root config files. A pure no-emit check isn't possible: `tsc -b --noEmit` is rejected (TS6310) because referenced projects must emit their declarations.
- **Auto-fix lint/format**: No npm script wraps `--fix`. Run `biome check --fix .` directly. `pnpm check` and `pnpm lint` only report errors.
- **New slash command**: Use `pnpm g:slash-command` (hygen generator, templates in `_templates/slash-command/`). Don't copy-paste files manually.

## Workflow

- Don't commit spec/design files during brainstorming. Write them to disk but only commit once on a feature branch.
