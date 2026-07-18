# Settings Edit Handler De-duplication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the duplicated try/catch/error-embed shell (and, for 5 of the 7 handlers, the entire defer→read-options→upsert→reply body) currently copy-pasted across all 7 `/settings <subcommand>` edit handlers into two shared abstract base classes.

**Architecture:** Two-layer class hierarchy. `SettingsSubcommandHandler` (light) owns `deferReply` → delegate to abstract `handle()` → catch → error-embed reply, and is extended by all 7 handlers. `SettingsEditCommandHandler<TOpts>` (template method) extends the light base and implements `handle()` for the 5 handlers that share the full read-options→upsert→reply shape, deferring the varying parts to 4 abstract methods. The 2 interactive handlers (`edit-blacklist-channels`, `edit-prog-point-roles`) extend the light base directly and keep their existing component-collector bodies.

**Tech Stack:** NestJS (CQRS/DI), TypeScript strict mode (`module: nodenext`, `verbatimModuleSyntax: true`), Vitest, Biome, discord.js v14, `@sentry/nestjs`.

## Global Constraints

- Never use `as any` or unsafe type-casts — fix type errors with proper typing (discriminated unions, type guards, narrowing). This is a hard rule from the user's global instructions.
- `verbatimModuleSyntax: true` is enabled — use `import type { X }` for type-only imports, plain `import { X }` for values used at runtime (including anything referenced by a decorator, e.g. `@Inject()` property types).
- Typecheck command is `pnpm build:check` (runs `tsc -b tsconfig.typecheck.json`, verified working in this repo as of this session — ignore any note claiming this script doesn't exist).
- Lint/format: `pnpm exec biome check --fix .` to auto-fix; `pnpm lint` / `pnpm check` only report.
- Test: `pnpm vitest run <path>` for a single file; `pnpm test:ci` for the full suite with coverage.
- Existing spec files use `Test.createTestingModule({ providers: [ConcreteClass] }).useMocker(createAutoMock).compile()` — `createAutoMock` auto-mocks any dependency (constructor- or property-injected) not explicitly listed as a provider. This applies transparently to `@Inject()` property-injected fields declared on abstract base classes, the same as constructor injection.
- No test file in this codebase mocks `@sentry/nestjs`'s `Sentry.getCurrentScope()` — it's called for real in tests today (harmless no-op-ish side effect) and no existing test asserts on it. Don't introduce Sentry mocking as part of this work; stay consistent with existing convention.
- Don't commit spec/design files during brainstorming — this plan's spec is already committed as part of moving to a feature branch (see Task 0).

---

## Task 0: Create feature branch

**Files:** none (git operation only)

- [ ] **Step 1: Create and switch to a feature branch**

```bash
git checkout -b refactor/settings-handler-dedup
```

- [ ] **Step 2: Commit the design spec**

The spec at `docs/superpowers/specs/2026-07-17-settings-handler-dedup-design.md` and this plan at `docs/superpowers/plans/2026-07-17-settings-handler-dedup.md` were written to disk during brainstorming/planning but not committed (per repo convention). Commit them now that there's a feature branch:

```bash
git add docs/superpowers/specs/2026-07-17-settings-handler-dedup-design.md docs/superpowers/plans/2026-07-17-settings-handler-dedup.md
git commit -m "docs: add settings handler de-dup spec and plan"
```

---

## Task 1: Create `SettingsSubcommandHandler` base class

**Files:**
- Create: `src/slash-commands/settings/settings-subcommand.handler.ts`
- Test: `src/slash-commands/settings/settings-subcommand.handler.spec.ts`

**Interfaces:**
- Produces: `abstract class SettingsSubcommandHandler implements ISlashCommand` with:
  - `protected readonly errorService: ErrorService` (property-injected via `@Inject()`)
  - `protected readonly settingsCollection: SettingsCollection` (property-injected via `@Inject()`)
  - `protected abstract handle(interaction: ChatInputCommandInteraction<'cached'>): Promise<void>`
  - `protected errorReplyExtras(): Record<string, unknown>` — overridable, defaults to `{}`
  - `async execute(interaction: ChatInputCommandInteraction<'cached'>): Promise<void>` — concrete, decorated `@SentryTraced()`

- [ ] **Step 1: Write the failing spec**

Create `src/slash-commands/settings/settings-subcommand.handler.spec.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { ErrorService } from '../../error/error.service.js';
import { createAutoMock } from '../../test-utils/mock-factory.js';
import { SettingsSubcommandHandler } from './settings-subcommand.handler.js';

@Injectable()
class TestHandler extends SettingsSubcommandHandler {
  handleImpl = vi.fn().mockResolvedValue(undefined);
  extrasImpl = vi.fn().mockReturnValue({});

  protected handle(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    return this.handleImpl(interaction);
  }

  protected override errorReplyExtras(): Record<string, unknown> {
    return this.extrasImpl();
  }
}

describe('SettingsSubcommandHandler', () => {
  let handler: TestHandler;
  let errorService: Mocked<ErrorService>;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [TestHandler],
    })
      .useMocker(createAutoMock)
      .compile();

    handler = fixture.get(TestHandler);
    errorService = fixture.get(ErrorService);
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });

  it('defers the reply before delegating to handle()', async () => {
    const interaction = {
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    await handler.execute(interaction);

    expect(interaction.deferReply).toHaveBeenCalledWith({
      flags: MessageFlags.Ephemeral,
    });
    expect(handler.handleImpl).toHaveBeenCalledWith(interaction);
  });

  it('replies with an error embed when handle() throws', async () => {
    const error = new Error('boom');
    const mockErrorEmbed = {} as EmbedBuilder;
    handler.handleImpl.mockRejectedValueOnce(error);
    errorService.handleCommandError.mockReturnValue(mockErrorEmbed);

    const interaction = {
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    await handler.execute(interaction);

    expect(errorService.handleCommandError).toHaveBeenCalledWith(
      error,
      interaction,
    );
    expect(interaction.editReply).toHaveBeenCalledWith({
      embeds: [mockErrorEmbed],
    });
  });

  it('merges errorReplyExtras() into the failure reply', async () => {
    const error = new Error('boom');
    const mockErrorEmbed = {} as EmbedBuilder;
    handler.handleImpl.mockRejectedValueOnce(error);
    handler.extrasImpl.mockReturnValue({ components: [] });
    errorService.handleCommandError.mockReturnValue(mockErrorEmbed);

    const interaction = {
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    await handler.execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith({
      embeds: [mockErrorEmbed],
      components: [],
    });
  });
});
```

- [ ] **Step 2: Run the spec to verify it fails**

Run: `pnpm vitest run src/slash-commands/settings/settings-subcommand.handler.spec.ts`
Expected: FAIL — cannot resolve `./settings-subcommand.handler.js` (module does not exist yet).

- [ ] **Step 3: Implement `SettingsSubcommandHandler`**

Create `src/slash-commands/settings/settings-subcommand.handler.ts`:

```typescript
import { Inject } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import type { ChatInputCommandInteraction } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { ErrorService } from '../../error/error.service.js';
import { SettingsCollection } from '../../firebase/collections/settings-collection.js';
import type { ISlashCommand } from '../slash-command.interface.js';

export abstract class SettingsSubcommandHandler implements ISlashCommand {
  @Inject() protected readonly errorService!: ErrorService;
  @Inject() protected readonly settingsCollection!: SettingsCollection;

  protected abstract handle(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void>;

  /**
   * Extra fields merged into the failure reply, e.g. `{ components: [] }`
   * to clear an interactive component on error. Defaults to nothing extra.
   */
  protected errorReplyExtras(): Record<string, unknown> {
    return {};
  }

  @SentryTraced()
  async execute(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await this.handle(interaction);
    } catch (error) {
      const errorEmbed = this.errorService.handleCommandError(
        error,
        interaction,
      );
      await interaction.editReply({
        embeds: [errorEmbed],
        ...this.errorReplyExtras(),
      });
    }
  }
}
```

- [ ] **Step 4: Run the spec to verify it passes**

Run: `pnpm vitest run src/slash-commands/settings/settings-subcommand.handler.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Typecheck**

Run: `pnpm build:check`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/slash-commands/settings/settings-subcommand.handler.ts src/slash-commands/settings/settings-subcommand.handler.spec.ts
git commit -m "feat(settings): add SettingsSubcommandHandler base class"
```

---

## Task 2: Create `SettingsEditCommandHandler<TOpts>` template-method base class

**Files:**
- Create: `src/slash-commands/settings/settings-edit-command.handler.ts`
- Test: `src/slash-commands/settings/settings-edit-command.handler.spec.ts`

**Interfaces:**
- Consumes: `SettingsSubcommandHandler` (Task 1) — inherits `errorService`, `settingsCollection`, `execute()`, `errorReplyExtras()`.
- Produces: `abstract class SettingsEditCommandHandler<TOpts> extends SettingsSubcommandHandler` with abstract methods `readOptions(interaction): TOpts`, `scopeContext(opts: TOpts): { name: string; context: Record<string, unknown> }`, `buildPatch(opts: TOpts, existing: SettingsDocument | undefined): Partial<SettingsDocument>`, `successMessage(opts: TOpts): string`, and a concrete `protected async handle(interaction)` implementing the template method.

- [ ] **Step 1: Write the failing spec**

Create `src/slash-commands/settings/settings-edit-command.handler.spec.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { ChatInputCommandInteraction } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { SettingsCollection } from '../../firebase/collections/settings-collection.js';
import type { SettingsDocument } from '../../firebase/models/settings.model.js';
import { createAutoMock } from '../../test-utils/mock-factory.js';
import { SettingsEditCommandHandler } from './settings-edit-command.handler.js';

interface TestOpts {
  value: string;
}

@Injectable()
class TestEditHandler extends SettingsEditCommandHandler<TestOpts> {
  readOptionsImpl = vi.fn<() => TestOpts>().mockReturnValue({
    value: 'from-options',
  });
  scopeContextImpl = vi.fn((opts: TestOpts) => ({
    name: 'test_update',
    context: { value: opts.value },
  }));
  buildPatchImpl = vi.fn(
    (opts: TestOpts, existing: SettingsDocument | undefined) => ({
      spreadsheetId: `${existing?.spreadsheetId ?? ''}${opts.value}`,
    }),
  );
  successMessageImpl = vi.fn((opts: TestOpts) => `updated: ${opts.value}`);

  protected readOptions(): TestOpts {
    return this.readOptionsImpl();
  }

  protected scopeContext(opts: TestOpts) {
    return this.scopeContextImpl(opts);
  }

  protected buildPatch(
    opts: TestOpts,
    existing: SettingsDocument | undefined,
  ) {
    return this.buildPatchImpl(opts, existing);
  }

  protected successMessage(opts: TestOpts): string {
    return this.successMessageImpl(opts);
  }
}

describe('SettingsEditCommandHandler', () => {
  let handler: TestEditHandler;
  let settingsCollection: Mocked<SettingsCollection>;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [TestEditHandler],
    })
      .useMocker(createAutoMock)
      .compile();

    handler = fixture.get(TestEditHandler);
    settingsCollection = fixture.get(SettingsCollection);
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });

  it('merges existing settings with buildPatch() and upserts', async () => {
    const guildId = 'guild-1';
    settingsCollection.getSettings.mockResolvedValueOnce({
      spreadsheetId: 'existing-',
      reviewChannel: 'chan-1',
    });

    const interaction = {
      guildId,
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    await handler.execute(interaction);

    expect(settingsCollection.upsert).toHaveBeenCalledWith(guildId, {
      spreadsheetId: 'existing-from-options',
      reviewChannel: 'chan-1',
    });
  });

  it('calls readOptions -> scopeContext -> buildPatch -> successMessage with consistent opts', async () => {
    settingsCollection.getSettings.mockResolvedValueOnce({
      spreadsheetId: 'existing-',
    });

    const interaction = {
      guildId: 'guild-1',
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    await handler.execute(interaction);

    const opts = { value: 'from-options' };
    expect(handler.scopeContextImpl).toHaveBeenCalledWith(opts);
    expect(handler.buildPatchImpl).toHaveBeenCalledWith(opts, {
      spreadsheetId: 'existing-',
    });
    expect(handler.successMessageImpl).toHaveBeenCalledWith(opts);
  });

  it('replies with successMessage() after upserting', async () => {
    settingsCollection.getSettings.mockResolvedValueOnce(undefined);

    const interaction = {
      guildId: 'guild-1',
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    await handler.execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      'updated: from-options',
    );
  });
});
```

- [ ] **Step 2: Run the spec to verify it fails**

Run: `pnpm vitest run src/slash-commands/settings/settings-edit-command.handler.spec.ts`
Expected: FAIL — cannot resolve `./settings-edit-command.handler.js`.

- [ ] **Step 3: Implement `SettingsEditCommandHandler<TOpts>`**

Create `src/slash-commands/settings/settings-edit-command.handler.ts`:

```typescript
import * as Sentry from '@sentry/nestjs';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { SettingsDocument } from '../../firebase/models/settings.model.js';
import { SettingsSubcommandHandler } from './settings-subcommand.handler.js';

export abstract class SettingsEditCommandHandler<
  TOpts,
> extends SettingsSubcommandHandler {
  protected abstract readOptions(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): TOpts;

  protected abstract scopeContext(opts: TOpts): {
    name: string;
    context: Record<string, unknown>;
  };

  protected abstract buildPatch(
    opts: TOpts,
    existing: SettingsDocument | undefined,
  ): Partial<SettingsDocument>;

  protected abstract successMessage(opts: TOpts): string;

  protected async handle(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    const opts = this.readOptions(interaction);
    const { name, context } = this.scopeContext(opts);
    Sentry.getCurrentScope().setContext(name, context);

    const settings = await this.settingsCollection.getSettings(
      interaction.guildId,
    );

    await this.settingsCollection.upsert(interaction.guildId, {
      ...settings,
      ...this.buildPatch(opts, settings),
    });

    await interaction.editReply(this.successMessage(opts));
  }
}
```

- [ ] **Step 4: Run the spec to verify it passes**

Run: `pnpm vitest run src/slash-commands/settings/settings-edit-command.handler.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Typecheck**

Run: `pnpm build:check`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/slash-commands/settings/settings-edit-command.handler.ts src/slash-commands/settings/settings-edit-command.handler.spec.ts
git commit -m "feat(settings): add SettingsEditCommandHandler template-method base class"
```

---

## Task 3: Migrate `EditReviewerCommandHandler`

**Files:**
- Modify: `src/slash-commands/settings/subcommands/reviewer/edit-reviewer.command-handler.ts`
- Test (unmodified, regression check): `src/slash-commands/settings/subcommands/reviewer/edit-reviewer.command-handler.spec.ts`

**Interfaces:**
- Consumes: `SettingsEditCommandHandler<TOpts>` (Task 2)

- [ ] **Step 1: Replace the handler implementation**

Replace the full contents of `src/slash-commands/settings/subcommands/reviewer/edit-reviewer.command-handler.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import type { ChatInputCommandInteraction, Role } from 'discord.js';
import { SlashCommand } from '../../../slash-command.decorator.js';
import { SettingsEditCommandHandler } from '../../settings-edit-command.handler.js';
import { SettingsSlashCommand } from '../../settings.slash-command.js';

interface ReviewerOptions {
  role: Role;
}

@Injectable()
@SlashCommand({ builder: SettingsSlashCommand, subcommand: 'reviewer' })
class EditReviewerCommandHandler extends SettingsEditCommandHandler<ReviewerOptions> {
  protected readOptions(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): ReviewerOptions {
    return { role: interaction.options.getRole('reviewer-role', true) };
  }

  protected scopeContext({ role }: ReviewerOptions) {
    return {
      name: 'reviewer_update',
      context: { roleId: role.id, roleName: role.name },
    };
  }

  protected buildPatch({ role }: ReviewerOptions) {
    return { reviewerRole: role.id };
  }

  protected successMessage(): string {
    return 'Reviewer role updated!';
  }
}

export { EditReviewerCommandHandler };
```

- [ ] **Step 2: Run the existing spec unmodified to confirm the refactor preserved behavior**

Run: `pnpm vitest run src/slash-commands/settings/subcommands/reviewer/edit-reviewer.command-handler.spec.ts`
Expected: PASS (3 tests) — same file, no edits, still green against the new implementation.

- [ ] **Step 3: Typecheck**

Run: `pnpm build:check`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/slash-commands/settings/subcommands/reviewer/edit-reviewer.command-handler.ts
git commit -m "refactor(settings): migrate EditReviewerCommandHandler to SettingsEditCommandHandler"
```

---

## Task 4: Migrate `EditSpreadsheetCommandHandler`

**Files:**
- Modify: `src/slash-commands/settings/subcommands/spreadsheet/edit-spreadsheet.command-handler.ts`
- Test (unmodified, regression check): `src/slash-commands/settings/subcommands/spreadsheet/edit-spreadsheet.command-handler.spec.ts`

**Interfaces:**
- Consumes: `SettingsEditCommandHandler<TOpts>` (Task 2)

- [ ] **Step 1: Replace the handler implementation**

Replace the full contents of `src/slash-commands/settings/subcommands/spreadsheet/edit-spreadsheet.command-handler.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import type { ChatInputCommandInteraction } from 'discord.js';
import { SlashCommand } from '../../../slash-command.decorator.js';
import { SettingsEditCommandHandler } from '../../settings-edit-command.handler.js';
import { SettingsSlashCommand } from '../../settings.slash-command.js';

interface SpreadsheetOptions {
  spreadsheetId: string;
}

@Injectable()
@SlashCommand({ builder: SettingsSlashCommand, subcommand: 'spreadsheet' })
class EditSpreadsheetCommandHandler extends SettingsEditCommandHandler<SpreadsheetOptions> {
  protected readOptions(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): SpreadsheetOptions {
    return {
      spreadsheetId: interaction.options.getString('spreadsheet-id', true),
    };
  }

  protected scopeContext({ spreadsheetId }: SpreadsheetOptions) {
    return { name: 'spreadsheet_update', context: { spreadsheetId } };
  }

  protected buildPatch({ spreadsheetId }: SpreadsheetOptions) {
    return { spreadsheetId };
  }

  protected successMessage(): string {
    return 'Spreadsheet settings updated!';
  }
}

export { EditSpreadsheetCommandHandler };
```

- [ ] **Step 2: Run the existing spec unmodified**

Run: `pnpm vitest run src/slash-commands/settings/subcommands/spreadsheet/edit-spreadsheet.command-handler.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 3: Typecheck**

Run: `pnpm build:check`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/slash-commands/settings/subcommands/spreadsheet/edit-spreadsheet.command-handler.ts
git commit -m "refactor(settings): migrate EditSpreadsheetCommandHandler to SettingsEditCommandHandler"
```

---

## Task 5: Migrate `EditChannelsCommandHandler`

**Files:**
- Modify: `src/slash-commands/settings/subcommands/channels/edit-channels.command-handler.ts`
- Test (unmodified, regression check): `src/slash-commands/settings/subcommands/channels/edit-channels.command-handler.spec.ts`

**Interfaces:**
- Consumes: `SettingsEditCommandHandler<TOpts>` (Task 2)

- [ ] **Step 1: Replace the handler implementation**

Replace the full contents of `src/slash-commands/settings/subcommands/channels/edit-channels.command-handler.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import type { ChatInputCommandInteraction } from 'discord.js';
import { SlashCommand } from '../../../slash-command.decorator.js';
import { SettingsEditCommandHandler } from '../../settings-edit-command.handler.js';
import { SettingsSlashCommand } from '../../settings.slash-command.js';

interface ChannelsOptions {
  reviewChannelId: string | undefined;
  signupChannelId: string | undefined;
  autoModChannelId: string | undefined;
}

@Injectable()
@SlashCommand({ builder: SettingsSlashCommand, subcommand: 'channels' })
class EditChannelsCommandHandler extends SettingsEditCommandHandler<ChannelsOptions> {
  protected readOptions(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): ChannelsOptions {
    return {
      reviewChannelId: interaction.options.getChannel('signup-review-channel')
        ?.id,
      signupChannelId: interaction.options.getChannel('signup-public-channel')
        ?.id,
      autoModChannelId: interaction.options.getChannel('moderation-channel')
        ?.id,
    };
  }

  protected scopeContext({
    reviewChannelId,
    signupChannelId,
    autoModChannelId,
  }: ChannelsOptions) {
    return {
      name: 'channel_update',
      context: {
        hasReviewChannel: !!reviewChannelId,
        hasSignupChannel: !!signupChannelId,
        hasAutoModChannel: !!autoModChannelId,
      },
    };
  }

  protected buildPatch({
    reviewChannelId,
    signupChannelId,
    autoModChannelId,
  }: ChannelsOptions) {
    return {
      reviewChannel: reviewChannelId,
      signupChannel: signupChannelId,
      autoModChannelId,
    };
  }

  protected successMessage(): string {
    return 'Channel settings updated!';
  }
}

export { EditChannelsCommandHandler };
```

- [ ] **Step 2: Run the existing spec unmodified**

Run: `pnpm vitest run src/slash-commands/settings/subcommands/channels/edit-channels.command-handler.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 3: Typecheck**

Run: `pnpm build:check`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/slash-commands/settings/subcommands/channels/edit-channels.command-handler.ts
git commit -m "refactor(settings): migrate EditChannelsCommandHandler to SettingsEditCommandHandler"
```

---

## Task 6: Migrate `EditTurboProgCommandHandler`

**Files:**
- Modify: `src/slash-commands/settings/subcommands/turbo-prog/edit-turbo-prog.command-handler.ts`
- Test (unmodified, regression check): `src/slash-commands/settings/subcommands/turbo-prog/edit-turbo-prog.command-handler.spec.ts`

**Interfaces:**
- Consumes: `SettingsEditCommandHandler<TOpts>` (Task 2)

- [ ] **Step 1: Replace the handler implementation**

Replace the full contents of `src/slash-commands/settings/subcommands/turbo-prog/edit-turbo-prog.command-handler.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import type { ChatInputCommandInteraction } from 'discord.js';
import { SlashCommand } from '../../../slash-command.decorator.js';
import { SettingsEditCommandHandler } from '../../settings-edit-command.handler.js';
import { SettingsSlashCommand } from '../../settings.slash-command.js';

interface TurboProgOptions {
  active: boolean;
  spreadsheetId: string | null;
}

@Injectable()
@SlashCommand({ builder: SettingsSlashCommand, subcommand: 'turbo-prog' })
class EditTurboProgCommandHandler extends SettingsEditCommandHandler<TurboProgOptions> {
  protected readOptions(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): TurboProgOptions {
    return {
      active: interaction.options.getBoolean('active', true),
      spreadsheetId: interaction.options.getString('spreadsheet-id'),
    };
  }

  protected scopeContext({ active, spreadsheetId }: TurboProgOptions) {
    return {
      name: 'turbo_prog_update',
      context: {
        active,
        hasSpreadsheetId: !!spreadsheetId,
        spreadsheetId,
      },
    };
  }

  protected buildPatch({ active, spreadsheetId }: TurboProgOptions) {
    return {
      turboProgActive: active,
      turboProgSpreadsheetId: spreadsheetId ?? undefined,
    };
  }

  protected successMessage(): string {
    return 'Turbo prog settings updated!';
  }
}

export { EditTurboProgCommandHandler };
```

- [ ] **Step 2: Run the existing spec unmodified**

Run: `pnpm vitest run src/slash-commands/settings/subcommands/turbo-prog/edit-turbo-prog.command-handler.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 3: Typecheck**

Run: `pnpm build:check`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/slash-commands/settings/subcommands/turbo-prog/edit-turbo-prog.command-handler.ts
git commit -m "refactor(settings): migrate EditTurboProgCommandHandler to SettingsEditCommandHandler"
```

---

## Task 7: Migrate `EditEncounterRolesCommandHandler`

**Files:**
- Modify: `src/slash-commands/settings/subcommands/roles/edit-encounter-roles.command-handler.ts`
- Test (unmodified, regression check): `src/slash-commands/settings/subcommands/roles/edit-encounter-roles.command-handler.spec.ts`

**Interfaces:**
- Consumes: `SettingsEditCommandHandler<TOpts>` (Task 2)

This is the one simple handler whose `buildPatch` needs the `existing` settings parameter (nested merge into `progRoles`/`clearRoles` so other encounters' role mappings aren't wiped).

- [ ] **Step 1: Replace the handler implementation**

Replace the full contents of `src/slash-commands/settings/subcommands/roles/edit-encounter-roles.command-handler.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import type { ChatInputCommandInteraction, Role } from 'discord.js';
import type { SettingsDocument } from '../../../../firebase/models/settings.model.js';
import { SlashCommand } from '../../../slash-command.decorator.js';
import { SettingsEditCommandHandler } from '../../settings-edit-command.handler.js';
import { SettingsSlashCommand } from '../../settings.slash-command.js';

interface EncounterRolesOptions {
  encounter: string;
  progRole: Role;
  clearRole: Role;
}

@Injectable()
@SlashCommand({ builder: SettingsSlashCommand, subcommand: 'encounter-roles' })
class EditEncounterRolesCommandHandler extends SettingsEditCommandHandler<EncounterRolesOptions> {
  protected readOptions(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): EncounterRolesOptions {
    return {
      encounter: interaction.options.getString('encounter', true),
      progRole: interaction.options.getRole('prog-role', true),
      clearRole: interaction.options.getRole('clear-role', true),
    };
  }

  protected scopeContext({
    encounter,
    progRole,
    clearRole,
  }: EncounterRolesOptions) {
    return {
      name: 'encounter_roles_update',
      context: {
        encounter,
        progRoleId: progRole.id,
        progRoleName: progRole.name,
        clearRoleId: clearRole.id,
        clearRoleName: clearRole.name,
      },
    };
  }

  protected buildPatch(
    { encounter, progRole, clearRole }: EncounterRolesOptions,
    existing: SettingsDocument | undefined,
  ) {
    return {
      progRoles: { ...existing?.progRoles, [encounter]: progRole.id },
      clearRoles: { ...existing?.clearRoles, [encounter]: clearRole.id },
    };
  }

  protected successMessage(): string {
    return 'Encounter roles updated!';
  }
}

export { EditEncounterRolesCommandHandler };
```

- [ ] **Step 2: Run the existing spec unmodified**

Run: `pnpm vitest run src/slash-commands/settings/subcommands/roles/edit-encounter-roles.command-handler.spec.ts`
Expected: PASS (2 tests)

- [ ] **Step 3: Typecheck**

Run: `pnpm build:check`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/slash-commands/settings/subcommands/roles/edit-encounter-roles.command-handler.ts
git commit -m "refactor(settings): migrate EditEncounterRolesCommandHandler to SettingsEditCommandHandler"
```

---

## Task 8: Migrate `EditBlacklistChannelsCommandHandler`

**Files:**
- Modify: `src/slash-commands/settings/subcommands/blacklist-channels/edit-blacklist-channels.command-handler.ts`
- Test (unmodified, regression check): `src/slash-commands/settings/subcommands/blacklist-channels/edit-blacklist-channels.command-handler.spec.ts`

**Interfaces:**
- Consumes: `SettingsSubcommandHandler` (Task 1) — extends this directly, not `SettingsEditCommandHandler`, since this handler's body is an interactive component-collector flow, not the simple read/upsert/reply shape.

This handler keeps almost its entire body. Only the constructor (no longer needed — `settingsCollection`/`errorService` are inherited) and the outer `deferReply`/try/catch/error-embed wrapper are removed.

- [ ] **Step 1: Replace the handler implementation**

Replace the full contents of `src/slash-commands/settings/subcommands/blacklist-channels/edit-blacklist-channels.command-handler.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import type { ChatInputCommandInteraction } from 'discord.js';
import { channelMention } from 'discord.js';
import { isSameUserFilter } from '../../../../common/collection-filters.js';
import { getBlacklistChannelIds } from '../../../../firebase/models/settings.model.js';
import { SlashCommand } from '../../../slash-command.decorator.js';
import { SettingsSubcommandHandler } from '../../settings-subcommand.handler.js';
import { SettingsSlashCommand } from '../../settings.slash-command.js';
import {
  BLACKLIST_CHANNELS_SELECT_ID,
  createBlacklistChannelsSelectRow,
} from './blacklist-channels.components.js';

const INSTRUCTIONS =
  'Select the channels that should receive blacklist notifications. Your selection replaces the current list; submit an empty selection to disable notifications.';

@Injectable()
@SlashCommand({
  builder: SettingsSlashCommand,
  subcommand: 'blacklist-channels',
})
class EditBlacklistChannelsCommandHandler extends SettingsSubcommandHandler {
  private readonly logger = new Logger(
    EditBlacklistChannelsCommandHandler.name,
  );

  protected async handle(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    const settings = await this.settingsCollection.getSettings(
      interaction.guildId,
    );

    const replyMessage = await interaction.editReply({
      content: INSTRUCTIONS,
      components: [
        createBlacklistChannelsSelectRow(getBlacklistChannelIds(settings)),
      ],
    });

    const collector = replyMessage.createMessageComponentCollector({
      filter: isSameUserFilter(interaction.user),
      time: 300000, // 5 minutes timeout
    });

    // a rejection escaping this listener would hit the process-level
    // unhandledRejection handler in main.ts and take the bot down
    collector.on('collect', async (i) => {
      try {
        if (
          i.customId !== BLACKLIST_CHANNELS_SELECT_ID ||
          !i.isChannelSelectMenu()
        ) {
          return;
        }

        await i.deferUpdate();

        const blacklistChannelIds = i.values;

        await this.settingsCollection.upsert(interaction.guildId, {
          blacklistChannelIds,
        });

        const confirmation =
          blacklistChannelIds.length > 0
            ? `Saved! Blacklist notifications will be sent to: ${blacklistChannelIds
                .map(channelMention)
                .join(', ')}`
            : 'Saved! Blacklist notifications are now disabled.';

        await i.editReply({
          content: `${INSTRUCTIONS}\n\n${confirmation}`,
          components: [createBlacklistChannelsSelectRow(blacklistChannelIds)],
        });
      } catch (error) {
        this.logger.error('Failed to update blacklist channels', error);
        this.errorService.captureError(error);
      }
    });

    collector.on('end', async () => {
      try {
        await interaction.editReply({
          content:
            'This menu has expired. Run /settings blacklist-channels again if needed.',
          components: [],
        });
      } catch (error) {
        this.logger.error(
          'Failed to update expired blacklist channels menu',
          error,
        );
      }
    });
  }
}

export { EditBlacklistChannelsCommandHandler };
```

- [ ] **Step 2: Run the existing spec unmodified**

Run: `pnpm vitest run src/slash-commands/settings/subcommands/blacklist-channels/edit-blacklist-channels.command-handler.spec.ts`
Expected: PASS (10 tests)

- [ ] **Step 3: Typecheck**

Run: `pnpm build:check`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/slash-commands/settings/subcommands/blacklist-channels/edit-blacklist-channels.command-handler.ts
git commit -m "refactor(settings): migrate EditBlacklistChannelsCommandHandler to SettingsSubcommandHandler"
```

---

## Task 9: Migrate `EditProgPointRolesCommandHandler`

**Files:**
- Modify: `src/slash-commands/settings/subcommands/prog-point-roles/edit-prog-point-roles.command-handler.ts`
- Modify (add error-path test): `src/slash-commands/settings/subcommands/prog-point-roles/edit-prog-point-roles.command-handler.spec.ts`

**Interfaces:**
- Consumes: `SettingsSubcommandHandler` (Task 1) — extends this directly, and overrides `errorReplyExtras()` to return `{ components: [] }`, preserving this handler's current behavior of clearing the select menu on error.

This handler needs its own constructor for `EncountersComponentsService` (not provided by the base class), but no longer needs `settingsCollection` or `errorService` as constructor params.

The **existing spec has no test for the error path** (`errorService` isn't even injected/asserted in the current spec file) — this task adds one, since the refactor introduces `errorReplyExtras()` as new, real behavior-preserving logic that deserves its own coverage.

- [ ] **Step 1: Replace the handler implementation**

Replace the full contents of `src/slash-commands/settings/subcommands/prog-point-roles/edit-prog-point-roles.command-handler.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import type {
  ChatInputCommandInteraction,
  StringSelectMenuBuilder,
} from 'discord.js';
import { ActionRowBuilder, roleMention } from 'discord.js';
import { isSameUserFilter } from '../../../../common/collection-filters.js';
import { isEncounter } from '../../../../encounters/encounters.consts.js';
import { EncountersComponentsService } from '../../../../encounters/encounters-components.service.js';
import { SlashCommand } from '../../../slash-command.decorator.js';
import { SettingsSubcommandHandler } from '../../settings-subcommand.handler.js';
import { SettingsSlashCommand } from '../../settings.slash-command.js';

export const PROG_POINT_ROLES_SELECT_ID = 'progPointRolesSelect';

@Injectable()
@SlashCommand({ builder: SettingsSlashCommand, subcommand: 'prog-point-roles' })
class EditProgPointRolesCommandHandler extends SettingsSubcommandHandler {
  constructor(
    private readonly encountersComponentsService: EncountersComponentsService,
  ) {
    super();
  }

  // awaitMessageComponent rejecting on timeout also reaches this base
  // class's catch, which is why the select menu is cleared here too.
  protected override errorReplyExtras() {
    return { components: [] };
  }

  protected async handle(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    const encounter = interaction.options.getString('encounter', true);
    const role = interaction.options.getRole('role');

    if (!isEncounter(encounter)) {
      await interaction.editReply(`Unknown encounter: ${encounter}`);
      return;
    }

    const menu =
      await this.encountersComponentsService.createProgPointSelectMenu(
        encounter,
        {
          customId: PROG_POINT_ROLES_SELECT_ID,
          includeCleared: false,
          multiSelect: true,
        },
      );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      menu,
    );

    const message = await interaction.editReply({
      content: role
        ? `Select the prog points that should assign ${roleMention(role.id)}`
        : 'Select the prog points whose role mappings should be removed',
      components: [row],
    });

    const selection = await message.awaitMessageComponent({
      time: 60_000 * 2, // 2 minutes
      filter: isSameUserFilter(interaction.user),
    });

    if (
      selection.customId !== PROG_POINT_ROLES_SELECT_ID ||
      !selection.isStringSelectMenu()
    ) {
      return;
    }

    const settings = await this.settingsCollection.getSettings(
      interaction.guildId,
    );

    const progPointRoles = { ...settings?.progPointRoles?.[encounter] };

    for (const progPointId of selection.values) {
      if (role) {
        progPointRoles[progPointId] = role.id;
      } else {
        delete progPointRoles[progPointId];
      }
    }

    await this.settingsCollection.setProgPointRoles(
      interaction.guildId,
      encounter,
      progPointRoles,
    );

    await selection.update({
      content: role
        ? `Mapped ${selection.values.length} prog point(s) to ${roleMention(role.id)}`
        : `Removed mappings for ${selection.values.length} prog point(s)`,
      components: [],
    });
  }
}

export { EditProgPointRolesCommandHandler };
```

- [ ] **Step 2: Run the existing spec unmodified to confirm the refactor preserved behavior**

Run: `pnpm vitest run src/slash-commands/settings/subcommands/prog-point-roles/edit-prog-point-roles.command-handler.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 3: Add the error-path test (new coverage)**

Add `ErrorService` to the spec's imports and fixture setup, and add a new `it` block. Replace the full contents of `src/slash-commands/settings/subcommands/prog-point-roles/edit-prog-point-roles.command-handler.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import type {
  ChatInputCommandInteraction,
  EmbedBuilder,
  Message,
  Role,
} from 'discord.js';
import { StringSelectMenuBuilder } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { Encounter } from '../../../../encounters/encounters.consts.js';
import { EncountersComponentsService } from '../../../../encounters/encounters-components.service.js';
import { ErrorService } from '../../../../error/error.service.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { createAutoMock } from '../../../../test-utils/mock-factory.js';
import {
  EditProgPointRolesCommandHandler,
  PROG_POINT_ROLES_SELECT_ID,
} from './edit-prog-point-roles.command-handler.js';

describe('EditProgPointRolesCommandHandler', () => {
  let command: EditProgPointRolesCommandHandler;
  let settingsCollection: Mocked<SettingsCollection>;
  let encountersComponentsService: Mocked<EncountersComponentsService>;
  let errorService: Mocked<ErrorService>;

  const guildId = 'guild-123';
  const roleId = 'role-456';

  const createSelection = (values: string[]) => ({
    customId: PROG_POINT_ROLES_SELECT_ID,
    isStringSelectMenu: () => true,
    values,
    update: vi.fn().mockResolvedValue(undefined),
  });

  const createInteraction = (options: {
    role: Role | null;
    selection: ReturnType<typeof createSelection>;
  }) => {
    const message = {
      awaitMessageComponent: vi.fn().mockResolvedValue(options.selection),
    } as unknown as Message<true>;

    return {
      guildId,
      user: { id: 'admin-1' },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(message),
      options: {
        getString: vi.fn().mockReturnValue(Encounter.TOP),
        getRole: vi.fn().mockReturnValue(options.role),
      },
    } as unknown as ChatInputCommandInteraction<'cached'>;
  };

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [EditProgPointRolesCommandHandler],
    })
      .useMocker(createAutoMock)
      .compile();

    command = fixture.get(EditProgPointRolesCommandHandler);
    settingsCollection = fixture.get(SettingsCollection);
    encountersComponentsService = fixture.get(EncountersComponentsService);
    errorService = fixture.get(ErrorService);

    encountersComponentsService.createProgPointSelectMenu.mockResolvedValue(
      new StringSelectMenuBuilder()
        .setCustomId(PROG_POINT_ROLES_SELECT_ID)
        .addOptions([{ label: 'Phase 1', value: 'P1' }]),
    );
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('maps the selected prog points to the given role', async () => {
    const role = { id: roleId } as unknown as Role;
    const selection = createSelection(['P1', 'P2']);

    settingsCollection.getSettings.mockResolvedValue({
      progPointRoles: { [Encounter.TOP]: { P1: 'old-role', P3: 'role-p3' } },
    });

    await command.execute(createInteraction({ role, selection }));

    expect(settingsCollection.setProgPointRoles).toHaveBeenCalledWith(
      guildId,
      Encounter.TOP,
      { P1: roleId, P2: roleId, P3: 'role-p3' },
    );
    expect(selection.update).toHaveBeenCalledWith(
      expect.objectContaining({ components: [] }),
    );
  });

  it('removes mappings for the selected prog points when role is omitted', async () => {
    const selection = createSelection(['P1']);

    settingsCollection.getSettings.mockResolvedValue({
      progPointRoles: { [Encounter.TOP]: { P1: 'old-role', P3: 'role-p3' } },
    });

    await command.execute(createInteraction({ role: null, selection }));

    expect(settingsCollection.setProgPointRoles).toHaveBeenCalledWith(
      guildId,
      Encounter.TOP,
      { P3: 'role-p3' },
    );
  });

  it('requests a multi-select menu without the cleared option', async () => {
    const selection = createSelection(['P1']);
    settingsCollection.getSettings.mockResolvedValue(undefined);

    await command.execute(
      createInteraction({ role: { id: roleId } as unknown as Role, selection }),
    );

    expect(
      encountersComponentsService.createProgPointSelectMenu,
    ).toHaveBeenCalledWith(Encounter.TOP, {
      customId: PROG_POINT_ROLES_SELECT_ID,
      includeCleared: false,
      multiSelect: true,
    });
  });

  it('clears the select menu when handling the interaction throws', async () => {
    const selection = createSelection(['P1']);
    const error = new Error('firestore down');
    const mockErrorEmbed = {} as EmbedBuilder;

    settingsCollection.getSettings.mockRejectedValue(error);
    errorService.handleCommandError.mockReturnValue(mockErrorEmbed);

    const interaction = createInteraction({
      role: { id: roleId } as unknown as Role,
      selection,
    });

    await command.execute(interaction);

    expect(errorService.handleCommandError).toHaveBeenCalledWith(
      error,
      interaction,
    );
    expect(interaction.editReply).toHaveBeenLastCalledWith({
      embeds: [mockErrorEmbed],
      components: [],
    });
  });
});
```

- [ ] **Step 4: Run the spec to verify all tests (including the new one) pass**

Run: `pnpm vitest run src/slash-commands/settings/subcommands/prog-point-roles/edit-prog-point-roles.command-handler.spec.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Typecheck**

Run: `pnpm build:check`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/slash-commands/settings/subcommands/prog-point-roles/edit-prog-point-roles.command-handler.ts src/slash-commands/settings/subcommands/prog-point-roles/edit-prog-point-roles.command-handler.spec.ts
git commit -m "refactor(settings): migrate EditProgPointRolesCommandHandler to SettingsSubcommandHandler"
```

---

## Task 10: Full regression check and wrap-up

**Files:** none (verification only)

**Interfaces:**
- Consumes: all of Tasks 1-9.

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test:ci`
Expected: all tests pass (394 pre-existing + 8 new base-class tests across the 2 new spec files + 1 new prog-point-roles error-path test = 403 total), no failures.

- [ ] **Step 2: Full typecheck**

Run: `pnpm build:check`
Expected: no errors

- [ ] **Step 3: Lint**

Run: `pnpm exec biome check --fix .`
Expected: no unfixable errors. If it reports issues in files this plan didn't touch, do not fix them here — out of scope.

- [ ] **Step 4: Confirm `settings.module.ts` needs no changes**

Run: `git diff src/slash-commands/settings/settings.module.ts`
Expected: empty diff — the provider list is unchanged (per the spec, NestJS resolves property-injected fields on abstract base classes transparently).

- [ ] **Step 5: Sanity-check the line count reduction**

Run: `wc -l src/slash-commands/settings/subcommands/*/edit-*.command-handler.ts src/slash-commands/settings/settings-subcommand.handler.ts src/slash-commands/settings/settings-edit-command.handler.ts`
Expected: the 5 simple handlers are now roughly 25-40 lines each (down from 56-69), the 2 interactive handlers are roughly 10-15 lines shorter than before, and the two new base-class files add back a bounded, single-copy amount of shared logic (~90 combined lines including the abstract method declarations).

- [ ] **Step 6: Final commit if step 3 made any auto-fixes**

```bash
git status
# if biome --fix modified anything:
git add -u
git commit -m "chore(settings): biome auto-fixes"
```

- [ ] **Step 7: Note the manual smoke-test follow-up**

This step is a reminder, not an automated action — leave it for the user to perform before merging, since it requires a live Discord bot connection this plan's execution environment doesn't have:

> Run the bot against a dev guild and exercise `/settings reviewer`, `/settings channels`, and `/settings prog-point-roles` (one handler from each layer of the new hierarchy) to confirm replies and error paths still render correctly in a real Discord client.

---

## Post-plan follow-up (not part of this plan's tasks)

The project memory note claiming `pnpm build:check` "no longer exists" is stale — it was verified working multiple times during this planning session and matches `AGENTS.md`. Update or remove that memory entry; don't act on it as written.
