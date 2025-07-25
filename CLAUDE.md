# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Build & Development:**

- `pnpm build` - Build the application
- `pnpm start:dev` - Start development server with hot reload
- `pnpm start:debug` - Start with debug mode
- `pnpm start:dev:sentry` - Start development with Sentry instrumentation

**Code Quality:**

- `pnpm lint` - Run Biome linter (must pass)
- `pnpm check` - Run Biome check (includes lint + format)
- `pnpm format` - Format code with Biome
- `pnpm typecheck` - TypeScript type checking (must pass)

**Note:** When running linting with biome, use `biome check --fix` to also apply formatting fixes automatically.

**Testing:**

- `pnpm test` - Run tests in watch mode
- `pnpm test:cov` - Run tests with coverage
- `pnpm test:ci` - Run tests in CI mode

**Git & Commits:**

- `pnpm commit` - Use commitizen for conventional commits (required)

## Architecture Overview

**Framework:** NestJS application context (not HTTP server) that runs as a Discord bot

**Core Structure:**

- `src/main.ts` - Application bootstrap
- `src/app.module.ts` - Root module importing all feature modules
- `src/discord/` - Discord.js client integration and helpers
- `src/slash-commands/` - Discord slash command implementations using CQRS pattern
- `src/firebase/` - Firebase/Firestore database integration
- `src/sheets/` - Google Sheets API integration
- `src/fflogs/` - FF Logs GraphQL API integration
- `src/jobs/` - Scheduled jobs (cron tasks)

**Key Patterns:**

- **CQRS**: Commands and events for slash command handling
- **Module-based**: Each feature has its own NestJS module
- **Slash Commands**: Each command has `.slash-command.ts`, `.command-handler.ts`, `.command.ts` files
- **Configuration**: Zod schemas for environment validation
- **Error Handling**: Sentry integration with structured logging

**Slash Commands Architecture:**

- Commands are organized by feature (blacklist, signup, search, etc.)
- Each command uses CQRS pattern with command handlers
- Subcommands are organized in nested directories
- Command registration happens in `SlashCommandsService`

**External Integrations:**

- **Discord.js**: Bot client and interaction handling
- **Firebase**: Document-based data storage
- **Google Sheets**: Spreadsheet integration for signup management
- **FF Logs**: FFXIV combat log analysis
- **Sentry**: Error monitoring and performance tracking

## Code Standards

**Formatting:** Uses Biome instead of Prettier/ESLint

- 2 spaces indentation
- Single quotes for JavaScript strings
- Automatic import organization

**TypeScript:**

- Strict mode enabled
- No explicit `any` allowed (except in tests)
- Import type annotations preferred where applicable

**Testing:** Vitest with coverage via v8 provider

- Test files use `.spec.ts` suffix
- Global test utilities available (describe, test, expect, etc.)
- Coverage excludes command definition files

**Commits:** Conventional Commits enforced via commitlint

- Use `pnpm commit` for guided commit creation
- Format: `type(scope): description`
- Types: feat, fix, docs, style, refactor, test, build, ci, perf

## Development Notes

**Dependencies:** Uses pnpm with specific built dependencies configuration
**Docker:** Dockerfile available for containerized deployment
**GraphQL:** Code generation from FF Logs schema via `pnpm graphql:codegen`
