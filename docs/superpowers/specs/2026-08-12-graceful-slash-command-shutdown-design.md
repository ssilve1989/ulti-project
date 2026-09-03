# Graceful shutdown for slash commands

**Date:** 2026-08-12
**Status:** Approved

## Problem

The bot is deployed on Fly.io (`fly.toml`, single machine — `min_machines_running = 1`). On a rolling restart/deploy, Fly sends SIGTERM. `main.ts` already calls `app.enableShutdownHooks()`, but `DiscordModule.onApplicationShutdown()` just does `client.removeAllListeners()` immediately — there's no draining. This means:

- New slash command interactions can still be dispatched right up until the process dies mid-handler.
- In-flight command handlers can be cut off before they finish (no reply sent, external side effects half-done).

Goal: once shutdown begins, stop accepting new slash commands (reply with a friendly "restarting" message instead of dispatching) and let in-flight commands finish before the process exits, bounded by a timeout so we don't get SIGKILLed.

Scope is explicitly slash commands only (`SlashCommandsService.listenToCommands`) — other event-driven subscriptions (e.g. reaction handling in `signup.service.ts`) are out of scope for this change.

## Architecture

A new `SlashCommandDrainService` (`src/slash-commands/slash-command-drain.service.ts`) owns all shutdown-draining state, kept separate from `SlashCommandsService` so the shutdown-timing logic is isolated and independently unit-testable:

- `isDraining(): boolean` — synchronous check, `false` until shutdown begins.
- `track<T>(promise: Promise<T>): Promise<T>` — registers a promise as in-flight (adds to an internal `Set`), removes it once settled (success or failure), returns the original promise untouched.
- `implements OnModuleDestroy` — Nest awaits all `onModuleDestroy` hooks across every provider before `beforeApplicationShutdown`/`onApplicationShutdown` run. On destroy: set `draining = true` synchronously, then wait for the in-flight set to drain via `Promise.allSettled([...inFlight])`, raced against a timeout.

`SlashCommandsService.listenToCommands()` changes minimally: at the top of the `InteractionCreate` handler, if `drainService.isDraining()`, reply immediately with a small "restarting" embed and return — `registry.dispatch` is never called. Otherwise, the existing dispatch logic is wrapped in `drainService.track(...)`.

`fly.toml` gets an explicit `kill_timeout = '30s'` (currently unset, so Fly's undocumented default applies) — makes the infra-level grace period explicit and gives headroom over the in-app timeout below.

## Data flow

**Normal operation:** interaction arrives → `isDraining()` is `false` → dispatch wrapped in `drainService.track(...)` → runs to completion (success, or the existing `handleCommandError` catch path on failure) → removed from the in-flight set on settle.

**Shutdown (SIGTERM/SIGINT):**
1. Nest's `enableShutdownHooks()` catches the signal.
2. Calls `onModuleDestroy()` across all providers, including `SlashCommandDrainService`.
3. `SlashCommandDrainService` sets `draining = true` immediately (synchronous), then awaits `Promise.allSettled([...inFlight])` raced against a 25s timeout.
4. Any interaction arriving during this window sees `isDraining() === true` → gets the friendly "restarting" reply, never dispatched.
5. Once all in-flight settle (or the timeout fires) → `onModuleDestroy` resolves.
6. Nest proceeds to `DiscordModule.onApplicationShutdown()` (existing `client.removeAllListeners()`).
7. Process exits via Nest's normal signal re-raise (`process.kill(process.pid, signal)`).

## Timeout

25s in-app drain timeout, hardcoded as an exported constant next to `SlashCommandDrainService` (e.g. `SHUTDOWN_DRAIN_TIMEOUT_MS = 25_000`) — not deployment-specific, so no need for env/appConfig surface. Kept a bit under `fly.toml`'s new 30s `kill_timeout` so the app controls its own exit rather than getting SIGKILLed mid-drain.

## Error handling

- **Timeout hit with commands still running:** log a warning (count of abandoned in-flight commands) and proceed with shutdown anyway — can't block forever, Fly will SIGKILL regardless of what we do.
- **A tracked command throws:** already handled by the existing try/catch in `listenToCommands` (`handleCommandError` → Sentry + user reply). `track()` relies on `allSettled` semantics so a failing command doesn't hang or fail the drain wait.
- **Rejected new interaction during drain:** logged at debug level only, not sent to Sentry — this is expected, deliberate behavior, not an error condition.

## Testing

- Unit tests for `SlashCommandDrainService`:
  - `track()` + drain resolves once the tracked count hits zero.
  - Drain resolves anyway after the timeout elapses, with a still-pending straggler promise.
  - `isDraining()` flips synchronously and immediately when `onModuleDestroy()` is invoked, before the drain wait resolves.
- Unit tests for `SlashCommandsService`:
  - While draining: friendly reply is sent, `registry.dispatch` is never called.
  - While not draining: dispatches and tracks normally (existing dispatch tests should be largely unaffected; `createAutoMock` covers the new `SlashCommandDrainService` dependency).

## Out of scope

- Draining non-slash-command event handlers (reaction listeners, jobs, etc.).
- Making the in-app timeout env-configurable.
- Any changes to `DiscordModule.onApplicationShutdown()` beyond ordering (it already runs after the drain completes, since `onModuleDestroy` hooks are awaited first).
