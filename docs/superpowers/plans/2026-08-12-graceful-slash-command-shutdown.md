# Graceful Slash Command Shutdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On SIGTERM/SIGINT, stop dispatching new slash commands (reply with a friendly "restarting" message instead) and let in-flight command handlers finish before the process exits, bounded by a timeout.

**Architecture:** A new `SlashCommandDrainService` tracks in-flight command promises in a `Set` and implements `OnModuleDestroy` to flip a `draining` flag and await the set draining (with a timeout), before Nest proceeds to the rest of the shutdown sequence. `SlashCommandsService.listenToCommands()` consults `isDraining()` before dispatching and wraps dispatch in `track()`.

**Tech Stack:** NestJS (`OnModuleDestroy` lifecycle hook, DI), discord.js (`EmbedBuilder`, `Colors`), Vitest (fake timers for the timeout test).

## Global Constraints

- Scope is slash commands only — do not touch other event subscriptions (reaction handling, jobs, etc.).
- In-app drain timeout is a hardcoded constant (`SHUTDOWN_DRAIN_TIMEOUT_MS = 25_000`), not env-configurable.
- Use the global `setTimeout` (callback-based), never `node:timers/promises`' `setTimeout` — Vitest's fake timers don't mock the `timers/promises` module (see `src/common/async-queue/async-queue.spec.ts` comment), so a promises-based timer would make the timeout test impossible to run deterministically.
- When tracking a promise, attach cleanup via `.then(onFulfilled, onRejected)` with **both** callbacks — never `.finally()`. `.finally()` returns a new derived promise; if the original rejects and nothing observes the derived one, Node emits an unhandled rejection, and `main.ts`'s `process.on('unhandledRejection', ...)` handler calls `process.exit(1)`, crashing the process on any failed slash command.
- Follow existing file conventions: `class Foo { ... }` + `export { Foo };` at the bottom (not `export class Foo`), `.js` import extensions (project uses `"module": "nodenext"`).

---

### Task 1: `SlashCommandDrainService`

**Files:**
- Create: `src/slash-commands/slash-command-drain.service.ts`
- Test: `src/slash-commands/slash-command-drain.service.spec.ts`

**Interfaces:**
- Produces: `class SlashCommandDrainService implements OnModuleDestroy` with `isDraining(): boolean`, `track<T>(promise: Promise<T>): Promise<T>`, and `onModuleDestroy(): Promise<void>`. Also exports `const SHUTDOWN_DRAIN_TIMEOUT_MS = 25_000`. Both are named exports from `./slash-command-drain.service.js`.

- [ ] **Step 1: Write the failing test**

Create `src/slash-commands/slash-command-drain.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SHUTDOWN_DRAIN_TIMEOUT_MS,
  SlashCommandDrainService,
} from './slash-command-drain.service.js';

describe('SlashCommandDrainService', () => {
  let service: SlashCommandDrainService;

  beforeEach(async () => {
    vi.useFakeTimers();

    const fixture = await Test.createTestingModule({
      providers: [SlashCommandDrainService],
    }).compile();

    service = fixture.get(SlashCommandDrainService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is not draining before shutdown begins', () => {
    expect(service.isDraining()).toBe(false);
  });

  it('flips to draining synchronously when onModuleDestroy is called', () => {
    void service.onModuleDestroy();

    expect(service.isDraining()).toBe(true);
  });

  it('resolves immediately when nothing is in flight', async () => {
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
  });

  it('waits for a tracked promise to settle before resolving', async () => {
    let resolveTask!: () => void;
    const task = new Promise<void>((resolve) => {
      resolveTask = resolve;
    });
    service.track(task);

    let destroyed = false;
    const destroyPromise = service.onModuleDestroy().then(() => {
      destroyed = true;
    });

    // let the synchronous part of onModuleDestroy run without resolving anything
    await Promise.resolve();
    await Promise.resolve();
    expect(destroyed).toBe(false);

    resolveTask();
    await destroyPromise;

    expect(destroyed).toBe(true);
  });

  it('resolves after the timeout even if a tracked promise never settles', async () => {
    const straggler = new Promise<void>(() => {
      // never resolves
    });
    service.track(straggler);

    const destroyPromise = service.onModuleDestroy();

    await vi.advanceTimersByTimeAsync(SHUTDOWN_DRAIN_TIMEOUT_MS);

    await expect(destroyPromise).resolves.toBeUndefined();
  });

  it('treats a rejected tracked promise as settled and does not throw', async () => {
    const failing = Promise.reject(new Error('boom'));
    service.track(failing).catch(() => {
      // caller is expected to handle rejection; drain must not hang or throw
    });

    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
  });

  it('removes a tracked promise from the in-flight set once it settles', async () => {
    const task = Promise.resolve('done');
    service.track(task);
    await task;

    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/slash-commands/slash-command-drain.service.spec.ts`
Expected: FAIL — `Cannot find module './slash-command-drain.service.js'` (file doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `src/slash-commands/slash-command-drain.service.ts`:

```typescript
import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';

const SHUTDOWN_DRAIN_TIMEOUT_MS = 25_000;

@Injectable()
class SlashCommandDrainService implements OnModuleDestroy {
  private readonly logger = new Logger(SlashCommandDrainService.name);
  private draining = false;
  private readonly inFlight = new Set<Promise<unknown>>();

  isDraining(): boolean {
    return this.draining;
  }

  track<T>(promise: Promise<T>): Promise<T> {
    this.inFlight.add(promise);
    const untrack = () => this.inFlight.delete(promise);
    promise.then(untrack, untrack);
    return promise;
  }

  async onModuleDestroy(): Promise<void> {
    this.draining = true;

    if (this.inFlight.size === 0) {
      return;
    }

    this.logger.log(
      `Draining ${this.inFlight.size} in-flight slash command(s)...`,
    );

    const drained = Promise.allSettled([...this.inFlight]).then(
      () => true as const,
    );
    const timedOut = new Promise<false>((resolve) => {
      setTimeout(() => resolve(false), SHUTDOWN_DRAIN_TIMEOUT_MS);
    });

    const finishedInTime = await Promise.race([drained, timedOut]);

    if (!finishedInTime) {
      this.logger.warn(
        `Shutdown drain timed out after ${SHUTDOWN_DRAIN_TIMEOUT_MS}ms with ${this.inFlight.size} command(s) still in flight`,
      );
    }
  }
}

export { SHUTDOWN_DRAIN_TIMEOUT_MS, SlashCommandDrainService };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/slash-commands/slash-command-drain.service.spec.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/slash-commands/slash-command-drain.service.ts src/slash-commands/slash-command-drain.service.spec.ts
git commit -m "feat(slash-commands): add SlashCommandDrainService for graceful shutdown"
```

---

### Task 2: Wire draining into `SlashCommandsService`

**Files:**
- Modify: `src/slash-commands/slash-commands.service.ts`
- Modify: `src/slash-commands/slash-commands.module.ts`
- Test: `src/slash-commands/slash-commands.service.spec.ts` (new file)

**Interfaces:**
- Consumes: `SlashCommandDrainService.isDraining(): boolean` and `SlashCommandDrainService.track<T>(promise: Promise<T>): Promise<T>` from Task 1.
- Produces: no new public exports — `SlashCommandsService`'s public API is unchanged. Adds a private `createRestartingEmbed(): EmbedBuilder` method.

- [ ] **Step 1: Write the failing test**

Create `src/slash-commands/slash-commands.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { ChatInputCommandInteraction, Events } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DISCORD_CLIENT } from '../discord/discord.decorators.js';
import { createAutoMock } from '../test-utils/mock-factory.js';
import { SlashCommandDrainService } from './slash-command-drain.service.js';
import { SlashCommandRegistry } from './slash-command-registry.service.js';
import { SlashCommandsService } from './slash-commands.service.js';

vi.mock('@sentry/nestjs', () => ({
  startNewTrace: (fn: () => unknown) => fn(),
  startSpanManual: (_opts: unknown, fn: (span: unknown) => unknown) =>
    fn({ setStatus: vi.fn(), end: vi.fn() }),
  withScope: (fn: (scope: unknown) => unknown) =>
    fn({ setUser: vi.fn(), setTag: vi.fn() }),
}));

describe('SlashCommandsService', () => {
  let service: SlashCommandsService;
  let client: { on: ReturnType<typeof vi.fn> };
  let registry: SlashCommandRegistry;
  let drainService: SlashCommandDrainService;

  const createInteractionMock = (
    overrides: Partial<ChatInputCommandInteraction<'cached'>> = {},
  ) =>
    ({
      isChatInputCommand: () => true,
      inGuild: () => true,
      commandName: 'test-command',
      user: { id: 'user-1', username: 'tester' },
      guildId: 'guild-1',
      deferred: false,
      replied: false,
      reply: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    }) as unknown as ChatInputCommandInteraction<'cached'>;

  beforeEach(async () => {
    client = { on: vi.fn() };

    const fixture = await Test.createTestingModule({
      providers: [SlashCommandsService],
    })
      .useMocker(createAutoMock)
      .overrideProvider(DISCORD_CLIENT)
      .useValue(client)
      .compile();

    service = fixture.get(SlashCommandsService);
    registry = fixture.get(SlashCommandRegistry);
    drainService = fixture.get(SlashCommandDrainService);
  });

  describe('listenToCommands', () => {
    const getInteractionHandler = () => {
      service.listenToCommands();
      const call = client.on.mock.calls.find(
        ([event]) => event === Events.InteractionCreate,
      ) as [string, (interaction: unknown) => unknown];
      return call[1];
    };

    it('rejects new commands with a restarting reply while draining', async () => {
      drainService.isDraining = vi.fn().mockReturnValue(true);
      const handler = getInteractionHandler();
      const interaction = createInteractionMock();

      await handler(interaction);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: [
            expect.objectContaining({
              data: expect.objectContaining({ title: 'Restarting' }),
            }),
          ],
        }),
      );
      expect(registry.dispatch).not.toHaveBeenCalled();
    });

    it('dispatches and tracks the command when not draining', async () => {
      drainService.isDraining = vi.fn().mockReturnValue(false);
      const handler = getInteractionHandler();
      const interaction = createInteractionMock();

      await handler(interaction);

      expect(registry.dispatch).toHaveBeenCalledWith(interaction);
      expect(drainService.track).toHaveBeenCalledTimes(1);
      expect(interaction.reply).not.toHaveBeenCalled();
    });

    it('ignores interactions that are not chat input commands', async () => {
      const handler = getInteractionHandler();
      const interaction = createInteractionMock({
        isChatInputCommand: () => false,
      });

      await handler(interaction);

      expect(registry.dispatch).not.toHaveBeenCalled();
      expect(drainService.track).not.toHaveBeenCalled();
    });

    it('ignores interactions that are not in a guild', async () => {
      const handler = getInteractionHandler();
      const interaction = createInteractionMock({
        inGuild: () => false,
      });

      await handler(interaction);

      expect(registry.dispatch).not.toHaveBeenCalled();
      expect(drainService.track).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/slash-commands/slash-commands.service.spec.ts`
Expected: FAIL — `drainService.isDraining` is `undefined`/not called as expected because `SlashCommandsService` doesn't consult it yet (TypeError or failed assertions on the "rejects"/"dispatches" tests).

- [ ] **Step 3: Write minimal implementation**

In `src/slash-commands/slash-commands.service.ts`, update the `discord.js` import to add `Colors` and `EmbedBuilder`:

```typescript
import {
  ChatInputCommandInteraction,
  Client,
  Colors,
  EmbedBuilder,
  Events,
  REST,
  Routes,
} from 'discord.js';
```

Add an import for the drain service, right after the `ErrorService` import:

```typescript
import { ErrorService } from '../error/error.service.js';
import { SlashCommandDrainService } from './slash-command-drain.service.js';
import { SlashCommandRegistry } from './slash-command-registry.service.js';
```

Add `drainService` to the constructor:

```typescript
  constructor(
    @InjectDiscordClient() private readonly client: Client,
    private readonly registry: SlashCommandRegistry,
    private readonly errorService: ErrorService,
    private readonly drainService: SlashCommandDrainService,
  ) {}
```

Replace the body of `listenToCommands()` so the interaction handler checks `isDraining()` before dispatching, and wraps the dispatch call in `track()`:

```typescript
  listenToCommands() {
    this.client.on(Events.InteractionCreate, (interaction) => {
      if (!(interaction.isChatInputCommand() && interaction.inGuild())) {
        return;
      }

      if (this.drainService.isDraining()) {
        this.logger.debug(
          `rejecting command during shutdown: ${interaction.commandName}`,
        );
        return safeReply(interaction, {
          embeds: [this.createRestartingEmbed()],
        });
      }

      return this.drainService.track(
        Sentry.startNewTrace(() => {
          return Sentry.startSpanManual(
            { name: interaction.commandName, op: 'command' },
            (span) => {
              return Sentry.withScope(async (scope) => {
                scope.setUser({
                  userId: interaction.user.id,
                  username: interaction.user.username,
                });

                scope.setTag('command', interaction.commandName);
                scope.setTag('guild_id', interaction.guildId);

                try {
                  this.logger.debug(
                    `dispatching command: ${interaction.commandName}`,
                  );

                  await this.registry.dispatch(
                    interaction as ChatInputCommandInteraction<'cached'>,
                  );
                  span.setStatus({ code: 1 });
                } catch (err) {
                  await this.handleCommandError(err, interaction);
                  span.setStatus({ code: 2 });
                } finally {
                  span.end();
                }
              });
            },
          );
        }),
      );
    });
  }
```

Add a new private method after `handleCommandError`, right before the closing brace of the class:

```typescript
  private createRestartingEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setColor(Colors.Blurple)
      .setTitle('Restarting')
      .setDescription(
        'The bot is restarting to deploy an update. Please try again in a few seconds.',
      )
      .setTimestamp();
  }
```

In `src/slash-commands/slash-commands.module.ts`, register the new provider — add the import and add it to the `providers` array:

```typescript
import { SlashCommandDrainService } from './slash-command-drain.service.js';
```

```typescript
  providers: [SlashCommandsService, SlashCommandRegistry, SlashCommandDrainService],
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/slash-commands/slash-commands.service.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/slash-commands/slash-commands.service.ts src/slash-commands/slash-commands.module.ts src/slash-commands/slash-commands.service.spec.ts
git commit -m "feat(slash-commands): reject new commands and drain in-flight ones on shutdown"
```

---

### Task 3: Make the Fly.io kill timeout explicit

**Files:**
- Modify: `fly.toml`

**Interfaces:**
- Consumes: none.
- Produces: none (deployment config only).

- [ ] **Step 1: Add explicit `kill_timeout` to the `[[vm]]` section**

In `fly.toml`, the current `[[vm]]` section is:

```toml
[[vm]]
cpu_kind = 'shared'
cpus = 1
memory_mb = 1024
```

Change it to:

```toml
[[vm]]
cpu_kind = 'shared'
cpus = 1
memory_mb = 1024
kill_timeout = '30s'
```

This is a config-only change; there's no test to run. `kill_timeout` gives Fly's shutdown grace period 5s of headroom over `SHUTDOWN_DRAIN_TIMEOUT_MS` (25s from Task 1), so the app controls its own exit instead of getting SIGKILLed mid-drain.

- [ ] **Step 2: Commit**

```bash
git add fly.toml
git commit -m "chore(deploy): set explicit 30s kill_timeout for graceful shutdown"
```

---

### Task 4: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test:ci`
Expected: all tests pass, including the new `slash-command-drain.service.spec.ts` and `slash-commands.service.spec.ts`.

- [ ] **Step 2: Run typecheck**

Run: `pnpm build:check`
Expected: no errors.

- [ ] **Step 3: Run lint**

Run: `pnpm exec biome check --fix .`
Expected: no errors (auto-fixes formatting/import order if needed — review any changes before the next commit).

- [ ] **Step 4: Commit any lint auto-fixes, if there were any**

```bash
git status
```

If `biome check --fix` changed anything beyond Tasks 1–3's files, review the diff, then:

```bash
git add -A
git commit -m "chore: apply biome formatting fixes"
```
