# Teams Schedule Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `schedule-add`, `schedule-list`, `schedule-edit`, and `schedule-remove` subcommands to `/teams` so coordinators who are the leader of a team can manage that team's recurring weekly sessions.

**Architecture:** All four subcommands live in the existing `TeamsCommandHandler`. Authorization is two-step: (1) coordinator role check already at the top of `execute`, (2) inline team-leader check (`team.leaderUserId === interaction.user.id`) after team lookup. `schedule-edit` and `schedule-remove` use an ephemeral select menu — the same pattern as `handleAbsentRemove` in `helpers.command-handler.ts` — to let the coordinator pick a session without typing an internal ID. `HelperTeamSessionCollection` is already exported from `FirebaseModule`, which `TeamsModule` already imports.

**Tech Stack:** NestJS CQRS, Discord.js v14, Firestore, Vitest, TypeScript strict mode, Temporal API (global in Node 26+)

---

## File Structure

- Modify: `src/slash-commands/teams/teams.slash-command.ts` — add 4 subcommand builders, add to export
- Modify: `src/slash-commands/teams/handlers/teams.command-handler.ts` — new imports, `DAY_NAMES` constant, inject `HelperTeamSessionCollection`, 4 switch cases, 4 private handlers
- Modify: `src/slash-commands/teams/handlers/teams.command-handler.spec.ts` — add `sessionCollection` to fixture setup, add 4 `describe` blocks

No new files.

---

### Task 1: Add schedule subcommand definitions

**Files:**
- Modify: `src/slash-commands/teams/teams.slash-command.ts`

- [ ] **Step 1: Add 4 subcommand builders and update the export**

Add these four constants after `ViewSubcommand` and update `TeamsSlashCommand` to include them. The full file after the change:

```typescript
import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
} from 'discord.js';

const CreateSubcommand = new SlashCommandSubcommandBuilder()
  .setName('create')
  .setDescription('Create a new helper team')
  .addRoleOption((o) =>
    o
      .setName('member-role')
      .setDescription('Role for team members')
      .setRequired(true),
  )
  .addUserOption((o) =>
    o.setName('leader').setDescription('Team leader').setRequired(true),
  );

const EditSubcommand = new SlashCommandSubcommandBuilder()
  .setName('edit')
  .setDescription('Edit an existing helper team')
  .addRoleOption((o) =>
    o
      .setName('member-role')
      .setDescription('Role for the team to edit')
      .setRequired(true),
  )
  .addUserOption((o) =>
    o.setName('leader').setDescription('New team leader').setRequired(false),
  );

const ArchiveSubcommand = new SlashCommandSubcommandBuilder()
  .setName('archive')
  .setDescription('Archive a helper team')
  .addRoleOption((o) =>
    o
      .setName('member-role')
      .setDescription('Role for the team to archive')
      .setRequired(true),
  );

const MembersSubcommand = new SlashCommandSubcommandBuilder()
  .setName('members')
  .setDescription('View members of a helper team')
  .addRoleOption((o) =>
    o
      .setName('member-role')
      .setDescription('Role for the team')
      .setRequired(true),
  );

const ViewSubcommand = new SlashCommandSubcommandBuilder()
  .setName('view')
  .setDescription('View all active helper teams');

const ScheduleAddSubcommand = new SlashCommandSubcommandBuilder()
  .setName('schedule-add')
  .setDescription('Add a recurring weekly session to a team')
  .addRoleOption((o) =>
    o
      .setName('member-role')
      .setDescription('Role for the team')
      .setRequired(true),
  )
  .addIntegerOption((o) =>
    o
      .setName('day-of-week')
      .setDescription('Day of the week')
      .setRequired(true)
      .addChoices(
        { name: 'Monday', value: 1 },
        { name: 'Tuesday', value: 2 },
        { name: 'Wednesday', value: 3 },
        { name: 'Thursday', value: 4 },
        { name: 'Friday', value: 5 },
        { name: 'Saturday', value: 6 },
        { name: 'Sunday', value: 7 },
      ),
  )
  .addStringOption((o) =>
    o
      .setName('start-time')
      .setDescription('Session start time in HH:mm format (e.g. 20:00)')
      .setRequired(true),
  )
  .addIntegerOption((o) =>
    o
      .setName('duration-minutes')
      .setDescription('Session duration in minutes')
      .setRequired(true)
      .setMinValue(15)
      .setMaxValue(480),
  )
  .addStringOption((o) =>
    o
      .setName('timezone')
      .setDescription('Timezone (e.g. America/Denver, UTC)')
      .setRequired(true),
  );

const ScheduleListSubcommand = new SlashCommandSubcommandBuilder()
  .setName('schedule-list')
  .setDescription('List all active sessions for a team')
  .addRoleOption((o) =>
    o
      .setName('member-role')
      .setDescription('Role for the team')
      .setRequired(true),
  );

const ScheduleEditSubcommand = new SlashCommandSubcommandBuilder()
  .setName('schedule-edit')
  .setDescription('Edit a recurring session for a team')
  .addRoleOption((o) =>
    o
      .setName('member-role')
      .setDescription('Role for the team')
      .setRequired(true),
  )
  .addIntegerOption((o) =>
    o
      .setName('day-of-week')
      .setDescription('New day of the week')
      .setRequired(false)
      .addChoices(
        { name: 'Monday', value: 1 },
        { name: 'Tuesday', value: 2 },
        { name: 'Wednesday', value: 3 },
        { name: 'Thursday', value: 4 },
        { name: 'Friday', value: 5 },
        { name: 'Saturday', value: 6 },
        { name: 'Sunday', value: 7 },
      ),
  )
  .addStringOption((o) =>
    o
      .setName('start-time')
      .setDescription('New start time in HH:mm format')
      .setRequired(false),
  )
  .addIntegerOption((o) =>
    o
      .setName('duration-minutes')
      .setDescription('New duration in minutes')
      .setRequired(false)
      .setMinValue(15)
      .setMaxValue(480),
  )
  .addStringOption((o) =>
    o
      .setName('timezone')
      .setDescription('New timezone (e.g. America/Denver, UTC)')
      .setRequired(false),
  );

const ScheduleRemoveSubcommand = new SlashCommandSubcommandBuilder()
  .setName('schedule-remove')
  .setDescription('Remove a recurring session from a team')
  .addRoleOption((o) =>
    o
      .setName('member-role')
      .setDescription('Role for the team')
      .setRequired(true),
  );

export const TeamsSlashCommand = new SlashCommandBuilder()
  .setName('teams')
  .setDescription('Manage helper teams')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addSubcommand(CreateSubcommand)
  .addSubcommand(EditSubcommand)
  .addSubcommand(ArchiveSubcommand)
  .addSubcommand(MembersSubcommand)
  .addSubcommand(ViewSubcommand)
  .addSubcommand(ScheduleAddSubcommand)
  .addSubcommand(ScheduleListSubcommand)
  .addSubcommand(ScheduleEditSubcommand)
  .addSubcommand(ScheduleRemoveSubcommand);
```

- [ ] **Step 2: Typecheck**

```bash
rtk pnpm typecheck
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
rtk git add src/slash-commands/teams/teams.slash-command.ts
rtk git commit -m "feat: add schedule subcommand definitions to /teams slash command"
```

---

### Task 2: Wire routing, inject HelperTeamSessionCollection, add stubs

**Files:**
- Modify: `src/slash-commands/teams/handlers/teams.command-handler.ts`
- Modify: `src/slash-commands/teams/handlers/teams.command-handler.spec.ts`

- [ ] **Step 1: Update imports in the command handler**

Replace the existing imports block in `teams.command-handler.ts` with:

```typescript
import { randomUUID } from 'node:crypto';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { SentryTraced } from '@sentry/nestjs';
import {
  ActionRowBuilder,
  ComponentType,
  DiscordjsErrorCodes,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { Timestamp } from 'firebase-admin/firestore';
import { isSameUserFilter } from '../../../common/collection-filters.js';
import { DiscordService } from '../../../discord/discord.service.js';
import { ErrorService } from '../../../error/error.service.js';
import { HelperTeamCollection } from '../../../firebase/collections/helper-team.collection.js';
import { HelperTeamSessionCollection } from '../../../firebase/collections/helper-team-session.collection.js';
import { HelperTeamAuthorizationService } from '../../../helper-team/helper-team-authorization.service.js';
import {
  formatDiscordTimestamp,
  getNextOccurrence,
  isValidTime,
} from '../../../helper-team/helper-team-time.js';
import { TeamsCommand } from '../teams.commands.js';
```

- [ ] **Step 2: Add DAY_NAMES constant after the imports**

Add this constant immediately after the imports, before the `@CommandHandler` decorator:

```typescript
const DAY_NAMES = [
  '',
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
  'Sun',
] as const;
```

`DAY_NAMES[dayOfWeek]` gives the short name for a `dayOfWeek` value of 1–7 (1=Mon, 7=Sun). Index 0 is unused.

- [ ] **Step 3: Inject HelperTeamSessionCollection in the constructor**

Replace the existing constructor with:

```typescript
constructor(
  private readonly helperTeamCollection: HelperTeamCollection,
  private readonly sessionCollection: HelperTeamSessionCollection,
  private readonly discordService: DiscordService,
  private readonly authorizationService: HelperTeamAuthorizationService,
  private readonly errorService: ErrorService,
) {}
```

- [ ] **Step 4: Add 4 switch cases to the execute method**

In the `switch (subcommand)` block, add these cases before the `default`:

```typescript
case 'schedule-add':
  await this.handleScheduleAdd(interaction);
  break;
case 'schedule-list':
  await this.handleScheduleList(interaction);
  break;
case 'schedule-edit':
  await this.handleScheduleEdit(interaction);
  break;
case 'schedule-remove':
  await this.handleScheduleRemove(interaction);
  break;
```

- [ ] **Step 5: Add 4 stub private methods after handleView**

```typescript
private async handleScheduleAdd(
  interaction: TeamsCommand['interaction'],
): Promise<void> {
  await interaction.editReply('Not yet implemented.');
}

private async handleScheduleList(
  interaction: TeamsCommand['interaction'],
): Promise<void> {
  await interaction.editReply('Not yet implemented.');
}

private async handleScheduleEdit(
  interaction: TeamsCommand['interaction'],
): Promise<void> {
  await interaction.editReply('Not yet implemented.');
}

private async handleScheduleRemove(
  interaction: TeamsCommand['interaction'],
): Promise<void> {
  await interaction.editReply('Not yet implemented.');
}
```

- [ ] **Step 6: Add sessionCollection to the spec fixture setup**

In `teams.command-handler.spec.ts`, add to the top-level `let` declarations:

```typescript
import { HelperTeamSessionCollection } from '../../../firebase/collections/helper-team-session.collection.js';

// in the describe block:
let sessionCollection: Mocked<HelperTeamSessionCollection>;
```

And inside `beforeEach`, after `discordService = fixture.get(DiscordService);`:

```typescript
sessionCollection = fixture.get(HelperTeamSessionCollection);
```

- [ ] **Step 7: Typecheck and run existing tests**

```bash
rtk pnpm typecheck && rtk pnpm vitest run teams.command-handler
```

Expected: typecheck clean, all existing tests pass

- [ ] **Step 8: Commit**

```bash
rtk git add src/slash-commands/teams/handlers/teams.command-handler.ts \
            src/slash-commands/teams/handlers/teams.command-handler.spec.ts
rtk git commit -m "feat: wire schedule subcommand routing and inject HelperTeamSessionCollection"
```

---

### Task 3: Implement and test schedule-add

**Files:**
- Modify: `src/slash-commands/teams/handlers/teams.command-handler.spec.ts`
- Modify: `src/slash-commands/teams/handlers/teams.command-handler.ts`

- [ ] **Step 1: Write failing tests**

Add this describe block to `teams.command-handler.spec.ts` (inside the top-level `describe('TeamsCommandHandler', ...)`):

```typescript
describe('schedule-add subcommand', () => {
  const now = Timestamp.now();
  const team = {
    guildId: 'guild-id',
    teamId: 'member-role-id',
    active: true,
    memberRoleId: 'member-role-id',
    leaderUserId: 'coordinator-id', // matches interaction.user.id
    createdAt: now,
    updatedAt: now,
  };

  it('upserts a new session and replies with day/time summary', async () => {
    helperTeamCollection.getByMemberRole.mockResolvedValueOnce(team);

    const interaction = {
      guildId: 'guild-id',
      user: { id: 'coordinator-id' },
      options: {
        getSubcommand: () => 'schedule-add',
        getRole: (name: string) =>
          name === 'member-role' ? { id: 'member-role-id' } : null,
        getInteger: (name: string) => {
          if (name === 'day-of-week') return 5;
          if (name === 'duration-minutes') return 120;
          return null;
        },
        getString: (name: string) => {
          if (name === 'start-time') return '20:00';
          if (name === 'timezone') return 'America/Denver';
          return null;
        },
      },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    await handler.execute({ interaction });

    expect(sessionCollection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        guildId: 'guild-id',
        teamId: 'member-role-id',
        active: true,
        dayOfWeek: 5,
        startTime: '20:00',
        durationMinutes: 120,
        timezone: 'America/Denver',
      }),
    );
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('Fri'),
    );
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('20:00'),
    );
  });

  it('rejects with invalid-time error before any Firestore reads', async () => {
    const interaction = {
      guildId: 'guild-id',
      user: { id: 'coordinator-id' },
      options: {
        getSubcommand: () => 'schedule-add',
        getRole: (name: string) =>
          name === 'member-role' ? { id: 'member-role-id' } : null,
        getInteger: (name: string) => {
          if (name === 'day-of-week') return 5;
          if (name === 'duration-minutes') return 120;
          return null;
        },
        getString: (name: string) => {
          if (name === 'start-time') return 'bad-time';
          if (name === 'timezone') return 'America/Denver';
          return null;
        },
      },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    await handler.execute({ interaction });

    expect(interaction.editReply).toHaveBeenCalledWith(
      'Invalid start time. Use HH:mm format (e.g. 20:00).',
    );
    expect(helperTeamCollection.getByMemberRole).not.toHaveBeenCalled();
    expect(sessionCollection.upsert).not.toHaveBeenCalled();
  });

  it('rejects when no team is configured for the role', async () => {
    helperTeamCollection.getByMemberRole.mockResolvedValueOnce(undefined);

    const interaction = {
      guildId: 'guild-id',
      user: { id: 'coordinator-id' },
      options: {
        getSubcommand: () => 'schedule-add',
        getRole: (name: string) =>
          name === 'member-role' ? { id: 'role-id' } : null,
        getInteger: (name: string) => {
          if (name === 'day-of-week') return 1;
          if (name === 'duration-minutes') return 60;
          return null;
        },
        getString: (name: string) => {
          if (name === 'start-time') return '19:00';
          if (name === 'timezone') return 'UTC';
          return null;
        },
      },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    await handler.execute({ interaction });

    expect(interaction.editReply).toHaveBeenCalledWith(
      'No team is configured for the role <@&role-id>.',
    );
    expect(sessionCollection.upsert).not.toHaveBeenCalled();
  });

  it('rejects when coordinator is not the team leader', async () => {
    helperTeamCollection.getByMemberRole.mockResolvedValueOnce({
      ...team,
      leaderUserId: 'someone-else-id',
    });

    const interaction = {
      guildId: 'guild-id',
      user: { id: 'coordinator-id' },
      options: {
        getSubcommand: () => 'schedule-add',
        getRole: (name: string) =>
          name === 'member-role' ? { id: 'member-role-id' } : null,
        getInteger: (name: string) => {
          if (name === 'day-of-week') return 5;
          if (name === 'duration-minutes') return 120;
          return null;
        },
        getString: (name: string) => {
          if (name === 'start-time') return '20:00';
          if (name === 'timezone') return 'America/Denver';
          return null;
        },
      },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    await handler.execute({ interaction });

    expect(interaction.editReply).toHaveBeenCalledWith(
      'You are not the leader of the <@&member-role-id> team.',
    );
    expect(sessionCollection.upsert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
rtk pnpm vitest run teams.command-handler
```

Expected: 4 new tests FAIL (stub replies "Not yet implemented.")

- [ ] **Step 3: Implement handleScheduleAdd**

Replace the stub `handleScheduleAdd` in `teams.command-handler.ts` with:

```typescript
private async handleScheduleAdd(
  interaction: TeamsCommand['interaction'],
): Promise<void> {
  const memberRole = interaction.options.getRole('member-role', true);
  const dayOfWeek = interaction.options.getInteger(
    'day-of-week',
    true,
  ) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
  const startTime = interaction.options.getString('start-time', true);
  const durationMinutes = interaction.options.getInteger(
    'duration-minutes',
    true,
  );
  const timezone = interaction.options.getString('timezone', true);

  if (!isValidTime(startTime)) {
    await interaction.editReply(
      'Invalid start time. Use HH:mm format (e.g. 20:00).',
    );
    return;
  }

  const team = await this.helperTeamCollection.getByMemberRole(
    interaction.guildId,
    memberRole.id,
  );
  if (!team) {
    await interaction.editReply(
      `No team is configured for the role <@&${memberRole.id}>.`,
    );
    return;
  }

  if (team.leaderUserId !== interaction.user.id) {
    await interaction.editReply(
      `You are not the leader of the <@&${team.memberRoleId}> team.`,
    );
    return;
  }

  const now = Timestamp.now();
  await this.sessionCollection.upsert({
    guildId: interaction.guildId,
    sessionId: randomUUID(),
    teamId: team.teamId,
    active: true,
    dayOfWeek,
    startTime,
    durationMinutes,
    timezone,
    createdAt: now,
    updatedAt: now,
  });

  await interaction.editReply(
    `Schedule added: ${DAY_NAMES[dayOfWeek]} at ${startTime} (${durationMinutes}min, ${timezone}).`,
  );
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
rtk pnpm vitest run teams.command-handler
```

Expected: all tests pass

- [ ] **Step 5: Typecheck**

```bash
rtk pnpm typecheck
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
rtk git add src/slash-commands/teams/handlers/teams.command-handler.ts \
            src/slash-commands/teams/handlers/teams.command-handler.spec.ts
rtk git commit -m "feat: implement /teams schedule-add subcommand"
```

---

### Task 4: Implement and test schedule-list

**Files:**
- Modify: `src/slash-commands/teams/handlers/teams.command-handler.spec.ts`
- Modify: `src/slash-commands/teams/handlers/teams.command-handler.ts`

- [ ] **Step 1: Write failing tests**

Add this describe block:

```typescript
describe('schedule-list subcommand', () => {
  const now = Timestamp.now();
  const team = {
    guildId: 'guild-id',
    teamId: 'member-role-id',
    active: true,
    memberRoleId: 'member-role-id',
    leaderUserId: 'coordinator-id',
    createdAt: now,
    updatedAt: now,
  };
  const session = {
    guildId: 'guild-id',
    sessionId: 's1',
    teamId: 'member-role-id',
    active: true,
    dayOfWeek: 5 as const,
    startTime: '20:00',
    durationMinutes: 120,
    timezone: 'America/Denver',
    createdAt: now,
    updatedAt: now,
  };

  it('returns an embed with one field per session', async () => {
    helperTeamCollection.getByMemberRole.mockResolvedValueOnce(team);
    sessionCollection.getActiveForTeams.mockResolvedValueOnce([session]);

    const interaction = {
      guildId: 'guild-id',
      user: { id: 'coordinator-id' },
      options: {
        getSubcommand: () => 'schedule-list',
        getRole: (name: string) =>
          name === 'member-role' ? { id: 'member-role-id' } : null,
      },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    await handler.execute({ interaction });

    expect(sessionCollection.getActiveForTeams).toHaveBeenCalledWith(
      'guild-id',
      ['member-role-id'],
    );

    const replyArg = (interaction.editReply as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as {
      embeds: {
        data: { title: string; fields: { name: string; value: string }[] };
      }[];
    };
    expect(replyArg.embeds[0].data.title).toContain('member-role-id');
    expect(replyArg.embeds[0].data.fields[0].name).toContain('Fri');
    expect(replyArg.embeds[0].data.fields[0].name).toContain('20:00');
    expect(replyArg.embeds[0].data.fields[0].value).toContain('America/Denver');
  });

  it('replies with no-sessions message when team has no active sessions', async () => {
    helperTeamCollection.getByMemberRole.mockResolvedValueOnce(team);
    sessionCollection.getActiveForTeams.mockResolvedValueOnce([]);

    const interaction = {
      guildId: 'guild-id',
      user: { id: 'coordinator-id' },
      options: {
        getSubcommand: () => 'schedule-list',
        getRole: (name: string) =>
          name === 'member-role' ? { id: 'member-role-id' } : null,
      },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    await handler.execute({ interaction });

    expect(interaction.editReply).toHaveBeenCalledWith(
      'No active sessions for this team.',
    );
  });

  it('rejects when no team is configured for the role', async () => {
    helperTeamCollection.getByMemberRole.mockResolvedValueOnce(undefined);

    const interaction = {
      guildId: 'guild-id',
      user: { id: 'coordinator-id' },
      options: {
        getSubcommand: () => 'schedule-list',
        getRole: (name: string) =>
          name === 'member-role' ? { id: 'role-id' } : null,
      },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    await handler.execute({ interaction });

    expect(interaction.editReply).toHaveBeenCalledWith(
      'No team is configured for the role <@&role-id>.',
    );
  });

  it('rejects when coordinator is not the team leader', async () => {
    helperTeamCollection.getByMemberRole.mockResolvedValueOnce({
      ...team,
      leaderUserId: 'someone-else-id',
    });

    const interaction = {
      guildId: 'guild-id',
      user: { id: 'coordinator-id' },
      options: {
        getSubcommand: () => 'schedule-list',
        getRole: (name: string) =>
          name === 'member-role' ? { id: 'member-role-id' } : null,
      },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    await handler.execute({ interaction });

    expect(interaction.editReply).toHaveBeenCalledWith(
      'You are not the leader of the <@&member-role-id> team.',
    );
    expect(sessionCollection.getActiveForTeams).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
rtk pnpm vitest run teams.command-handler
```

Expected: 4 new tests FAIL

- [ ] **Step 3: Implement handleScheduleList**

Replace the stub `handleScheduleList` with:

```typescript
private async handleScheduleList(
  interaction: TeamsCommand['interaction'],
): Promise<void> {
  const memberRole = interaction.options.getRole('member-role', true);

  const team = await this.helperTeamCollection.getByMemberRole(
    interaction.guildId,
    memberRole.id,
  );
  if (!team) {
    await interaction.editReply(
      `No team is configured for the role <@&${memberRole.id}>.`,
    );
    return;
  }

  if (team.leaderUserId !== interaction.user.id) {
    await interaction.editReply(
      `You are not the leader of the <@&${team.memberRoleId}> team.`,
    );
    return;
  }

  const sessions = await this.sessionCollection.getActiveForTeams(
    interaction.guildId,
    [team.teamId],
  );
  if (sessions.length === 0) {
    await interaction.editReply('No active sessions for this team.');
    return;
  }

  const embed = new EmbedBuilder().setTitle(
    `<@&${team.memberRoleId}> — Schedule`,
  );

  for (const session of sessions) {
    let nextLine: string;
    try {
      const occurrence = getNextOccurrence({
        ...session,
        now: Temporal.Now.instant(),
      });
      nextLine = `Next: ${formatDiscordTimestamp(occurrence.unixSeconds, 'f')} (${formatDiscordTimestamp(occurrence.unixSeconds, 'R')})`;
    } catch {
      nextLine = 'Next: unavailable';
    }
    embed.addFields({
      name: `${DAY_NAMES[session.dayOfWeek]} at ${session.startTime} (${session.durationMinutes}min)`,
      value: `Timezone: ${session.timezone}\n${nextLine}`,
      inline: false,
    });
  }

  await interaction.editReply({ embeds: [embed] });
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
rtk pnpm vitest run teams.command-handler
```

Expected: all tests pass

- [ ] **Step 5: Typecheck**

```bash
rtk pnpm typecheck
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
rtk git add src/slash-commands/teams/handlers/teams.command-handler.ts \
            src/slash-commands/teams/handlers/teams.command-handler.spec.ts
rtk git commit -m "feat: implement /teams schedule-list subcommand"
```

---

### Task 5: Implement and test schedule-remove

**Files:**
- Modify: `src/slash-commands/teams/handlers/teams.command-handler.spec.ts`
- Modify: `src/slash-commands/teams/handlers/teams.command-handler.ts`

- [ ] **Step 1: Write failing tests**

Add this describe block:

```typescript
describe('schedule-remove subcommand', () => {
  const now = Timestamp.now();
  const team = {
    guildId: 'guild-id',
    teamId: 'member-role-id',
    active: true,
    memberRoleId: 'member-role-id',
    leaderUserId: 'coordinator-id',
    createdAt: now,
    updatedAt: now,
  };
  const session = {
    guildId: 'guild-id',
    sessionId: 's1',
    teamId: 'member-role-id',
    active: true,
    dayOfWeek: 5 as const,
    startTime: '20:00',
    durationMinutes: 120,
    timezone: 'America/Denver',
    createdAt: now,
    updatedAt: now,
  };

  it('shows a select menu with active sessions', async () => {
    helperTeamCollection.getByMemberRole.mockResolvedValueOnce(team);
    sessionCollection.getActiveForTeams.mockResolvedValueOnce([session]);

    const componentInteraction = { values: ['s1'], deferUpdate: vi.fn() };
    const replyMessage = {
      awaitMessageComponent: vi.fn().mockResolvedValue(componentInteraction),
    };
    const interaction = {
      guildId: 'guild-id',
      user: { id: 'coordinator-id' },
      options: {
        getSubcommand: () => 'schedule-remove',
        getRole: (name: string) =>
          name === 'member-role' ? { id: 'member-role-id' } : null,
      },
      deferReply: vi.fn(),
      editReply: vi.fn().mockResolvedValue(replyMessage),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    await handler.execute({ interaction });

    const firstCall = (interaction.editReply as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(firstCall).toMatchObject({ components: expect.any(Array) });
  });

  it('archives the selected session and replies with success', async () => {
    helperTeamCollection.getByMemberRole.mockResolvedValueOnce(team);
    sessionCollection.getActiveForTeams.mockResolvedValueOnce([session]);

    const componentInteraction = { values: ['s1'], deferUpdate: vi.fn() };
    const replyMessage = {
      awaitMessageComponent: vi.fn().mockResolvedValue(componentInteraction),
    };
    const interaction = {
      guildId: 'guild-id',
      user: { id: 'coordinator-id' },
      options: {
        getSubcommand: () => 'schedule-remove',
        getRole: (name: string) =>
          name === 'member-role' ? { id: 'member-role-id' } : null,
      },
      deferReply: vi.fn(),
      editReply: vi.fn().mockResolvedValue(replyMessage),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    await handler.execute({ interaction });

    expect(sessionCollection.archive).toHaveBeenCalledWith('guild-id', 's1');
    expect(interaction.editReply).toHaveBeenLastCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('removed'),
        components: [],
      }),
    );
  });

  it('replies with timeout when selection times out', async () => {
    helperTeamCollection.getByMemberRole.mockResolvedValueOnce(team);
    sessionCollection.getActiveForTeams.mockResolvedValueOnce([session]);

    const replyMessage = {
      awaitMessageComponent: vi.fn().mockRejectedValue({
        code: DiscordjsErrorCodes.InteractionCollectorError,
      }),
    };
    const interaction = {
      guildId: 'guild-id',
      user: { id: 'coordinator-id' },
      options: {
        getSubcommand: () => 'schedule-remove',
        getRole: (name: string) =>
          name === 'member-role' ? { id: 'member-role-id' } : null,
      },
      deferReply: vi.fn(),
      editReply: vi.fn().mockResolvedValue(replyMessage),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    await handler.execute({ interaction });

    expect(interaction.editReply).toHaveBeenLastCalledWith({
      content: 'Selection timed out.',
      components: [],
    });
    expect(sessionCollection.archive).not.toHaveBeenCalled();
  });

  it('replies with no-sessions message when team has no active sessions', async () => {
    helperTeamCollection.getByMemberRole.mockResolvedValueOnce(team);
    sessionCollection.getActiveForTeams.mockResolvedValueOnce([]);

    const interaction = {
      guildId: 'guild-id',
      user: { id: 'coordinator-id' },
      options: {
        getSubcommand: () => 'schedule-remove',
        getRole: (name: string) =>
          name === 'member-role' ? { id: 'member-role-id' } : null,
      },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    await handler.execute({ interaction });

    expect(interaction.editReply).toHaveBeenCalledWith(
      'No active sessions for this team.',
    );
  });

  it('rejects when no team is configured for the role', async () => {
    helperTeamCollection.getByMemberRole.mockResolvedValueOnce(undefined);

    const interaction = {
      guildId: 'guild-id',
      user: { id: 'coordinator-id' },
      options: {
        getSubcommand: () => 'schedule-remove',
        getRole: (name: string) =>
          name === 'member-role' ? { id: 'role-id' } : null,
      },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    await handler.execute({ interaction });

    expect(interaction.editReply).toHaveBeenCalledWith(
      'No team is configured for the role <@&role-id>.',
    );
  });

  it('rejects when coordinator is not the team leader', async () => {
    helperTeamCollection.getByMemberRole.mockResolvedValueOnce({
      ...team,
      leaderUserId: 'someone-else-id',
    });

    const interaction = {
      guildId: 'guild-id',
      user: { id: 'coordinator-id' },
      options: {
        getSubcommand: () => 'schedule-remove',
        getRole: (name: string) =>
          name === 'member-role' ? { id: 'member-role-id' } : null,
      },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    await handler.execute({ interaction });

    expect(interaction.editReply).toHaveBeenCalledWith(
      'You are not the leader of the <@&member-role-id> team.',
    );
    expect(sessionCollection.getActiveForTeams).not.toHaveBeenCalled();
  });
});
```

Add this import to the spec file's import block:

```typescript
import { DiscordjsErrorCodes } from 'discord.js';
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
rtk pnpm vitest run teams.command-handler
```

Expected: 6 new tests FAIL

- [ ] **Step 3: Implement handleScheduleRemove**

Replace the stub `handleScheduleRemove` with:

```typescript
private async handleScheduleRemove(
  interaction: TeamsCommand['interaction'],
): Promise<void> {
  const memberRole = interaction.options.getRole('member-role', true);

  const team = await this.helperTeamCollection.getByMemberRole(
    interaction.guildId,
    memberRole.id,
  );
  if (!team) {
    await interaction.editReply(
      `No team is configured for the role <@&${memberRole.id}>.`,
    );
    return;
  }

  if (team.leaderUserId !== interaction.user.id) {
    await interaction.editReply(
      `You are not the leader of the <@&${team.memberRoleId}> team.`,
    );
    return;
  }

  const sessions = await this.sessionCollection.getActiveForTeams(
    interaction.guildId,
    [team.teamId],
  );
  if (sessions.length === 0) {
    await interaction.editReply('No active sessions for this team.');
    return;
  }

  const options = sessions.map((s) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(
        `${DAY_NAMES[s.dayOfWeek]} ${s.startTime} — ${s.durationMinutes}min (${s.timezone})`,
      )
      .setValue(s.sessionId),
  );

  const select = new StringSelectMenuBuilder()
    .setCustomId('schedule-remove-select')
    .setPlaceholder('Select a session to remove')
    .addOptions(options);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    select,
  );

  const replyMessage = await interaction.editReply({ components: [row] });

  let componentInteraction: Awaited<
    ReturnType<
      typeof replyMessage.awaitMessageComponent<ComponentType.StringSelect>
    >
  >;
  try {
    componentInteraction =
      await replyMessage.awaitMessageComponent<ComponentType.StringSelect>({
        filter: isSameUserFilter(interaction.user),
        time: 60_000,
      });
  } catch (error: unknown) {
    if (
      error !== null &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === DiscordjsErrorCodes.InteractionCollectorError
    ) {
      await interaction.editReply({
        content: 'Selection timed out.',
        components: [],
      });
      return;
    }
    throw error;
  }

  await componentInteraction.deferUpdate();

  const sessionId = componentInteraction.values[0];
  await this.sessionCollection.archive(interaction.guildId, sessionId);

  const session = sessions.find((s) => s.sessionId === sessionId);
  const label = session
    ? `${DAY_NAMES[session.dayOfWeek]} ${session.startTime}`
    : sessionId;

  await interaction.editReply({
    content: `Session **${label}** removed.`,
    components: [],
  });
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
rtk pnpm vitest run teams.command-handler
```

Expected: all tests pass

- [ ] **Step 5: Typecheck**

```bash
rtk pnpm typecheck
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
rtk git add src/slash-commands/teams/handlers/teams.command-handler.ts \
            src/slash-commands/teams/handlers/teams.command-handler.spec.ts
rtk git commit -m "feat: implement /teams schedule-remove subcommand"
```

---

### Task 6: Implement and test schedule-edit

**Files:**
- Modify: `src/slash-commands/teams/handlers/teams.command-handler.spec.ts`
- Modify: `src/slash-commands/teams/handlers/teams.command-handler.ts`

- [ ] **Step 1: Write failing tests**

Add this describe block:

```typescript
describe('schedule-edit subcommand', () => {
  const now = Timestamp.now();
  const team = {
    guildId: 'guild-id',
    teamId: 'member-role-id',
    active: true,
    memberRoleId: 'member-role-id',
    leaderUserId: 'coordinator-id',
    createdAt: now,
    updatedAt: now,
  };
  const session = {
    guildId: 'guild-id',
    sessionId: 's1',
    teamId: 'member-role-id',
    active: true,
    dayOfWeek: 5 as const,
    startTime: '20:00',
    durationMinutes: 120,
    timezone: 'America/Denver',
    createdAt: now,
    updatedAt: now,
  };

  it('shows a select menu with active sessions', async () => {
    helperTeamCollection.getByMemberRole.mockResolvedValueOnce(team);
    sessionCollection.getActiveForTeams.mockResolvedValueOnce([session]);

    const componentInteraction = { values: ['s1'], deferUpdate: vi.fn() };
    const replyMessage = {
      awaitMessageComponent: vi.fn().mockResolvedValue(componentInteraction),
    };
    const interaction = {
      guildId: 'guild-id',
      user: { id: 'coordinator-id' },
      options: {
        getSubcommand: () => 'schedule-edit',
        getRole: (name: string) =>
          name === 'member-role' ? { id: 'member-role-id' } : null,
        getInteger: () => null,
        getString: () => null,
      },
      deferReply: vi.fn(),
      editReply: vi.fn().mockResolvedValue(replyMessage),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    await handler.execute({ interaction });

    const firstCall = (interaction.editReply as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(firstCall).toMatchObject({ components: expect.any(Array) });
  });

  it('upserts the session with provided field values', async () => {
    helperTeamCollection.getByMemberRole.mockResolvedValueOnce(team);
    sessionCollection.getActiveForTeams.mockResolvedValueOnce([session]);

    const componentInteraction = { values: ['s1'], deferUpdate: vi.fn() };
    const replyMessage = {
      awaitMessageComponent: vi.fn().mockResolvedValue(componentInteraction),
    };
    const interaction = {
      guildId: 'guild-id',
      user: { id: 'coordinator-id' },
      options: {
        getSubcommand: () => 'schedule-edit',
        getRole: (name: string) =>
          name === 'member-role' ? { id: 'member-role-id' } : null,
        getInteger: (name: string) => {
          if (name === 'day-of-week') return 6;
          if (name === 'duration-minutes') return 90;
          return null;
        },
        getString: (name: string) => {
          if (name === 'start-time') return '21:00';
          if (name === 'timezone') return 'UTC';
          return null;
        },
      },
      deferReply: vi.fn(),
      editReply: vi.fn().mockResolvedValue(replyMessage),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    await handler.execute({ interaction });

    expect(sessionCollection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 's1',
        dayOfWeek: 6,
        startTime: '21:00',
        durationMinutes: 90,
        timezone: 'UTC',
      }),
    );
    expect(interaction.editReply).toHaveBeenLastCalledWith(
      expect.objectContaining({ content: 'Session updated.', components: [] }),
    );
  });

  it('keeps existing field values when options are not provided', async () => {
    helperTeamCollection.getByMemberRole.mockResolvedValueOnce(team);
    sessionCollection.getActiveForTeams.mockResolvedValueOnce([session]);

    const componentInteraction = { values: ['s1'], deferUpdate: vi.fn() };
    const replyMessage = {
      awaitMessageComponent: vi.fn().mockResolvedValue(componentInteraction),
    };
    const interaction = {
      guildId: 'guild-id',
      user: { id: 'coordinator-id' },
      options: {
        getSubcommand: () => 'schedule-edit',
        getRole: (name: string) =>
          name === 'member-role' ? { id: 'member-role-id' } : null,
        getInteger: () => null,
        getString: () => null,
      },
      deferReply: vi.fn(),
      editReply: vi.fn().mockResolvedValue(replyMessage),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    await handler.execute({ interaction });

    expect(sessionCollection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 's1',
        dayOfWeek: 5,
        startTime: '20:00',
        durationMinutes: 120,
        timezone: 'America/Denver',
      }),
    );
  });

  it('rejects with invalid-time error before any Firestore reads', async () => {
    const interaction = {
      guildId: 'guild-id',
      user: { id: 'coordinator-id' },
      options: {
        getSubcommand: () => 'schedule-edit',
        getRole: (name: string) =>
          name === 'member-role' ? { id: 'member-role-id' } : null,
        getInteger: () => null,
        getString: (name: string) =>
          name === 'start-time' ? 'not-a-time' : null,
      },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    await handler.execute({ interaction });

    expect(interaction.editReply).toHaveBeenCalledWith(
      'Invalid start time. Use HH:mm format (e.g. 20:00).',
    );
    expect(helperTeamCollection.getByMemberRole).not.toHaveBeenCalled();
    expect(sessionCollection.upsert).not.toHaveBeenCalled();
  });

  it('replies with timeout when selection times out', async () => {
    helperTeamCollection.getByMemberRole.mockResolvedValueOnce(team);
    sessionCollection.getActiveForTeams.mockResolvedValueOnce([session]);

    const replyMessage = {
      awaitMessageComponent: vi.fn().mockRejectedValue({
        code: DiscordjsErrorCodes.InteractionCollectorError,
      }),
    };
    const interaction = {
      guildId: 'guild-id',
      user: { id: 'coordinator-id' },
      options: {
        getSubcommand: () => 'schedule-edit',
        getRole: (name: string) =>
          name === 'member-role' ? { id: 'member-role-id' } : null,
        getInteger: () => null,
        getString: () => null,
      },
      deferReply: vi.fn(),
      editReply: vi.fn().mockResolvedValue(replyMessage),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    await handler.execute({ interaction });

    expect(interaction.editReply).toHaveBeenLastCalledWith({
      content: 'Selection timed out.',
      components: [],
    });
    expect(sessionCollection.upsert).not.toHaveBeenCalled();
  });

  it('replies with no-sessions message when team has no active sessions', async () => {
    helperTeamCollection.getByMemberRole.mockResolvedValueOnce(team);
    sessionCollection.getActiveForTeams.mockResolvedValueOnce([]);

    const interaction = {
      guildId: 'guild-id',
      user: { id: 'coordinator-id' },
      options: {
        getSubcommand: () => 'schedule-edit',
        getRole: (name: string) =>
          name === 'member-role' ? { id: 'member-role-id' } : null,
        getInteger: () => null,
        getString: () => null,
      },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    await handler.execute({ interaction });

    expect(interaction.editReply).toHaveBeenCalledWith(
      'No active sessions for this team.',
    );
  });

  it('rejects when no team is configured for the role', async () => {
    helperTeamCollection.getByMemberRole.mockResolvedValueOnce(undefined);

    const interaction = {
      guildId: 'guild-id',
      user: { id: 'coordinator-id' },
      options: {
        getSubcommand: () => 'schedule-edit',
        getRole: (name: string) =>
          name === 'member-role' ? { id: 'role-id' } : null,
        getInteger: () => null,
        getString: () => null,
      },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    await handler.execute({ interaction });

    expect(interaction.editReply).toHaveBeenCalledWith(
      'No team is configured for the role <@&role-id>.',
    );
  });

  it('rejects when coordinator is not the team leader', async () => {
    helperTeamCollection.getByMemberRole.mockResolvedValueOnce({
      ...team,
      leaderUserId: 'someone-else-id',
    });

    const interaction = {
      guildId: 'guild-id',
      user: { id: 'coordinator-id' },
      options: {
        getSubcommand: () => 'schedule-edit',
        getRole: (name: string) =>
          name === 'member-role' ? { id: 'member-role-id' } : null,
        getInteger: () => null,
        getString: () => null,
      },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    await handler.execute({ interaction });

    expect(interaction.editReply).toHaveBeenCalledWith(
      'You are not the leader of the <@&member-role-id> team.',
    );
    expect(sessionCollection.getActiveForTeams).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
rtk pnpm vitest run teams.command-handler
```

Expected: 8 new tests FAIL

- [ ] **Step 3: Implement handleScheduleEdit**

Replace the stub `handleScheduleEdit` with:

```typescript
private async handleScheduleEdit(
  interaction: TeamsCommand['interaction'],
): Promise<void> {
  const memberRole = interaction.options.getRole('member-role', true);
  const rawDay = interaction.options.getInteger('day-of-week');
  const startTime = interaction.options.getString('start-time');
  const durationMinutes = interaction.options.getInteger('duration-minutes');
  const timezone = interaction.options.getString('timezone');

  if (startTime !== null && !isValidTime(startTime)) {
    await interaction.editReply(
      'Invalid start time. Use HH:mm format (e.g. 20:00).',
    );
    return;
  }

  const team = await this.helperTeamCollection.getByMemberRole(
    interaction.guildId,
    memberRole.id,
  );
  if (!team) {
    await interaction.editReply(
      `No team is configured for the role <@&${memberRole.id}>.`,
    );
    return;
  }

  if (team.leaderUserId !== interaction.user.id) {
    await interaction.editReply(
      `You are not the leader of the <@&${team.memberRoleId}> team.`,
    );
    return;
  }

  const sessions = await this.sessionCollection.getActiveForTeams(
    interaction.guildId,
    [team.teamId],
  );
  if (sessions.length === 0) {
    await interaction.editReply('No active sessions for this team.');
    return;
  }

  const options = sessions.map((s) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(
        `${DAY_NAMES[s.dayOfWeek]} ${s.startTime} — ${s.durationMinutes}min (${s.timezone})`,
      )
      .setValue(s.sessionId),
  );

  const select = new StringSelectMenuBuilder()
    .setCustomId('schedule-edit-select')
    .setPlaceholder('Select a session to edit')
    .addOptions(options);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    select,
  );

  const replyMessage = await interaction.editReply({ components: [row] });

  let componentInteraction: Awaited<
    ReturnType<
      typeof replyMessage.awaitMessageComponent<ComponentType.StringSelect>
    >
  >;
  try {
    componentInteraction =
      await replyMessage.awaitMessageComponent<ComponentType.StringSelect>({
        filter: isSameUserFilter(interaction.user),
        time: 60_000,
      });
  } catch (error: unknown) {
    if (
      error !== null &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === DiscordjsErrorCodes.InteractionCollectorError
    ) {
      await interaction.editReply({
        content: 'Selection timed out.',
        components: [],
      });
      return;
    }
    throw error;
  }

  await componentInteraction.deferUpdate();

  const sessionId = componentInteraction.values[0];
  const session = sessions.find((s) => s.sessionId === sessionId);
  if (!session) {
    await interaction.editReply({
      content: 'That session is no longer active.',
      components: [],
    });
    return;
  }

  await this.sessionCollection.upsert({
    ...session,
    dayOfWeek:
      rawDay !== null
        ? (rawDay as 1 | 2 | 3 | 4 | 5 | 6 | 7)
        : session.dayOfWeek,
    startTime: startTime ?? session.startTime,
    durationMinutes: durationMinutes ?? session.durationMinutes,
    timezone: timezone ?? session.timezone,
  });

  await interaction.editReply({ content: 'Session updated.', components: [] });
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
rtk pnpm vitest run teams.command-handler
```

Expected: all tests pass

- [ ] **Step 5: Run the full test suite**

```bash
rtk pnpm test:ci
```

Expected: all tests pass

- [ ] **Step 6: Typecheck**

```bash
rtk pnpm typecheck
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
rtk git add src/slash-commands/teams/handlers/teams.command-handler.ts \
            src/slash-commands/teams/handlers/teams.command-handler.spec.ts
rtk git commit -m "feat: implement /teams schedule-edit subcommand"
```
