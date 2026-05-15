# Teams Leader User Select Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `leader-role` Discord role option on `/teams create` with a `leader` Discord user option, and add an optional `leader` user option to `/teams edit`, so the team leader is a single named user rather than everyone holding a role.

**Architecture:** Rename `leaderRoleId` → `leaderUserId` in the data model and propagate through the membership service and command handler. No data migration — Firestore is fresh. Two independent units of change: (1) model + membership service, (2) slash command definition + command handler.

**Tech Stack:** NestJS, Discord.js v14, Firebase Admin Firestore, Vitest

---

## File Map

| File | Change |
|---|---|
| `src/firebase/models/helper-team.model.ts` | Rename field `leaderRoleId` → `leaderUserId` |
| `src/firebase/collections/helper-team.collection.spec.ts` | Update fixture field name |
| `src/helper-team/helper-team-membership.service.ts` | Rename interface field; update leader check |
| `src/helper-team/helper-team-membership.service.spec.ts` | Update fixtures and assertions |
| `src/slash-commands/teams/teams.slash-command.ts` | Replace role option; add user option to edit |
| `src/slash-commands/teams/handlers/teams.command-handler.ts` | Update `handleCreate`, `handleEdit`, `handleMembers` |
| `src/slash-commands/teams/handlers/teams.command-handler.spec.ts` | Update create/members tests; add edit test |

---

## Task 1: Update data model and membership service

**Files:**
- Modify: `src/firebase/models/helper-team.model.ts`
- Modify: `src/firebase/collections/helper-team.collection.spec.ts`
- Modify: `src/helper-team/helper-team-membership.service.ts`
- Test: `src/helper-team/helper-team-membership.service.spec.ts`

- [ ] **Step 1: Update membership service spec fixtures and tests**

Replace the entire contents of `src/helper-team/helper-team-membership.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import type { GuildMember } from 'discord.js';
import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, type Mocked } from 'vitest';
import { DiscordService } from '../discord/discord.service.js';
import { HelperTeamCollection } from '../firebase/collections/helper-team.collection.js';
import { createAutoMock } from '../test-utils/mock-factory.js';
import { HelperTeamMembershipService } from './helper-team-membership.service.js';

describe('HelperTeamMembershipService', () => {
  let service: HelperTeamMembershipService;
  let helperTeamCollection: Mocked<HelperTeamCollection>;
  let discordService: Mocked<DiscordService>;

  const now = Timestamp.now();

  const alphaTeam = {
    guildId: 'guild-id',
    teamId: 'alpha',
    name: 'Alpha',
    active: true,
    memberRoleId: 'alpha-member-role',
    leaderUserId: 'alpha-leader-user',
    createdAt: now,
    updatedAt: now,
  };

  const bravoTeam = {
    guildId: 'guild-id',
    teamId: 'bravo',
    name: 'Bravo',
    active: true,
    memberRoleId: 'bravo-member-role',
    leaderUserId: 'bravo-leader-user',
    createdAt: now,
    updatedAt: now,
  };

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [HelperTeamMembershipService],
    })
      .useMocker(createAutoMock)
      .compile();

    service = fixture.get(HelperTeamMembershipService);
    helperTeamCollection = fixture.get(HelperTeamCollection);
    discordService = fixture.get(DiscordService);
  });

  it('returns leader role for team where discordId matches leaderUserId', async () => {
    helperTeamCollection.getActiveForGuild.mockResolvedValueOnce([
      alphaTeam,
      bravoTeam,
    ]);

    const member = {
      roles: {
        cache: {
          has: (roleId: string) => roleId === 'bravo-member-role',
        },
      },
    } as unknown as GuildMember;
    discordService.getGuildMember.mockResolvedValueOnce(member);

    const result = await service.getMembershipsForUser(
      'guild-id',
      'alpha-leader-user',
    );

    expect(result).toEqual([
      {
        teamId: 'alpha',
        teamName: 'Alpha',
        memberRoleId: 'alpha-member-role',
        leaderUserId: 'alpha-leader-user',
        role: 'leader',
      },
      {
        teamId: 'bravo',
        teamName: 'Bravo',
        memberRoleId: 'bravo-member-role',
        leaderUserId: 'bravo-leader-user',
        role: 'member',
      },
    ]);
  });

  it('returns empty array when user is not a member of any team', async () => {
    helperTeamCollection.getActiveForGuild.mockResolvedValueOnce([alphaTeam]);

    const member = {
      roles: { cache: { has: () => false } },
    } as unknown as GuildMember;
    discordService.getGuildMember.mockResolvedValueOnce(member);

    const result = await service.getMembershipsForUser('guild-id', 'nobody');
    expect(result).toEqual([]);
  });

  it('returns empty array when guild member not found', async () => {
    helperTeamCollection.getActiveForGuild.mockResolvedValueOnce([alphaTeam]);
    discordService.getGuildMember.mockResolvedValueOnce(undefined);

    const result = await service.getMembershipsForUser('guild-id', 'nobody');
    expect(result).toEqual([]);
  });

  it('prefers leader when discordId matches leaderUserId and user also has member role', async () => {
    helperTeamCollection.getActiveForGuild.mockResolvedValueOnce([alphaTeam]);

    const member = {
      roles: { cache: { has: () => true } },
    } as unknown as GuildMember;
    discordService.getGuildMember.mockResolvedValueOnce(member);

    const result = await service.getMembershipsForUser(
      'guild-id',
      'alpha-leader-user',
    );
    expect(result[0].role).toBe('leader');
  });
});
```

- [ ] **Step 2: Run membership service tests — expect failures**

```bash
pnpm vitest run src/helper-team/helper-team-membership.service.spec.ts
```

Expected: tests fail because the service and model still use `leaderRoleId`.

- [ ] **Step 3: Rename field in the data model**

In `src/firebase/models/helper-team.model.ts`, change line 10:

```diff
-  leaderRoleId: string;
+  leaderUserId: string;
```

- [ ] **Step 4: Update membership service interface and implementation**

In `src/helper-team/helper-team-membership.service.ts`, make these two changes:

Change the `HelperTeamMembership` interface (around line 10):
```diff
-  leaderRoleId: string;
+  leaderUserId: string;
```

Change the body of `getMembershipsForUser` where it checks leader status and builds the result (around lines 35–47):
```diff
-      const isLeader = member.roles.cache.has(team.leaderRoleId);
+      const isLeader = discordId === team.leaderUserId;
       const isMember = member.roles.cache.has(team.memberRoleId);

       if (isLeader || isMember) {
         memberships.push({
           teamId: team.teamId,
           teamName: team.name,
           memberRoleId: team.memberRoleId,
-          leaderRoleId: team.leaderRoleId,
+          leaderUserId: team.leaderUserId,
           role: isLeader ? 'leader' : 'member',
         });
       }
```

- [ ] **Step 5: Update collection spec fixture**

In `src/firebase/collections/helper-team.collection.spec.ts`, change line 62:

```diff
-      leaderRoleId: 'leader-role',
+      leaderUserId: 'leader-user',
```

- [ ] **Step 6: Run typecheck — expect remaining errors only in command handler files**

```bash
pnpm typecheck
```

Expected: errors in `teams.command-handler.ts` and `teams.command-handler.spec.ts` referencing `leaderRoleId`. No errors in model, membership service, or collection spec.

- [ ] **Step 7: Run membership service tests — expect all pass**

```bash
pnpm vitest run src/helper-team/helper-team-membership.service.spec.ts
```

Expected: 4 tests pass.

- [ ] **Step 8: Run collection spec — expect pass**

```bash
pnpm vitest run src/firebase/collections/helper-team.collection.spec.ts
```

Expected: all tests pass.

---

## Task 2: Update slash command definition and command handler

**Files:**
- Modify: `src/slash-commands/teams/teams.slash-command.ts`
- Modify: `src/slash-commands/teams/handlers/teams.command-handler.ts`
- Test: `src/slash-commands/teams/handlers/teams.command-handler.spec.ts`

- [ ] **Step 1: Update command handler spec**

Replace the entire contents of `src/slash-commands/teams/handlers/teams.command-handler.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import type { ChatInputCommandInteraction, GuildMember } from 'discord.js';
import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { DiscordService } from '../../../discord/discord.service.js';
import { HelperTeamCollection } from '../../../firebase/collections/helper-team.collection.js';
import { HelperTeamAuthorizationService } from '../../../helper-team/helper-team-authorization.service.js';
import { createAutoMock } from '../../../test-utils/mock-factory.js';
import { TeamsCommandHandler } from './teams.command-handler.js';

describe('TeamsCommandHandler', () => {
  let handler: TeamsCommandHandler;
  let helperTeamCollection: Mocked<HelperTeamCollection>;
  let authorizationService: Mocked<HelperTeamAuthorizationService>;
  let discordService: Mocked<DiscordService>;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [TeamsCommandHandler],
    })
      .useMocker(createAutoMock)
      .compile();

    handler = fixture.get(TeamsCommandHandler);
    helperTeamCollection = fixture.get(HelperTeamCollection);
    authorizationService = fixture.get(HelperTeamAuthorizationService);
    discordService = fixture.get(DiscordService);

    authorizationService.isCoordinator.mockResolvedValue(true);
  });

  describe('create subcommand', () => {
    it('upserts a new team with a leader user and replies with success', async () => {
      const interaction = {
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
            const roles: Record<string, { id: string; name: string }> = {
              'member-role': { id: 'member-role-id', name: 'Alpha Member' },
            };
            return roles[name] ?? null;
          },
          getUser: (name: string) => {
            const users: Record<string, { id: string }> = {
              leader: { id: 'leader-user-id' },
            };
            return users[name] ?? null;
          },
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(helperTeamCollection.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          guildId: 'guild-id',
          name: 'Alpha',
          memberRoleId: 'member-role-id',
          leaderUserId: 'leader-user-id',
          active: true,
        }),
      );
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining('Alpha'),
      );
    });
  });

  describe('edit subcommand', () => {
    it('updates leader when leader option is provided', async () => {
      const now = Timestamp.now();
      helperTeamCollection.get.mockResolvedValueOnce({
        guildId: 'guild-id',
        teamId: 'alpha',
        name: 'Alpha',
        active: true,
        memberRoleId: 'member-role-id',
        leaderUserId: 'old-leader-id',
        createdAt: now,
        updatedAt: now,
      });

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: {
          getSubcommand: () => 'edit',
          getString: (name: string) =>
            name === 'team-id' ? 'alpha' : null,
          getUser: (name: string) =>
            name === 'leader' ? { id: 'new-leader-id' } : null,
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(helperTeamCollection.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ leaderUserId: 'new-leader-id' }),
      );
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining('alpha'),
      );
    });

    it('keeps existing leader when leader option is not provided', async () => {
      const now = Timestamp.now();
      helperTeamCollection.get.mockResolvedValueOnce({
        guildId: 'guild-id',
        teamId: 'alpha',
        name: 'Alpha',
        active: true,
        memberRoleId: 'member-role-id',
        leaderUserId: 'existing-leader-id',
        createdAt: now,
        updatedAt: now,
      });

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: {
          getSubcommand: () => 'edit',
          getString: (name: string) =>
            name === 'team-id' ? 'alpha' : null,
          getUser: () => null,
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(helperTeamCollection.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ leaderUserId: 'existing-leader-id' }),
      );
    });
  });

  describe('members subcommand', () => {
    it('shows leader mention and role members in embed', async () => {
      const now = Timestamp.now();
      helperTeamCollection.get.mockResolvedValueOnce({
        guildId: 'guild-id',
        teamId: 'alpha',
        name: 'Alpha',
        active: true,
        memberRoleId: 'member-role-id',
        leaderUserId: 'leader-user-id',
        createdAt: now,
        updatedAt: now,
      });

      const mockMember = {
        displayName: 'TestUser',
        user: { id: 'member-1' },
      } as unknown as GuildMember;
      discordService.getMembersWithRole.mockResolvedValue([mockMember]);

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: {
          getSubcommand: () => 'members',
          getString: (name: string) => (name === 'team-id' ? 'alpha' : null),
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(discordService.getMembersWithRole).toHaveBeenCalledTimes(1);
      expect(discordService.getMembersWithRole).toHaveBeenCalledWith({
        guildId: 'guild-id',
        roleId: 'member-role-id',
      });

      const replyArg = (
        interaction.editReply as ReturnType<typeof vi.fn>
      ).mock.calls[0][0] as { embeds: { data: { fields: { name: string; value: string }[] } }[] };
      expect(replyArg.embeds[0].data.fields[0]).toMatchObject({
        name: 'Leader',
        value: '<@leader-user-id>',
      });
    });
  });

  describe('unknown subcommand', () => {
    it('replies with unknown subcommand for unrecognized input', async () => {
      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: {
          getSubcommand: () => 'schedule-add',
          getString: () => null,
          getRole: () => null,
          getUser: () => null,
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining('Unknown subcommand'),
      );
    });
  });

  describe('permission check', () => {
    it('replies with permission denied when user is not a coordinator', async () => {
      authorizationService.isCoordinator.mockResolvedValueOnce(false);

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'user-id' },
        options: {
          getSubcommand: () => 'create',
          getString: () => 'Alpha',
          getRole: () => ({ id: 'role-id', name: 'Role' }),
          getUser: () => null,
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(interaction.editReply).toHaveBeenCalledWith({
        content: 'You do not have permission to use this command.',
      });
      expect(helperTeamCollection.upsert).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run command handler tests — expect failures**

```bash
pnpm vitest run src/slash-commands/teams/handlers/teams.command-handler.spec.ts
```

Expected: existing create test fails (asserts `leaderRoleId`), members test fails (asserts `getMembersWithRole` called once), new edit tests fail (no `getUser` on handler yet).

- [ ] **Step 3: Update slash command definition**

Replace the full contents of `src/slash-commands/teams/teams.slash-command.ts`:

```typescript
import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
} from 'discord.js';

const CreateSubcommand = new SlashCommandSubcommandBuilder()
  .setName('create')
  .setDescription('Create a new helper team')
  .addStringOption((o) =>
    o.setName('name').setDescription('Team name').setRequired(true),
  )
  .addRoleOption((o) =>
    o
      .setName('member-role')
      .setDescription('Role for team members')
      .setRequired(true),
  )
  .addUserOption((o) =>
    o
      .setName('leader')
      .setDescription('Team leader')
      .setRequired(true),
  )
  .addStringOption((o) =>
    o
      .setName('description')
      .setDescription('Team description')
      .setRequired(false),
  );

const EditSubcommand = new SlashCommandSubcommandBuilder()
  .setName('edit')
  .setDescription('Edit an existing helper team')
  .addStringOption((o) =>
    o.setName('team-id').setDescription('Team ID to edit').setRequired(true),
  )
  .addStringOption((o) =>
    o.setName('name').setDescription('New team name').setRequired(false),
  )
  .addStringOption((o) =>
    o
      .setName('description')
      .setDescription('New team description')
      .setRequired(false),
  )
  .addUserOption((o) =>
    o
      .setName('leader')
      .setDescription('New team leader')
      .setRequired(false),
  );

const ArchiveSubcommand = new SlashCommandSubcommandBuilder()
  .setName('archive')
  .setDescription('Archive a helper team')
  .addStringOption((o) =>
    o.setName('team-id').setDescription('Team ID to archive').setRequired(true),
  );

const MembersSubcommand = new SlashCommandSubcommandBuilder()
  .setName('members')
  .setDescription('View members of a helper team')
  .addStringOption((o) =>
    o.setName('team-id').setDescription('Team ID').setRequired(true),
  );

const ViewSubcommand = new SlashCommandSubcommandBuilder()
  .setName('view')
  .setDescription('View all active helper teams');

export const TeamsSlashCommand = new SlashCommandBuilder()
  .setName('teams')
  .setDescription('Manage helper teams')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addSubcommand(CreateSubcommand)
  .addSubcommand(EditSubcommand)
  .addSubcommand(ArchiveSubcommand)
  .addSubcommand(MembersSubcommand)
  .addSubcommand(ViewSubcommand);
```

- [ ] **Step 4: Update command handler**

Replace `handleCreate`, `handleEdit`, and `handleMembers` in `src/slash-commands/teams/handlers/teams.command-handler.ts`:

```typescript
private async handleCreate(
  interaction: TeamsCommand['interaction'],
): Promise<void> {
  const name = interaction.options.getString('name', true);
  const description = interaction.options.getString('description');
  const memberRole = interaction.options.getRole('member-role', true);
  const leaderUser = interaction.options.getUser('leader', true);

  const now = Timestamp.now();
  await this.helperTeamCollection.upsert({
    guildId: interaction.guildId,
    teamId: normalizeTeamId(name),
    name,
    description: description ?? undefined,
    active: true,
    memberRoleId: memberRole.id,
    leaderUserId: leaderUser.id,
    createdAt: now,
    updatedAt: now,
  });

  await interaction.editReply(`Team **${name}** created successfully!`);
}

private async handleEdit(
  interaction: TeamsCommand['interaction'],
): Promise<void> {
  const teamId = interaction.options.getString('team-id', true);
  const name = interaction.options.getString('name');
  const description = interaction.options.getString('description');
  const leaderUser = interaction.options.getUser('leader');

  const team = await this.helperTeamCollection.get(
    interaction.guildId,
    teamId,
  );
  if (!team) {
    await interaction.editReply(`Team \`${teamId}\` not found.`);
    return;
  }

  await this.helperTeamCollection.upsert({
    ...team,
    name: name ?? team.name,
    description: description ?? team.description,
    leaderUserId: leaderUser?.id ?? team.leaderUserId,
    updatedAt: Timestamp.now(),
  });

  await interaction.editReply(`Team \`${teamId}\` updated.`);
}

private async handleMembers(
  interaction: TeamsCommand['interaction'],
): Promise<void> {
  const teamId = interaction.options.getString('team-id', true);
  const team = await this.helperTeamCollection.get(
    interaction.guildId,
    teamId,
  );

  if (!team) {
    await interaction.editReply(`Team \`${teamId}\` not found.`);
    return;
  }

  const members = await this.discordService.getMembersWithRole({
    guildId: interaction.guildId,
    roleId: team.memberRoleId,
  });

  const memberList =
    members.length > 0
      ? members.map((m) => m.displayName).join('\n')
      : 'None';

  const embed = new EmbedBuilder()
    .setTitle(`${team.name} — Members`)
    .addFields(
      { name: 'Leader', value: `<@${team.leaderUserId}>`, inline: true },
      { name: 'Members', value: memberList, inline: true },
    );

  await interaction.editReply({ embeds: [embed] });
}
```

- [ ] **Step 5: Run typecheck — expect clean**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 6: Run command handler tests — expect all pass**

```bash
pnpm vitest run src/slash-commands/teams/handlers/teams.command-handler.spec.ts
```

Expected: all 6 tests pass.

- [ ] **Step 7: Run full test suite — expect all pass**

```bash
pnpm test:ci
```

Expected: all tests pass, no regressions.

- [ ] **Step 8: Commit**

```bash
git add \
  src/firebase/models/helper-team.model.ts \
  src/firebase/collections/helper-team.collection.spec.ts \
  src/helper-team/helper-team-membership.service.ts \
  src/helper-team/helper-team-membership.service.spec.ts \
  src/slash-commands/teams/teams.slash-command.ts \
  src/slash-commands/teams/handlers/teams.command-handler.ts \
  src/slash-commands/teams/handlers/teams.command-handler.spec.ts
git commit -m "feat: replace leader-role with leader user select on /teams create and edit"
```
