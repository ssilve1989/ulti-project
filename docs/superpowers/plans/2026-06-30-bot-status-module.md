# BotStatusModule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bot's single hardcoded Discord status with a job that rotates it every 6 hours through a pool of quirky messages (server-purpose lines and inside jokes about known users).

**Architecture:** A new `BotStatusJob`, added under `src/jobs/bot-status/` and wired into the existing `JobsModule`, follows the established `CronJob`/`createJob` job pattern used by `clear-checker`/`sheet-cleaner`/`invite-cleaner` — but skips the per-guild `JobCollection.enabled` gate those jobs use, since Discord presence is global to the bot client, not per-guild. A new `DiscordService.setActivity` wrapper method gives the job (and tests) a clean seam onto `client.user.setActivity`. The existing hardcoded `setActivity` call in `DiscordModule.onApplicationBootstrap` is removed once `BotStatusJob` takes over.

**Tech Stack:** NestJS (`OnApplicationBootstrap`/`OnApplicationShutdown` lifecycle hooks), `cron` package via the shared `createJob` helper, `discord.js` (`ActivityType`), Vitest.

## Global Constraints

- Status messages are a hardcoded in-code array (no Firestore/admin-editable storage).
- Rotation runs on a cron schedule, every 6 hours: cron string `'0 0 */6 * * *'` (the shared `CronTime` helper in `src/common/cron.ts` has no "every N hours" support — don't extend it for this one caller, just use the literal string with an inline comment).
- Each rotation picks a category at random with **equal weight per category** (not weighted by entry count), then a random message within that category.
- Each message entry specifies its own `ActivityType` (varies per entry — not a single fixed type for all messages).
- No per-guild gating via `JobCollection` — presence is bot-wide.
- Errors from setting the activity are caught, logged via `Logger`, and reported to `Sentry.captureException` — the job must never throw out of a tick.
- `insideJokes` category ships with placeholder content marked `// TODO:` for the user to replace with real inside jokes later.

---

### Task 1: Status message pool and picker

**Files:**
- Create: `src/jobs/bot-status/bot-status.consts.ts`
- Test: `src/jobs/bot-status/bot-status.consts.spec.ts`

**Interfaces:**
- Produces: `interface StatusMessage { type: ActivityType; name: string }`, `const STATUS_CATEGORIES: Record<'purpose' | 'insideJokes', StatusMessage[]>`, `function pickRandomStatus(): StatusMessage` — all exported from `bot-status.consts.ts`. `pickRandomStatus` is what `BotStatusJob` (Task 4) calls on every tick.

- [ ] **Step 1: Write the failing test**

Create `src/jobs/bot-status/bot-status.consts.spec.ts`:

```ts
import { ActivityType } from 'discord.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pickRandomStatus, STATUS_CATEGORIES } from './bot-status.consts.js';

describe('pickRandomStatus', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('picks the first purpose message when both random rolls are low', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0);

    const status = pickRandomStatus();

    expect(status).toEqual(STATUS_CATEGORIES.purpose[0]);
  });

  it('picks the last insideJokes message when both random rolls are high', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0.99);

    const status = pickRandomStatus();

    expect(status).toEqual(
      STATUS_CATEGORIES.insideJokes[STATUS_CATEGORIES.insideJokes.length - 1],
    );
  });

  it('always returns a message belonging to one of the known categories', () => {
    const allMessages = Object.values(STATUS_CATEGORIES).flat();

    const status = pickRandomStatus();

    expect(allMessages).toContainEqual(status);
    expect(Object.values(ActivityType)).toContain(status.type);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/jobs/bot-status/bot-status.consts.spec.ts`
Expected: FAIL — `bot-status.consts.ts` does not exist yet (module not found).

- [ ] **Step 3: Write the implementation**

Create `src/jobs/bot-status/bot-status.consts.ts`:

```ts
import { ActivityType } from 'discord.js';

export interface StatusMessage {
  type: ActivityType;
  name: string;
}

type StatusCategory = 'purpose' | 'insideJokes';

export const STATUS_CATEGORIES: Record<StatusCategory, StatusMessage[]> = {
  purpose: [
    { type: ActivityType.Watching, name: 'over signup reviews' },
    { type: ActivityType.Listening, name: 'to slash commands!' },
    { type: ActivityType.Watching, name: 'the FFLogs roll in' },
    { type: ActivityType.Playing, name: 'matchmaker for prog parties' },
  ],
  // TODO: replace these with real ulti-project / sausfest inside jokes
  insideJokes: [
    { type: ActivityType.Playing, name: "Tickling Saus's balls" },
    { type: ActivityType.Playing, name: 'hide and seek with Saus' },
    { type: ActivityType.Watching, name: 'Saus rage at a wipe' },
  ],
};

/**
 * Picks a status message at random. Each category is weighted equally
 * regardless of how many messages it contains, then a message is picked
 * at random within that category.
 */
export function pickRandomStatus(): StatusMessage {
  const categories = Object.values(STATUS_CATEGORIES);
  const category = categories[Math.floor(Math.random() * categories.length)];
  return category[Math.floor(Math.random() * category.length)];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/jobs/bot-status/bot-status.consts.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/jobs/bot-status/bot-status.consts.ts src/jobs/bot-status/bot-status.consts.spec.ts
git commit -m "feat(bot-status): add status message pool and random picker"
```

---

### Task 2: DiscordService.setActivity wrapper

**Files:**
- Modify: `src/discord/discord.service.ts`

**Interfaces:**
- Consumes: nothing new (uses `this.client`, already present on `DiscordService`).
- Produces: `DiscordService.setActivity({ type, name }: { type: ActivityType; name: string }): void` — this is what `BotStatusJob` (Task 4) and `DiscordModule` call to change bot presence.

No dedicated spec file for this task: every other thin wrapper on `DiscordService` (`getGuilds`, `getTextChannel`, etc.) is likewise exercised only indirectly through the job specs that consume it, not unit-tested in isolation — `setActivity` will be exercised the same way by `bot-status.job.spec.ts` in Task 4. This step is verified by typecheck only.

- [ ] **Step 1: Add the `ActivityType` import and `setActivity` method**

In `src/discord/discord.service.ts`, add `ActivityType` to the existing `discord.js` import (currently on lines 3-14):

```ts
import {
  ActivityType,
  Client,
  Collection,
  DiscordAPIError,
  DMChannel,
  GuildEmoji,
  type GuildMember,
  Invite,
  Message,
  PartialGroupDMChannel,
  type TextBasedChannel,
} from 'discord.js';
```

Add the new method to the `DiscordService` class, right after `getGuilds` (after line 26):

```ts
  public setActivity({
    type,
    name,
  }: {
    type: ActivityType;
    name: string;
  }): void {
    this.client.user?.setActivity({ type, name });
  }
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/discord/discord.service.ts
git commit -m "feat(discord): add DiscordService.setActivity wrapper"
```

---

### Task 3: BotStatusJob and module wiring

**Files:**
- Modify: `src/jobs/jobs.consts.ts`
- Create: `src/jobs/bot-status/bot-status.job.ts`
- Create: `src/jobs/bot-status/bot-status.module.ts`
- Test: `src/jobs/bot-status/bot-status.job.spec.ts`
- Modify: `src/jobs/jobs.module.ts`

**Interfaces:**
- Consumes: `DiscordService.setActivity` (Task 2), `pickRandomStatus` (Task 1), `createJob`/`jobDateFormatter` from `src/jobs/jobs.consts.ts`.
- Produces: `class BotStatusJob` (`Injectable`, `OnApplicationBootstrap`, `OnApplicationShutdown`), `class BotStatusModule` (`@Module`) — imported into `JobsModule` so it boots with the rest of the app.

- [ ] **Step 1: Add `'bot-status'` to the `JobType` union**

In `src/jobs/jobs.consts.ts`, change line 33 from:

```ts
export type JobType = 'clear-checker' | 'sheet-cleaner' | 'invite-cleaner';
```

to:

```ts
export type JobType =
  | 'clear-checker'
  | 'sheet-cleaner'
  | 'invite-cleaner'
  | 'bot-status';
```

- [ ] **Step 2: Write the failing test**

Create `src/jobs/bot-status/bot-status.job.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscordService } from '../../discord/discord.service.js';
import { BotStatusJob } from './bot-status.job.js';

describe('BotStatusJob', () => {
  let job: BotStatusJob;
  let discordService: DiscordService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        BotStatusJob,
        {
          provide: DiscordService,
          useValue: {
            setActivity: vi.fn(),
          },
        },
      ],
    }).compile();

    job = module.get(BotStatusJob);
    discordService = module.get(DiscordService);
  });

  describe('onApplicationBootstrap', () => {
    it('immediately sets a status drawn from the known message pool', () => {
      job.onApplicationBootstrap();

      expect(discordService.setActivity).toHaveBeenCalledTimes(1);
      expect(discordService.setActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          name: expect.any(String),
          type: expect.any(Number),
        }),
      );

      job.onApplicationShutdown();
    });
  });

  describe('error handling', () => {
    it('catches and logs errors from setActivity without throwing', () => {
      vi.spyOn(discordService, 'setActivity').mockImplementation(() => {
        throw new Error('discord unavailable');
      });

      expect(() => job.onApplicationBootstrap()).not.toThrow();

      job.onApplicationShutdown();
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run src/jobs/bot-status/bot-status.job.spec.ts`
Expected: FAIL — `bot-status.job.ts` does not exist yet (module not found).

- [ ] **Step 4: Write the implementation**

Create `src/jobs/bot-status/bot-status.job.ts`:

```ts
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { CronJob } from 'cron';
import { DiscordService } from '../../discord/discord.service.js';
import { createJob, jobDateFormatter } from '../jobs.consts.js';
import { pickRandomStatus } from './bot-status.consts.js';

// '0 0 */6 * * *' = at second 0, minute 0, every 6th hour (00:00, 06:00, 12:00, 18:00)
const EVERY_SIX_HOURS = '0 0 */6 * * *';

@Injectable()
class BotStatusJob implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(BotStatusJob.name);
  private readonly job: CronJob;

  constructor(private readonly discordService: DiscordService) {
    this.job = createJob('bot-status', {
      cronTime: EVERY_SIX_HOURS,
      onTick: () => this.rotateStatus(),
    });
  }

  onApplicationBootstrap() {
    this.rotateStatus();
    this.job.start();
    this.logger.log(
      `next status rotation scheduled for: ${jobDateFormatter.format(this.job.nextDate().toJSDate())}`,
    );
  }

  onApplicationShutdown() {
    this.job.stop();
  }

  private rotateStatus() {
    try {
      this.discordService.setActivity(pickRandomStatus());
    } catch (error: unknown) {
      Sentry.captureException(error);
      this.logger.error('bot-status job failed', error);
    }
  }
}

export { BotStatusJob };
```

Create `src/jobs/bot-status/bot-status.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { DiscordModule } from '../../discord/discord.module.js';
import { BotStatusJob } from './bot-status.job.js';

@Module({
  imports: [DiscordModule],
  providers: [BotStatusJob],
})
export class BotStatusModule {}
```

In `src/jobs/jobs.module.ts`, add the import and register it:

```ts
import { Module } from '@nestjs/common';
import { BotStatusModule } from './bot-status/bot-status.module.js';
import { ClearCheckerModule } from './clear-checker/clear-checker.module.js';
import { InviteCleanerModule } from './invite-cleaner/invite-cleaner.module.js';
import { SheetCleanerModule } from './sheet-cleaner/sheet-cleaner.module.js';

@Module({
  imports: [
    ClearCheckerModule,
    SheetCleanerModule,
    InviteCleanerModule,
    BotStatusModule,
  ],
})
export class JobsModule {}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run src/jobs/bot-status/bot-status.job.spec.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/jobs/jobs.consts.ts src/jobs/jobs.module.ts src/jobs/bot-status/bot-status.job.ts src/jobs/bot-status/bot-status.module.ts src/jobs/bot-status/bot-status.job.spec.ts
git commit -m "feat(bot-status): add BotStatusJob rotating presence every 6 hours"
```

---

### Task 4: Remove the legacy hardcoded status from DiscordModule

**Files:**
- Modify: `src/discord/discord.module.ts`

**Interfaces:**
- Consumes: nothing new — `BotStatusModule` (Task 3) now owns presence entirely.

- [ ] **Step 1: Remove the hardcoded `setActivity` call**

In `src/discord/discord.module.ts`, in `onApplicationBootstrap` (currently lines 77-90), remove the `setActivity` block but keep the `CacheSweep` subscription:

Before:

```ts
  onApplicationBootstrap() {
    this.client.user?.setActivity({
      type: ActivityType.Listening,
      name: 'Slashcommands!',
    });

    fromEvent(this.client, Events.CacheSweep).subscribe({
      next: (msg) => this.logger.log(msg),
      error: (err) => {
        Sentry.captureException(err);
        this.logger.error(err);
      },
    });
  }
```

After:

```ts
  onApplicationBootstrap() {
    fromEvent(this.client, Events.CacheSweep).subscribe({
      next: (msg) => this.logger.log(msg),
      error: (err) => {
        Sentry.captureException(err);
        this.logger.error(err);
      },
    });
  }
```

Since `ActivityType` is no longer referenced in this file, remove it from the `discord.js` import on line 8:

Before:

```ts
import { ActivityType, Client, Events, Options } from 'discord.js';
```

After:

```ts
import { Client, Events, Options } from 'discord.js';
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors (confirms `ActivityType` removal didn't leave a dangling reference).

- [ ] **Step 3: Run the full test suite**

Run: `pnpm exec vitest run`
Expected: all tests pass, including the new `bot-status.consts.spec.ts` and `bot-status.job.spec.ts`.

- [ ] **Step 4: Lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/discord/discord.module.ts
git commit -m "refactor(discord): remove static status, BotStatusModule owns presence"
```
