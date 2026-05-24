# Helper Team Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Discord role-based helper team management with recurring team schedules, helper absence reporting, coordinator status views, and coordinator-facing absence notifications.

**Architecture:** Add a focused helper team domain with Firestore collections, schedule/role-resolution services, and slash command modules. Discord roles remain the source of truth for team membership; Firestore stores team metadata, recurring sessions, absences, and settings. Reminder delivery remains deferred until a helper-visible destination is defined.

**Tech Stack:** NestJS 11, Discord.js 14, Firebase Admin Firestore, Nest CQRS, Vitest, Zod-style validation via focused pure functions where useful.

---

## File Map

- Create `src/firebase/models/helper-team.model.ts`: Firestore document types for teams, sessions, absences, and reminder delivery records.
- Create `src/firebase/collections/helper-team.collection.ts`: CRUD/query access for helper teams.
- Create `src/firebase/collections/helper-team-session.collection.ts`: CRUD/query access for recurring sessions.
- Create `src/firebase/collections/helper-absence.collection.ts`: CRUD/query access for session/range absences and TTL calculation.
- Modify `src/firebase/firebase.module.ts`: export the three new collections.
- Modify `src/firebase/models/settings.model.ts`: add `coordinatorRole` and `absenceNotificationChannelId`.
- Create `src/helper-team/helper-team-time.ts`: pure time/occurrence helpers and Discord timestamp formatting.
- Create `src/helper-team/helper-team-membership.service.ts`: resolve role-derived team membership using `DiscordService`.
- Create `src/helper-team/helper-team-authorization.service.ts`: coordinator/helper authorization checks.
- Create `src/helper-team/helper-team-notification.service.ts`: post absence notifications to the coordinator-visible channel.
- Create `src/helper-team/helper-team.module.ts`: exports shared helper-team services.
- Modify `src/discord/discord.service.ts`: add role member resolution helpers.
- Create `src/slash-commands/teams/*`: `/teams` slash command, command DTO, module, handler, embeds.
- Create `src/slash-commands/helpers/*`: `/helpers absent`, `/helpers status` slash command, command DTO, module, handler, components.
- Modify `src/slash-commands/slash-commands.module.ts`: import helper and team command modules.
- Modify `src/slash-commands/slash-commands.provider.ts`: register helper and team slash commands.
- Modify `src/slash-commands/slash-commands.utils.ts`: route helper/team commands and new settings subcommands.
- Modify `src/slash-commands/settings/settings.slash-command.ts`: add `absence-channel` and `coordinator-role`.
- Modify `src/slash-commands/settings/settings.module.ts`: register new settings handlers.
- Create `src/slash-commands/settings/subcommands/helper/*`: handlers for helper settings.
- Modify `src/slash-commands/settings/subcommands/view/view-settings.command-handler.ts`: show helper settings.
- Add focused `*.spec.ts` files alongside new collections, services, helpers, and command handlers.

## Task 1: Settings Model And Settings Commands

**Files:**
- Modify: `src/firebase/models/settings.model.ts`
- Modify: `src/slash-commands/settings/settings.slash-command.ts`
- Modify: `src/slash-commands/settings/settings.module.ts`
- Modify: `src/slash-commands/slash-commands.utils.ts`
- Modify: `src/slash-commands/settings/subcommands/view/view-settings.command-handler.ts`
- Create: `src/slash-commands/settings/subcommands/helper/edit-coordinator-role.command.ts`
- Create: `src/slash-commands/settings/subcommands/helper/edit-coordinator-role.command-handler.ts`
- Create: `src/slash-commands/settings/subcommands/helper/edit-coordinator-role.command-handler.spec.ts`
- Create: `src/slash-commands/settings/subcommands/helper/edit-absence-channel.command.ts`
- Create: `src/slash-commands/settings/subcommands/helper/edit-absence-channel.command-handler.ts`
- Create: `src/slash-commands/settings/subcommands/helper/edit-absence-channel.command-handler.spec.ts`

- [ ] **Step 1: Add failing settings command handler tests**

Add `src/slash-commands/settings/subcommands/helper/edit-coordinator-role.command-handler.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import type { ChatInputCommandInteraction, EmbedBuilder, Role } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { ErrorService } from '../../../../error/error.service.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { createAutoMock } from '../../../../test-utils/mock-factory.js';
import { EditCoordinatorRoleCommandHandler } from './edit-coordinator-role.command-handler.js';

describe('EditCoordinatorRoleCommandHandler', () => {
  let handler: EditCoordinatorRoleCommandHandler;
  let settingsCollection: Mocked<SettingsCollection>;
  let errorService: Mocked<ErrorService>;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [EditCoordinatorRoleCommandHandler],
    })
      .useMocker(createAutoMock)
      .compile();

    handler = fixture.get(EditCoordinatorRoleCommandHandler);
    settingsCollection = fixture.get(SettingsCollection);
    errorService = fixture.get(ErrorService);
  });

  it('stores the coordinator role id', async () => {
    settingsCollection.getSettings.mockResolvedValueOnce({ reviewerRole: 'reviewer-role' });

    const interaction = {
      guildId: 'guild-id',
      options: {
        getRole: (name: string) =>
          name === 'coordinator-role'
            ? ({ id: 'coordinator-role-id', name: 'Coordinators' } as Role)
            : null,
      },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    await handler.execute({ interaction });

    expect(settingsCollection.upsert).toHaveBeenCalledWith(
      'guild-id',
      expect.objectContaining({
        reviewerRole: 'reviewer-role',
        coordinatorRole: 'coordinator-role-id',
      }),
    );
    expect(interaction.editReply).toHaveBeenCalledWith('Coordinator role updated!');
  });

  it('handles errors with the shared error service', async () => {
    const error = new Error('settings failed');
    const embed = {} as EmbedBuilder;
    settingsCollection.getSettings.mockRejectedValueOnce(error);
    errorService.handleCommandError.mockReturnValue(embed);

    const interaction = {
      guildId: 'guild-id',
      options: {
        getRole: () => ({ id: 'coordinator-role-id', name: 'Coordinators' }) as Role,
      },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    await handler.execute({ interaction });

    expect(errorService.handleCommandError).toHaveBeenCalledWith(error, interaction);
    expect(interaction.editReply).toHaveBeenCalledWith({ embeds: [embed] });
  });
});
```

Add `src/slash-commands/settings/subcommands/helper/edit-absence-channel.command-handler.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import type { ChatInputCommandInteraction, EmbedBuilder, GuildTextBasedChannel } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { ErrorService } from '../../../../error/error.service.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { createAutoMock } from '../../../../test-utils/mock-factory.js';
import { EditAbsenceChannelCommandHandler } from './edit-absence-channel.command-handler.js';

describe('EditAbsenceChannelCommandHandler', () => {
  let handler: EditAbsenceChannelCommandHandler;
  let settingsCollection: Mocked<SettingsCollection>;
  let errorService: Mocked<ErrorService>;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [EditAbsenceChannelCommandHandler],
    })
      .useMocker(createAutoMock)
      .compile();

    handler = fixture.get(EditAbsenceChannelCommandHandler);
    settingsCollection = fixture.get(SettingsCollection);
    errorService = fixture.get(ErrorService);
  });

  it('stores the absence notification channel id', async () => {
    settingsCollection.getSettings.mockResolvedValueOnce({ coordinatorRole: 'coordinator-role-id' });

    const interaction = {
      guildId: 'guild-id',
      options: {
        getChannel: (name: string) =>
          name === 'absence-channel'
            ? ({ id: 'absence-channel-id' } as GuildTextBasedChannel)
            : null,
      },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    await handler.execute({ interaction });

    expect(settingsCollection.upsert).toHaveBeenCalledWith(
      'guild-id',
      expect.objectContaining({
        coordinatorRole: 'coordinator-role-id',
        absenceNotificationChannelId: 'absence-channel-id',
      }),
    );
    expect(interaction.editReply).toHaveBeenCalledWith('Absence notification channel updated!');
  });

  it('handles errors with the shared error service', async () => {
    const error = new Error('settings failed');
    const embed = {} as EmbedBuilder;
    settingsCollection.getSettings.mockRejectedValueOnce(error);
    errorService.handleCommandError.mockReturnValue(embed);

    const interaction = {
      guildId: 'guild-id',
      options: {
        getChannel: () => ({ id: 'absence-channel-id' }) as GuildTextBasedChannel,
      },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    await handler.execute({ interaction });

    expect(errorService.handleCommandError).toHaveBeenCalledWith(error, interaction);
    expect(interaction.editReply).toHaveBeenCalledWith({ embeds: [embed] });
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
pnpm test src/slash-commands/settings/subcommands/helper/edit-coordinator-role.command-handler.spec.ts src/slash-commands/settings/subcommands/helper/edit-absence-channel.command-handler.spec.ts
```

Expected: FAIL because the handler files do not exist.

- [ ] **Step 3: Implement settings fields and handlers**

Add fields to `src/firebase/models/settings.model.ts`:

```ts
  coordinatorRole?: string;
  absenceNotificationChannelId?: string;
```

Create `src/slash-commands/settings/subcommands/helper/edit-coordinator-role.command.ts`:

```ts
import { ChatInputCommandInteraction } from 'discord.js';

export class EditCoordinatorRoleCommand {
  constructor(
    public readonly interaction: ChatInputCommandInteraction<'cached'>,
  ) {}
}
```

Create `src/slash-commands/settings/subcommands/helper/edit-absence-channel.command.ts`:

```ts
import { ChatInputCommandInteraction } from 'discord.js';

export class EditAbsenceChannelCommand {
  constructor(
    public readonly interaction: ChatInputCommandInteraction<'cached'>,
  ) {}
}
```

Create `src/slash-commands/settings/subcommands/helper/edit-coordinator-role.command-handler.ts`:

```ts
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import * as Sentry from '@sentry/nestjs';
import { SentryTraced } from '@sentry/nestjs';
import { MessageFlags } from 'discord.js';
import { ErrorService } from '../../../../error/error.service.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { EditCoordinatorRoleCommand } from './edit-coordinator-role.command.js';

@CommandHandler(EditCoordinatorRoleCommand)
export class EditCoordinatorRoleCommandHandler
  implements ICommandHandler<EditCoordinatorRoleCommand>
{
  constructor(
    private readonly settingsCollection: SettingsCollection,
    private readonly errorService: ErrorService,
  ) {}

  @SentryTraced()
  async execute({ interaction }: EditCoordinatorRoleCommand) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const coordinatorRole = interaction.options.getRole('coordinator-role', true);
      Sentry.getCurrentScope().setContext('helper_coordinator_role_update', {
        roleId: coordinatorRole.id,
        roleName: coordinatorRole.name,
      });

      const settings = await this.settingsCollection.getSettings(interaction.guildId);
      await this.settingsCollection.upsert(interaction.guildId, {
        ...settings,
        coordinatorRole: coordinatorRole.id,
      });

      await interaction.editReply('Coordinator role updated!');
    } catch (error) {
      const errorEmbed = this.errorService.handleCommandError(error, interaction);
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
}
```

Create `src/slash-commands/settings/subcommands/helper/edit-absence-channel.command-handler.ts`:

```ts
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import * as Sentry from '@sentry/nestjs';
import { SentryTraced } from '@sentry/nestjs';
import { MessageFlags } from 'discord.js';
import { ErrorService } from '../../../../error/error.service.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { EditAbsenceChannelCommand } from './edit-absence-channel.command.js';

@CommandHandler(EditAbsenceChannelCommand)
export class EditAbsenceChannelCommandHandler
  implements ICommandHandler<EditAbsenceChannelCommand>
{
  constructor(
    private readonly settingsCollection: SettingsCollection,
    private readonly errorService: ErrorService,
  ) {}

  @SentryTraced()
  async execute({ interaction }: EditAbsenceChannelCommand) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const absenceChannel = interaction.options.getChannel('absence-channel', true);
      Sentry.getCurrentScope().setContext('helper_absence_channel_update', {
        channelId: absenceChannel.id,
      });

      const settings = await this.settingsCollection.getSettings(interaction.guildId);
      await this.settingsCollection.upsert(interaction.guildId, {
        ...settings,
        absenceNotificationChannelId: absenceChannel.id,
      });

      await interaction.editReply('Absence notification channel updated!');
    } catch (error) {
      const errorEmbed = this.errorService.handleCommandError(error, interaction);
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
}
```

Update `settings.slash-command.ts` to add:

```ts
export const EditAbsenceChannelSubcommand = new SlashCommandSubcommandBuilder()
  .setName('absence-channel')
  .setDescription('Set the coordinator-visible absence notification channel')
  .addChannelOption((option) =>
    option
      .setName('absence-channel')
      .setDescription('The channel where helper absences are posted')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true),
  );

export const EditCoordinatorRoleSubcommand = new SlashCommandSubcommandBuilder()
  .setName('coordinator-role')
  .setDescription('Set the role that can administer helper teams')
  .addRoleOption((option) =>
    option
      .setName('coordinator-role')
      .setDescription('The Discord role that can administer helper teams')
      .setRequired(true),
  );
```

Then add both subcommands to `SettingsSlashCommand`.

Update `settings.module.ts` providers with `EditCoordinatorRoleCommandHandler` and `EditAbsenceChannelCommandHandler`.

Update `slash-commands.utils.ts` settings routing:

```ts
.with('absence-channel', () => new EditAbsenceChannelCommand(interaction))
.with('coordinator-role', () => new EditCoordinatorRoleCommand(interaction))
```

Update `view-settings.command-handler.ts` to include fields:

```ts
{
  name: 'Helper Coordinator Role',
  value: formatRole(coordinatorRole),
  inline: true,
},
{
  name: 'Absence Notification Channel',
  value: formatChannel(absenceNotificationChannelId),
  inline: true,
},
```

- [ ] **Step 4: Run settings tests**

Run:

```bash
pnpm test src/slash-commands/settings/subcommands/helper/edit-coordinator-role.command-handler.spec.ts src/slash-commands/settings/subcommands/helper/edit-absence-channel.command-handler.spec.ts src/slash-commands/settings/subcommands/view/view-settings.command-handler.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/firebase/models/settings.model.ts src/slash-commands/settings src/slash-commands/slash-commands.utils.ts
git commit -m "feat: add helper team settings"
```

## Task 2: Helper Team Models And Firestore Collections

**Files:**
- Create: `src/firebase/models/helper-team.model.ts`
- Create: `src/firebase/collections/helper-team.collection.ts`
- Create: `src/firebase/collections/helper-team.collection.spec.ts`
- Create: `src/firebase/collections/helper-team-session.collection.ts`
- Create: `src/firebase/collections/helper-team-session.collection.spec.ts`
- Create: `src/firebase/collections/helper-absence.collection.ts`
- Create: `src/firebase/collections/helper-absence.collection.spec.ts`
- Modify: `src/firebase/firebase.module.ts`

- [ ] **Step 1: Write collection tests**

Create tests that mock Firestore with `doc().set()`, `doc().get()`, `where().get()`, and verify:

```ts
expect(HelperTeamCollection.getKey({ guildId: 'g1', teamId: 'alpha' })).toBe('g1-alpha');
expect(HelperTeamSessionCollection.getKey({ guildId: 'g1', sessionId: 's1' })).toBe('g1-s1');
expect(HelperAbsenceCollection.getKey({ guildId: 'g1', absenceId: 'a1' })).toBe('g1-a1');
```

Also verify TTL:

```ts
const expiresAt = calculateAbsenceExpiresAt(new Date('2026-05-20T04:00:00.000Z'));
expect(expiresAt.toDate().toISOString()).toBe('2026-05-27T04:00:00.000Z');
```

- [ ] **Step 2: Run collection tests and verify they fail**

Run:

```bash
pnpm test src/firebase/collections/helper-team.collection.spec.ts src/firebase/collections/helper-team-session.collection.spec.ts src/firebase/collections/helper-absence.collection.spec.ts
```

Expected: FAIL because the collection files do not exist.

- [ ] **Step 3: Add models**

Create `src/firebase/models/helper-team.model.ts`:

```ts
import type { DocumentData, Timestamp } from 'firebase-admin/firestore';

export interface HelperTeamDocument extends DocumentData {
  guildId: string;
  teamId: string;
  name: string;
  description?: string;
  active: boolean;
  memberRoleId: string;
  leaderRoleId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface HelperTeamSessionDocument extends DocumentData {
  guildId: string;
  sessionId: string;
  teamId: string;
  active: boolean;
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  startTime: string;
  durationMinutes: number;
  timezone: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type HelperAbsenceDocument =
  | HelperSessionAbsenceDocument
  | HelperRangeAbsenceDocument;

export interface BaseHelperAbsenceDocument extends DocumentData {
  guildId: string;
  absenceId: string;
  discordId: string;
  reason?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  expiresAt: Timestamp;
}

export interface HelperSessionAbsenceDocument
  extends BaseHelperAbsenceDocument {
  type: 'session';
  teamId: string;
  sessionId: string;
  occurrenceStart: Timestamp;
  occurrenceEnd: Timestamp;
}

export interface HelperRangeAbsenceDocument extends BaseHelperAbsenceDocument {
  type: 'range';
  startDate: string;
  endDate: string;
  timezone: string;
}

export interface HelperReminderDeliveryDocument extends DocumentData {
  guildId: string;
  teamId: string;
  sessionId: string;
  occurrenceStart: Timestamp;
  offsetMinutes: 60 | 1440;
  channelId: string;
  messageId?: string;
  sentAt: Timestamp;
}
```

- [ ] **Step 4: Implement collection classes**

Each collection should use a top-level collection:

```ts
firestore.collection('helperTeams')
firestore.collection('helperTeamSessions')
firestore.collection('helperAbsences')
```

Minimum methods:

```ts
upsert(document): Promise<void>
get(guildId, id): Promise<Document | undefined>
getActiveForGuild(guildId): Promise<Document[]>
archive(guildId, id): Promise<void>
```

For absences:

```ts
create(absence): Promise<void>
getFutureForUser(guildId, discordId, now): Promise<HelperAbsenceDocument[]>
getForOccurrence(guildId, teamId, sessionId, occurrenceStart): Promise<HelperAbsenceDocument[]>
remove(guildId, absenceId): Promise<void>
calculateAbsenceExpiresAt(absenceEnd: Date): Timestamp
```

Use `Timestamp.fromDate(new Date(absenceEnd.getTime() + 7 * 24 * 60 * 60 * 1000))` for TTL.

- [ ] **Step 5: Export collections**

Modify `src/firebase/firebase.module.ts` to import, provide, and export:

```ts
HelperTeamCollection,
HelperTeamSessionCollection,
HelperAbsenceCollection,
```

- [ ] **Step 6: Run collection tests**

Run:

```bash
pnpm test src/firebase/collections/helper-team.collection.spec.ts src/firebase/collections/helper-team-session.collection.spec.ts src/firebase/collections/helper-absence.collection.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/firebase
git commit -m "feat: add helper team collections"
```

## Task 3: Time And Occurrence Helpers

**Files:**
- Create: `src/helper-team/helper-team-time.ts`
- Create: `src/helper-team/helper-team-time.spec.ts`

- [ ] **Step 1: Write failing tests**

Test these pure helpers:

```ts
expect(isValidTime('19:30')).toBe(true);
expect(isValidTime('24:00')).toBe(false);
expect(formatDiscordTimestamp(1767225600, 'f')).toBe('<t:1767225600:f>');

const occurrence = getNextOccurrence({
  dayOfWeek: 5,
  startTime: '20:00',
  durationMinutes: 120,
  timezone: 'America/Denver',
  now: new Date('2026-05-14T18:00:00.000Z'),
});

expect(occurrence.start.getUTCDay()).toBe(6);
expect(occurrence.end.getTime() - occurrence.start.getTime()).toBe(120 * 60 * 1000);
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
pnpm test src/helper-team/helper-team-time.spec.ts
```

Expected: FAIL because helper functions do not exist.

- [ ] **Step 3: Implement time helpers**

Create `src/helper-team/helper-team-time.ts`:

```ts
import type { HelperTeamSessionDocument } from '../firebase/models/helper-team.model.js';

export interface SessionOccurrence {
  sessionId: string;
  teamId: string;
  start: Date;
  end: Date;
  unixSeconds: number;
}

export function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function formatDiscordTimestamp(unixSeconds: number, style: 'f' | 'R') {
  return `<t:${unixSeconds}:${style}>`;
}

export function getNextOccurrence({
  dayOfWeek,
  startTime,
  durationMinutes,
  timezone,
  now,
  sessionId = 'session',
  teamId = 'team',
}: Pick<HelperTeamSessionDocument, 'dayOfWeek' | 'startTime' | 'durationMinutes' | 'timezone'> & {
  now: Date;
  sessionId?: string;
  teamId?: string;
}): SessionOccurrence {
  const [hour, minute] = startTime.split(':').map(Number);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  for (let offset = 0; offset <= 7; offset++) {
    const candidate = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);
    const localParts = Object.fromEntries(
      formatter.formatToParts(candidate).map((part) => [part.type, part.value]),
    );
    const localDay = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(localParts.weekday);

    if (localDay !== dayOfWeek) {
      continue;
    }

    const start = new Date(candidate);
    start.setUTCHours(hour, minute, 0, 0);
    if (start <= now) {
      continue;
    }

    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
    return {
      sessionId,
      teamId,
      start,
      end,
      unixSeconds: Math.floor(start.getTime() / 1000),
    };
  }

  throw new Error('No occurrence found in the next week');
}
```

If timezone precision around daylight saving is insufficient in tests, replace the candidate construction with a small `Intl.DateTimeFormat` conversion helper in the same file; keep the public API unchanged.

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm test src/helper-team/helper-team-time.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/helper-team/helper-team-time.ts src/helper-team/helper-team-time.spec.ts
git commit -m "feat: add helper team time utilities"
```

## Task 4: Membership And Authorization Services

**Files:**
- Modify: `src/discord/discord.service.ts`
- Create: `src/helper-team/helper-team-membership.service.ts`
- Create: `src/helper-team/helper-team-membership.service.spec.ts`
- Create: `src/helper-team/helper-team-authorization.service.ts`
- Create: `src/helper-team/helper-team-authorization.service.spec.ts`
- Create: `src/helper-team/helper-team.module.ts`

- [ ] **Step 1: Write tests**

Membership tests should verify:

```ts
expect(result).toEqual([
  { teamId: 'alpha', role: 'leader' },
  { teamId: 'bravo', role: 'member' },
]);
```

Authorization tests should verify:

```ts
expect(await service.isCoordinator('guild-id', 'user-id')).toBe(true);
expect(await service.canUseHelperSelfService('guild-id', 'user-id')).toBe(true);
```

when the user has `coordinatorRole` or at least one active team role.

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
pnpm test src/helper-team/helper-team-membership.service.spec.ts src/helper-team/helper-team-authorization.service.spec.ts
```

Expected: FAIL because services do not exist.

- [ ] **Step 3: Add Discord role member helper**

Add to `DiscordService`:

```ts
public async getMembersWithRole({
  guildId,
  roleId,
}: {
  guildId: string;
  roleId: string;
}): Promise<GuildMember[]> {
  const guild = await this.client.guilds.fetch(guildId);
  await guild.members.fetch();
  const role = await guild.roles.fetch(roleId);
  return role ? [...role.members.values()] : [];
}
```

- [ ] **Step 4: Implement services**

Create membership result types:

```ts
export interface HelperTeamMembership {
  teamId: string;
  teamName: string;
  memberRoleId: string;
  leaderRoleId: string;
  role: 'member' | 'leader';
}
```

`HelperTeamMembershipService.getMembershipsForUser(guildId, discordId)` should:

1. Load active teams from `HelperTeamCollection`.
2. Fetch the guild member with `DiscordService.getGuildMember`.
3. Return teams where member has `leaderRoleId` as `leader`.
4. Return teams where member has `memberRoleId` as `member`.
5. Prefer `leader` if both roles are present.

`HelperTeamAuthorizationService` should expose:

```ts
isCoordinator(guildId: string, discordId: string): Promise<boolean>
canUseHelperSelfService(guildId: string, discordId: string): Promise<boolean>
assertCoordinator(guildId: string, discordId: string): Promise<void>
assertHelperOrCoordinator(guildId: string, discordId: string): Promise<void>
```

Throw `new Error('You do not have permission to use this command.')` from assertions.

- [ ] **Step 5: Create helper module**

Create `src/helper-team/helper-team.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { DiscordModule } from '../discord/discord.module.js';
import { FirebaseModule } from '../firebase/firebase.module.js';
import { HelperTeamAuthorizationService } from './helper-team-authorization.service.js';
import { HelperTeamMembershipService } from './helper-team-membership.service.js';

@Module({
  imports: [DiscordModule, FirebaseModule],
  providers: [HelperTeamMembershipService, HelperTeamAuthorizationService],
  exports: [HelperTeamMembershipService, HelperTeamAuthorizationService],
})
export class HelperTeamModule {}
```

- [ ] **Step 6: Run tests**

Run:

```bash
pnpm test src/helper-team/helper-team-membership.service.spec.ts src/helper-team/helper-team-authorization.service.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/discord/discord.service.ts src/helper-team
git commit -m "feat: resolve helper team membership from roles"
```

## Task 5: Team Commands

**Files:**
- Create: `src/slash-commands/teams/teams.slash-command.ts`
- Create: `src/slash-commands/teams/teams.commands.ts`
- Create: `src/slash-commands/teams/teams.module.ts`
- Create: `src/slash-commands/teams/handlers/teams.command-handler.ts`
- Create: `src/slash-commands/teams/handlers/teams.command-handler.spec.ts`
- Modify: `src/slash-commands/slash-commands.module.ts`
- Modify: `src/slash-commands/slash-commands.provider.ts`
- Modify: `src/slash-commands/slash-commands.utils.ts`

- [ ] **Step 1: Write command handler tests**

Cover:

```ts
const createCommand = {
  interaction: {
    guildId: 'guild-id',
    user: { id: 'coordinator-id' },
    options: {
      getSubcommand: () => 'create',
      getString: (name: string) => {
        const values: Record<string, string> = {
          name: 'Alpha',
          description: 'Friday helper team',
        };
        return values[name] ?? null;
      },
      getRole: (name: string) => {
        const roles = {
          'member-role': { id: 'member-role-id', name: 'Alpha Member' },
          'leader-role': { id: 'leader-role-id', name: 'Alpha Leader' },
        };
        return roles[name as keyof typeof roles] ?? null;
      },
    },
    deferReply: vi.fn(),
    editReply: vi.fn(),
  } as unknown as ChatInputCommandInteraction<'cached'>,
};

await handler.execute(createCommand);
expect(helperTeamCollection.upsert).toHaveBeenCalledWith(expect.objectContaining({
  guildId: 'guild-id',
  name: 'Alpha',
  memberRoleId: 'member-role-id',
  leaderRoleId: 'leader-role-id',
  active: true,
}));
```

and:

```ts
const membersCommand = {
  interaction: {
    guildId: 'guild-id',
    user: { id: 'coordinator-id' },
    options: {
      getSubcommand: () => 'members',
      getString: (name: string) => (name === 'team-id' ? 'alpha' : null),
    },
    deferReply: vi.fn(),
    editReply: vi.fn(),
  } as unknown as ChatInputCommandInteraction<'cached'>,
};

await handler.execute(membersCommand);
expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
  embeds: expect.any(Array),
}));
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
pnpm test src/slash-commands/teams/handlers/teams.command-handler.spec.ts
```

Expected: FAIL because the command module does not exist.

- [ ] **Step 3: Implement `/teams` slash command**

Create subcommands:

```ts
create, edit, archive, members, schedule-add, schedule-edit, schedule-remove, schedule-list, view
```

Use string option `team-id` for existing teams in the first version; autocomplete can be added later.

- [ ] **Step 4: Implement handler dispatch**

The handler should:

1. `deferReply({ flags: MessageFlags.Ephemeral })`.
2. Call `authorization.assertCoordinator(interaction.guildId, interaction.user.id)`.
3. Switch on `interaction.options.getSubcommand()`.
4. Delegate to private methods for each subcommand.

For `create`, build:

```ts
function normalizeTeamId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const now = Timestamp.now();
const team = {
  guildId: interaction.guildId,
  teamId: normalizeTeamId(name),
  name,
  description: description ?? undefined,
  active: true,
  memberRoleId: memberRole.id,
  leaderRoleId: leaderRole.id,
  createdAt: now,
  updatedAt: now,
};
```

For `members`, resolve role-derived members using `DiscordService.getMembersWithRole`.

- [ ] **Step 5: Register command**

Add `TeamsSlashCommand` to `SlashCommandsProvider`, import `TeamsModule` in `SlashCommandsModule`, and route `TeamsCommand` in `slash-commands.utils.ts`.

- [ ] **Step 6: Run tests**

Run:

```bash
pnpm test src/slash-commands/teams/handlers/teams.command-handler.spec.ts src/slash-commands/slash-commands.utils.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/slash-commands/teams src/slash-commands/slash-commands.module.ts src/slash-commands/slash-commands.provider.ts src/slash-commands/slash-commands.utils.ts
git commit -m "feat: add helper team commands"
```

## Task 6: Absence Notifications

**Files:**
- Create: `src/helper-team/helper-team-notification.service.ts`
- Create: `src/helper-team/helper-team-notification.service.spec.ts`
- Modify: `src/helper-team/helper-team.module.ts`

- [ ] **Step 1: Write notification tests**

Verify:

```ts
await service.sendSessionAbsenceNotification({
  guildId: 'guild-id',
  helperUserId: 'helper-id',
  teamName: 'Alpha',
  occurrenceUnixSeconds: 1767225600,
  reason: 'Work conflict',
});

expect(channel.send).toHaveBeenCalledWith(expect.objectContaining({
  embeds: expect.any(Array),
}));
```

Verify missing `absenceNotificationChannelId` returns:

```ts
expect(result).toEqual({ sent: false, reason: 'missing-channel-setting' });
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
pnpm test src/helper-team/helper-team-notification.service.spec.ts
```

Expected: FAIL because service does not exist.

- [ ] **Step 3: Implement notification service**

Create methods:

```ts
sendSessionAbsenceNotification(input): Promise<{ sent: true } | { sent: false; reason: string }>
sendRangeAbsenceNotification(input): Promise<{ sent: true } | { sent: false; reason: string }>
sendAbsenceRemovedNotification(input): Promise<{ sent: true } | { sent: false; reason: string }>
```

Each method:

1. Loads settings.
2. Returns `{ sent: false, reason: 'missing-channel-setting' }` if no channel.
3. Calls `discordService.getTextChannel`.
4. Returns `{ sent: false, reason: 'channel-not-found' }` if channel is unavailable.
5. Sends an embed mentioning the helper and including team/session/date information.

- [ ] **Step 4: Export service**

Add `HelperTeamNotificationService` to `HelperTeamModule` providers and exports.

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm test src/helper-team/helper-team-notification.service.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/helper-team/helper-team-notification.service.ts src/helper-team/helper-team-notification.service.spec.ts src/helper-team/helper-team.module.ts
git commit -m "feat: add helper absence notifications"
```

## Task 7: Helper Absence Commands

**Files:**
- Create: `src/slash-commands/helpers/helpers.slash-command.ts`
- Create: `src/slash-commands/helpers/helpers.commands.ts`
- Create: `src/slash-commands/helpers/helpers.module.ts`
- Create: `src/slash-commands/helpers/helpers.components.ts`
- Create: `src/slash-commands/helpers/handlers/helpers.command-handler.ts`
- Create: `src/slash-commands/helpers/handlers/helpers.command-handler.spec.ts`
- Modify: `src/slash-commands/slash-commands.module.ts`
- Modify: `src/slash-commands/slash-commands.provider.ts`
- Modify: `src/slash-commands/slash-commands.utils.ts`

- [ ] **Step 1: Write handler tests**

Cover:

```ts
const absentSessionCommand = {
  interaction: {
    guildId: 'guild-id',
    user: { id: 'helper-id' },
    options: {
      getSubcommand: () => 'absent-session',
    },
    deferReply: vi.fn(),
    editReply: vi.fn(),
  } as unknown as ChatInputCommandInteraction<'cached'>,
};

await handler.execute(absentSessionCommand);
expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
  components: expect.any(Array),
}));
```

Cover no teams:

```ts
membershipService.getMembershipsForUser.mockResolvedValueOnce([]);
await handler.execute(absentSessionCommand);
expect(interaction.editReply).toHaveBeenCalledWith('No upcoming team sessions found.');
```

Cover range absence:

```ts
const absentRangeCommand = {
  interaction: {
    guildId: 'guild-id',
    user: { id: 'helper-id' },
    options: {
      getSubcommand: () => 'absent-range',
      getString: (name: string) => {
        const values: Record<string, string> = {
          'start-date': '2026-05-20',
          'end-date': '2026-05-27',
          timezone: 'America/Denver',
          reason: 'Vacation',
        };
        return values[name] ?? null;
      },
    },
    deferReply: vi.fn(),
    editReply: vi.fn(),
  } as unknown as ChatInputCommandInteraction<'cached'>,
};

await handler.execute(absentRangeCommand);
expect(absenceCollection.create).toHaveBeenCalledWith(expect.objectContaining({
  type: 'range',
  startDate: '2026-05-20',
  endDate: '2026-05-27',
}));
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
pnpm test src/slash-commands/helpers/handlers/helpers.command-handler.spec.ts
```

Expected: FAIL because files do not exist.

- [ ] **Step 3: Implement `/helpers` slash command**

Subcommands:

```ts
absent-session
absent-range
absent-remove
status
```

Use names with hyphens because Discord subcommand names cannot be nested unless subcommand groups are introduced. Keep this first version simple.

- [ ] **Step 4: Implement absent session picker**

`absent-session` should:

1. Assert helper or coordinator.
2. Resolve memberships for the invoking user.
3. Load active sessions for those team IDs.
4. Calculate next occurrences over the next 14 days.
5. Render a select menu with values encoded as `teamId|sessionId|occurrenceUnixSeconds`.
6. Await the component interaction from the same user.
7. Re-load the session and validate the occurrence is still active.
8. Create a `session` absence with `expiresAt` one week after occurrence end.
9. Send absence notification.
10. Edit the ephemeral response with success text and notification status.

- [ ] **Step 5: Implement absent range and remove**

`absent-range` should create a `range` absence with:

```ts
{
  type: 'range',
  guildId,
  absenceId,
  discordId: interaction.user.id,
  startDate,
  endDate,
  timezone,
  reason,
  expiresAt,
}
```

`absent-remove` should render a select menu of future absences for the invoking user, delete the selected document, and send a coordinator-visible removal notification.

- [ ] **Step 6: Implement status**

`status` should assert coordinator, load active teams, resolve role-derived members, load upcoming absences, and respond with an embed grouped by team.

- [ ] **Step 7: Register command**

Add `HelpersSlashCommand` to `SlashCommandsProvider`, import `HelpersModule` in `SlashCommandsModule`, and route `HelpersCommand` in `slash-commands.utils.ts`.

- [ ] **Step 8: Run tests**

Run:

```bash
pnpm test src/slash-commands/helpers/handlers/helpers.command-handler.spec.ts src/slash-commands/slash-commands.utils.spec.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/slash-commands/helpers src/slash-commands/slash-commands.module.ts src/slash-commands/slash-commands.provider.ts src/slash-commands/slash-commands.utils.ts
git commit -m "feat: add helper absence commands"
```

## Task 8: Documentation And Full Verification

**Files:**
- Modify: `docs/slash-commands.md`
- Modify: `docs/data-layer.md`

- [ ] **Step 1: Update docs**

Add helper commands to `docs/slash-commands.md`:

```md
| `/helpers absent-session/range/remove/status` | Mixed | Manage helper absences and coordinator helper status |
| `/teams create/edit/archive/members/schedule-* /view` | Yes | Manage role-backed helper teams and schedules |
```

Add helper collections to `docs/data-layer.md`:

```md
| `helperTeams` | `HelperTeamCollection` | Role-backed helper team metadata |
| `helperTeamSessions` | `HelperTeamSessionCollection` | Recurring weekly team sessions |
| `helperAbsences` | `HelperAbsenceCollection` | Session and date-range absences with TTL |
```

- [ ] **Step 2: Run focused test suite**

Run:

```bash
pnpm test src/firebase/collections/helper-team.collection.spec.ts src/firebase/collections/helper-team-session.collection.spec.ts src/firebase/collections/helper-absence.collection.spec.ts src/helper-team src/slash-commands/helpers src/slash-commands/teams src/slash-commands/settings/subcommands/helper
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Run lint/check**

Run:

```bash
pnpm check
```

Expected: PASS.

- [ ] **Step 5: Commit docs and verification fixes**

```bash
git add docs src
git commit -m "docs: document helper team management"
```

## Self-Review

- Spec coverage: The plan covers role-backed teams, recurring sessions, absence TTL, role-based coordinator authorization, helper self-service absences, coordinator status, coordinator-facing absence notifications, and settings. It intentionally defers helper schedule reminders because the approved spec says the coordinator-only channel is not useful for reminders.
- Placeholder scan: No task contains TBD/TODO language. Each implementation task names exact files, commands, and expected test outcomes.
- Type consistency: The plan consistently uses `coordinatorRole`, `absenceNotificationChannelId`, `memberRoleId`, `leaderRoleId`, `helperTeams`, `helperTeamSessions`, and `helperAbsences`.
