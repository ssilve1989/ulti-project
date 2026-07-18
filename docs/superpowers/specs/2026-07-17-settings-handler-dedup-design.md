# Settings Edit Handler De-duplication — Design

Date: 2026-07-17
Origin: `/tech-debt-audit` finding F009 ("Consistency rot / duplication" — `TECH_DEBT_AUDIT.md`)

## Problem

`src/slash-commands/settings/subcommands/` contains 7 command handlers, one per `/settings <subcommand>`. All 7 wrap their body in the same shell:

```typescript
async execute(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    // ...body...
  } catch (error) {
    const errorEmbed = this.errorService.handleCommandError(error, interaction);
    await interaction.editReply({ embeds: [errorEmbed] });
  }
}
```

Of the 7, **5 share a fully identical body shape** — read Discord options, set Sentry scope context, fetch existing `SettingsDocument`, upsert a patched merge of it, reply with a plain success string:

- `channels/edit-channels.command-handler.ts` (65 lines)
- `reviewer/edit-reviewer.command-handler.ts` (56 lines)
- `roles/edit-encounter-roles.command-handler.ts` (68 lines)
- `spreadsheet/edit-spreadsheet.command-handler.ts` (58 lines)
- `turbo-prog/edit-turbo-prog.command-handler.ts` (59 lines)

The other 2 open interactive Discord message-component flows (select menus with `collector.on('collect'/'end')` or `awaitMessageComponent`) and only share the outer try/catch/error-embed shell with the 5, not the body:

- `blacklist-channels/edit-blacklist-channels.command-handler.ts` (118 lines)
- `prog-point-roles/edit-prog-point-roles.command-handler.ts` (113 lines)

A change to the shared conventions (e.g. how errors are reported, or the ephemeral-reply flag) currently requires editing all 7 files. Adding an 8th settings subcommand means copy-pasting the shell again.

## Non-goals

- This does **not** touch the 8 non-settings handlers elsewhere in the codebase that also call `errorService.handleCommandError` (`signup`, `lookup`, `help`, `clean-roles`, `sync-prog-roles`, `remove-signup`, `view-encounter`, `status`). Those were evaluated during the audit and are varied enough in structure that forcing a shared base class across all of them would trade one kind of complexity for another. Scope is limited to the settings subcommand handlers only.
- This does not change any user-facing behavior, Discord option definitions, Firestore document shape, or `/settings` command structure. It is a pure internal refactor; the `SettingsSlashCommand` builder and `settings.module.ts` provider list are unaffected.
- This does not address the dead `RoleProtectedHandler`/`RequiresRole` scaffolding (audit findings F007/F008) — unrelated cleanup, out of scope here, though this design reuses the NestJS property-injection technique that scaffolding demonstrated.

## Design

### Two-layer class hierarchy

**Layer 1 — `SettingsSubcommandHandler`** (`src/slash-commands/settings/settings-subcommand.handler.ts`)

Owns the outer shell common to all 7: `deferReply` → delegate to an abstract `handle()` → on thrown error, build the error embed and reply. All 7 concrete handlers extend this, directly or indirectly.

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

Uses NestJS property injection (`@Inject()` on a class field) rather than constructor injection, the same technique already present — but never adopted — in `src/common/authorization/role-protected.command-handler.ts`. This means concrete subclasses that need no dependencies beyond `errorService`/`settingsCollection` (added in Layer 2) require **no constructor at all**.

`@SentryTraced()` moves to this base class's `execute()` and is removed from all 7 concrete handlers. Verified against the installed `@sentry/nestjs@10.63.0` source (`decorators.js`): the decorator names its span `propertyKey` (always the literal string `"execute"`, not derived from the class), and invokes `originalMethod.apply(this, args)` — so it dispatches against the real subclass instance either way. Declaring it once on the base is behaviorally identical to declaring it on all 7 subclasses; there is no per-class span name being lost, and no need for subclasses to redeclare `execute()` just to keep the decorator.

**Layer 2 — `SettingsEditCommandHandler<TOpts>`** (`src/slash-commands/settings/settings-edit-command.handler.ts`)

Extends Layer 1. Implements `handle()` as a template method for the 5 simple handlers, deferring the varying parts to abstract methods:

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

### Concrete handler example (before/after)

`edit-reviewer.command-handler.ts` goes from 56 lines to:

```typescript
import { Injectable } from '@nestjs/common';
import type { ChatInputCommandInteraction, Role } from 'discord.js';
import { SlashCommand } from '../../../slash-command.decorator.js';
import { SettingsSlashCommand } from '../../settings.slash-command.js';
import { SettingsEditCommandHandler } from '../../settings-edit-command.handler.js';

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

`execute()` itself is entirely inherited from `SettingsSubcommandHandler` — no subclass needs to touch it, including for `@SentryTraced()` (see above).

The other 4 simple handlers (`edit-channels`, `edit-encounter-roles`, `edit-spreadsheet`, `edit-turbo-prog`) follow the same shape. `edit-encounter-roles` and `edit-turbo-prog`'s `buildPatch` need to read from `existing` for nested-field merges (e.g. `progRoles: { ...existing?.progRoles, [encounter]: progRole.id }`), which is why `buildPatch` takes `existing` as a parameter.

### The 2 interactive handlers

`edit-blacklist-channels` and `edit-prog-point-roles` extend `SettingsSubcommandHandler` directly (not `SettingsEditCommandHandler`) and keep their current bodies almost unchanged inside `handle()`:

- Remove the now-redundant `await interaction.deferReply(...)` (base class does this before calling `handle()`).
- Remove the outer `try { ... } catch (error) { errorEmbed... }` — keep only the inner per-callback try/catch blocks (e.g. `collector.on('collect', async (i) => { try { ... } catch { this.logger.error(...); this.errorService.captureError(...); } })`), which are genuinely different logic (logging without a Discord reply, since the collector interaction `i` is separate from the outer `interaction`), not boilerplate.
- `settingsCollection` and `errorService` are inherited via `SettingsSubcommandHandler`'s property injection — neither interactive handler needs its own constructor for these. `edit-prog-point-roles` additionally needs `EncountersComponentsService`, which it gets via a normal constructor that calls `super()` (subclasses can freely mix property-injected inherited deps with their own constructor-injected ones — this is standard NestJS behavior). `edit-blacklist-channels` needs no constructor at all beyond keeping its own `Logger` instance field (unrelated to DI, unchanged).
- `edit-prog-point-roles` overrides `errorReplyExtras()`:
  ```typescript
  protected override errorReplyExtras() {
    return { components: [] };
  }
  ```
  This preserves its current behavior of clearing the select menu on error, which the other 6 handlers don't do.

### Testing

All 7 existing spec files (`*.command-handler.spec.ts`) test through the public `execute()` method with mocked `settingsCollection`/`errorService`/etc. `execute()`'s observable behavior — the `deferReply` call, the `upsert` payload shape, reply content, and the error-embed reply on thrown errors — is unchanged by this refactor, so **all 7 existing spec files should pass unmodified** as a regression check that the refactor preserved behavior.

New coverage added as part of this work:
- `settings-subcommand.handler.spec.ts` — a minimal concrete test subclass verifying: `deferReply` is called before `handle()`, a thrown error in `handle()` produces an `errorService.handleCommandError` call and an `editReply` with the embed, and `errorReplyExtras()` is merged into that reply.
- `settings-edit-command.handler.spec.ts` — a minimal concrete test subclass verifying the template method calls `readOptions` → `scopeContext` (asserting `Sentry.getCurrentScope().setContext` is called with its return value) → `getSettings` → `upsert` (asserting the merge of `existing` + `buildPatch` result) → `editReply` with `successMessage`'s return value.

### File/module changes

No changes to `settings.module.ts` — the provider list stays the same 7 concrete classes; NestJS resolves property-injected fields on abstract base classes transparently for any `@Injectable()` subclass.

New files:
- `src/slash-commands/settings/settings-subcommand.handler.ts`
- `src/slash-commands/settings/settings-subcommand.handler.spec.ts`
- `src/slash-commands/settings/settings-edit-command.handler.ts`
- `src/slash-commands/settings/settings-edit-command.handler.spec.ts`

Modified files (all 7 handlers, shrinking each to the pattern above):
- `src/slash-commands/settings/subcommands/channels/edit-channels.command-handler.ts`
- `src/slash-commands/settings/subcommands/reviewer/edit-reviewer.command-handler.ts`
- `src/slash-commands/settings/subcommands/roles/edit-encounter-roles.command-handler.ts`
- `src/slash-commands/settings/subcommands/spreadsheet/edit-spreadsheet.command-handler.ts`
- `src/slash-commands/settings/subcommands/turbo-prog/edit-turbo-prog.command-handler.ts`
- `src/slash-commands/settings/subcommands/blacklist-channels/edit-blacklist-channels.command-handler.ts`
- `src/slash-commands/settings/subcommands/prog-point-roles/edit-prog-point-roles.command-handler.ts`

### Success criteria

- `pnpm build:check` (typecheck) passes with no `any`/unsafe casts introduced.
- `pnpm test:ci` passes — all 7 pre-existing settings-handler spec files pass unmodified, plus the 2 new base-class spec files.
- `pnpm lint` / `biome check` clean.
- Net line count in `src/slash-commands/settings/subcommands/` drops substantially (5 files go from ~60 lines to ~25-35; the 2 interactive files shrink by roughly the size of the removed try/catch shell, ~10-15 lines each).
- Manual smoke check (per repo convention for Discord-facing changes): run the bot against a dev guild and exercise `/settings reviewer`, `/settings channels`, and `/settings prog-point-roles` (one from each layer) to confirm replies and error paths still render correctly.
