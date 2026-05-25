# AGENTS.md

Non-discoverable constraints and workflow gotchas. Everything else (stack, architecture, scripts) is in `package.json`, `tsconfig.json`, `biome.json`, `vitest.config.ts`, and `lefthook.yml`.

## Commands

- **Typecheck**: `pnpm typecheck` — uses `tsgo` (`@typescript/native-preview`), not `tsc`. Checks both `tsconfig.app.json` and `src/cli/tsconfig.json`.
- **Auto-fix lint/format**: No npm script wraps `--fix`. Run `biome check --fix .` directly. `pnpm check` and `pnpm lint` only report errors.
- **New slash command**: Use `pnpm g:slash-command` (hygen generator, templates in `_templates/slash-command/`). Don't copy-paste files manually.

## Workflow

- Don't commit spec/design files during brainstorming. Write them to disk but only commit once on a feature branch.
