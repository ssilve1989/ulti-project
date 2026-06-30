# BotStatusModule Design

## Problem

The bot's Discord presence is currently set once, at startup, to a single
hardcoded status (`Listening to Slashcommands!`) in `discord.module.ts`. We
want it to rotate periodically through a pool of quirky/funny status
messages: some explaining what the server/bot is actually for (managing
ultimate raid signup reviews), and some inside jokes about known members of
the `sausfest` Discord.

## Architecture

A new job, `BotStatusJob`, added under `src/jobs/bot-status/` alongside the
existing `clear-checker`, `sheet-cleaner`, and `invite-cleaner` jobs, wired
into the existing `JobsModule`. It follows the established job pattern in
this codebase (`CronJob` via the shared `createJob` helper in
`jobs.consts.ts`, `OnApplicationBootstrap`/`OnApplicationShutdown` lifecycle).

Unlike the existing jobs, `BotStatusJob` does **not** check
`JobCollection`/per-guild `enabled` flags. Those jobs gate per-guild because
their side effects (cleaning invites, removing signups) are guild-scoped.
Bot presence (`client.user.setActivity`) is a single global value on the
Discord client, not a per-guild concept, so there's nothing to gate.

### Files

- `src/jobs/bot-status/bot-status.consts.ts` — status message pool, categories, and the random-pick helper
- `src/jobs/bot-status/bot-status.job.ts` — the cron job
- `src/jobs/bot-status/bot-status.module.ts` — NestJS module wiring
- `src/jobs/bot-status/bot-status.job.spec.ts` — unit tests
- `src/jobs/jobs.module.ts` — add `BotStatusModule` to imports
- `src/jobs/jobs.consts.ts` — add `'bot-status'` to the `JobType` union
- `src/discord/discord.service.ts` — add a `setActivity` wrapper method
- `src/discord/discord.module.ts` — remove the now-redundant hardcoded `setActivity` call in `onApplicationBootstrap` (the `CacheSweep` listener stays)

## Data Shape

```ts
interface StatusMessage {
  type: ActivityType; // Listening | Watching | Playing | Competing — varies per entry
  name: string;
}

const STATUS_CATEGORIES = {
  purpose: StatusMessage[],
  insideJokes: StatusMessage[],
} as const;
```

Each rotation picks a category at random with **equal weight per category**
(not weighted by entry count — so `insideJokes` having more/fewer entries
than `purpose` doesn't skew how often each category is shown), then picks a
random message within that category.

### Seed content

`purpose` (real content, ships as-is):

- `{ type: Watching, name: "over signup reviews" }`
- `{ type: Listening, name: "to slash commands!" }`
- `{ type: Watching, name: "the FFLogs roll in" }`
- `{ type: Playing, name: "matchmaker for prog parties" }`

`insideJokes` (placeholders, marked with a `// TODO:` comment for the user to
replace with real ones):

- `{ type: Playing, name: "Tickling Saus's balls" }`
- `{ type: Playing, name: "hide and seek with Saus" }`
- `{ type: Watching, name: "Saus rage at a wipe" }`

## Job Behavior

- Cron schedule: every 6 hours, via a raw cron string `'0 0 */6 * * *'`
  (the shared `CronTime` helper only supports daily/hourly/weekly/monthly
  patterns, not "every N hours" — not worth extending the shared helper for
  one caller, so this job passes the literal cron string with an inline
  comment explaining the cadence).
- `onApplicationBootstrap`: immediately sets one random status (so the bot
  isn't stuck on whatever Discord cached from last run), then starts the
  cron job for subsequent rotations.
- `onTick`: picks a new random status and calls `discordService.setActivity(...)`.
- Errors from `setActivity` (e.g. client momentarily disconnected) are
  caught, logged via `Logger`, and reported to Sentry — matching
  `clear-checker`/`sheet-cleaner`/`invite-cleaner`. The job never throws out
  of `onTick`; it just waits for the next scheduled tick.

## DiscordService Change

Add a wrapper method, consistent with the existing pattern of wrapping raw
`client` calls (`getGuilds`, `getTextChannel`, etc.):

```ts
public setActivity({ type, name }: { type: ActivityType; name: string }): void {
  this.client.user?.setActivity({ type, name });
}
```

This keeps `BotStatusJob` testable via the same `useValue: { setActivity: vi.fn() }`
mocking convention used in `invite-cleaner.job.spec.ts`.

## Testing

`bot-status.job.spec.ts`, modeled on `invite-cleaner.job.spec.ts`:

- mocks `DiscordService` with `setActivity: vi.fn()`
- `onApplicationBootstrap` calls `setActivity` once with a message drawn from
  the combined pool
- the random-pick helper, with `Math.random` stubbed, returns deterministic
  category/message selections (verifies equal category weighting and that
  picks come from the expected pool)
- a tick that throws from `setActivity` is caught and logged, not rethrown

## Out of Scope

- Firestore-backed/admin-editable message lists (explicitly rejected — hardcoded array per this design)
- Per-guild presence (not possible with the Discord API as used here; presence is bot-wide)
