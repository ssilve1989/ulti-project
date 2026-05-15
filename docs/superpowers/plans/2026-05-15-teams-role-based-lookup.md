# Teams Role-Based Lookup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `team-id` string input on `/teams edit`, `/teams archive`, and `/teams members` with a Discord role picker, and add 30-day Firestore TTL to archived teams.

**Architecture:** Two independent units of change: (1) the Firestore collection gains a `getByMemberRole` query and the `archive` method gains TTL fields; (2) the slash command definitions and handler private methods swap `getString('team-id')` for `getRole('member-role')`. No data migration needed — Firestore is fresh.

**Tech Stack:** NestJS 11, Discord.js v14, Firebase Admin Firestore, Vitest

---

## File Map

- Modify: `src/firebase/models/helper-team.model.ts` — add `archivedAt?` and `deleteAt?` fields
- Modify: `src/firebase/collections/helper-team.collection.ts` — add `getByMemberRole`; update `archive` to write TTL fields
- Modify: `src/firebase/collections/helper-team.collection.spec.ts` — add tests for `getByMemberRole` and updated `archive`
- Modify: `src/slash-commands/teams/teams.slash-command.ts` — swap string option to role option on `edit`, `archive`, `members`
- Modify: `src/slash-commands/teams/handlers/teams.command-handler.ts` — update `handleEdit`, `handleArchive`, `handleMembers`
- Modify: `src/slash-commands/teams/handlers/teams.command-handler.spec.ts` — update affected tests; add `archive` describe block and no-team error paths

---

## Task 1: Update HelperTeamCollection

**Files:**
- Modify: `src/firebase/models/helper-team.model.ts`
- Modify: `src/firebase/collections/helper-team.collection.ts`
- Modify: `src/firebase/collections/helper-team.collection.spec.ts`

- [ ] **Step 1: Add failing tests for getByMemberRole and updated archive**

Add to the bottom of the `describe('HelperTeamCollection', ...)` block in `src/firebase/collections/helper-team.collection.spec.ts`, before the closing `});`:

```ts
it('gets an active team by member role', async () => {
  const teamData = {
    guildId: 'g1',
    teamId: 'alpha',
    memberRoleId: 'role-123',
    active: true,
  };
  const innerQuery = {
    where: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue({
      docs: [{ data: () => teamData }],
    } as unknown as QuerySnapshot),
  };
  firestoreCollection.where.mockReturnValue(
    innerQuery as unknown as Query<DocumentData>,
  );

  const result = await collection.getByMemberRole('g1', 'role-123');
  expect(result).toEqual(teamData);
});

it('returns undefined when no active team has the given member role', async () => {
  const innerQuery = {
    where: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue({
      docs: [],
    } as unknown as QuerySnapshot),
  };
  firestoreCollection.where.mockReturnValue(
    innerQuery as unknown as Query<DocumentData>,
  );

  const result = await collection.getByMemberRole('g1', 'unknown-role');
  expect(result).toBeUndefined();
});

it('archives a team with archivedAt and deleteAt 30 days out', async () => {
  await collection.archive('g1', 'alpha');

  const updateCall = (doc.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
  expect(updateCall.active).toBe(false);
  expect(updateCall.archivedAt).toBeDefined();
  expect(updateCall.deleteAt).toBeDefined();
  const diffMs =
    updateCall.deleteAt.toDate().getTime() -
    updateCall.archivedAt.toDate().getTime();
  expect(diffMs).toBe(30 * 24 * 60 * 60 * 1000);
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
pnpm vitest run src/firebase/collections/helper-team.collection.spec.ts
```

Expected: `getByMemberRole` tests fail with "collection.getByMemberRole is not a function"; the `archive` test fails because `update` is called with only `{ active: false }`.

- [ ] **Step 3: Add TTL fields to the data model**

In `src/firebase/models/helper-team.model.ts`, add two optional fields to `HelperTeamDocument` after `updatedAt`:

```ts
export interface HelperTeamDocument extends DocumentData {
  guildId: string;
  teamId: string;
  name: string;
  description?: string;
  active: boolean;
  memberRoleId: string;
  leaderUserId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  archivedAt?: Timestamp;
  deleteAt?: Timestamp;
}
```

- [ ] **Step 4: Add getByMemberRole and update archive in HelperTeamCollection**

Replace the full contents of `src/firebase/collections/helper-team.collection.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import {
  type CollectionReference,
  Firestore,
  Timestamp,
} from 'firebase-admin/firestore';
import { InjectFirestore } from '../firebase.decorators.js';
import type { HelperTeamDocument } from '../models/helper-team.model.js';

@Injectable()
export class HelperTeamCollection {
  private readonly collection: CollectionReference<HelperTeamDocument>;

  constructor(@InjectFirestore() firestore: Firestore) {
    this.collection = firestore.collection(
      'helperTeams',
    ) as CollectionReference<HelperTeamDocument>;
  }

  public static getKey({
    guildId,
    teamId,
  }: {
    guildId: string;
    teamId: string;
  }) {
    return `${guildId}-${teamId}`;
  }

  @SentryTraced()
  public async upsert(document: HelperTeamDocument): Promise<void> {
    const key = HelperTeamCollection.getKey(document);
    await this.collection
      .doc(key)
      .set({ ...document, updatedAt: Timestamp.now() }, { merge: true });
  }

  @SentryTraced()
  public async get(
    guildId: string,
    teamId: string,
  ): Promise<HelperTeamDocument | undefined> {
    const key = HelperTeamCollection.getKey({ guildId, teamId });
    const snapshot = await this.collection.doc(key).get();
    return snapshot.data();
  }

  @SentryTraced()
  public async getByMemberRole(
    guildId: string,
    memberRoleId: string,
  ): Promise<HelperTeamDocument | undefined> {
    const snapshot = await this.collection
      .where('guildId', '==', guildId)
      .where('memberRoleId', '==', memberRoleId)
      .where('active', '==', true)
      .get();
    return snapshot.docs[0]?.data();
  }

  @SentryTraced()
  public async getActiveForGuild(
    guildId: string,
  ): Promise<HelperTeamDocument[]> {
    const snapshot = await this.collection
      .where('guildId', '==', guildId)
      .where('active', '==', true)
      .get();
    return snapshot.docs.map((doc) => doc.data());
  }

  @SentryTraced()
  public async archive(guildId: string, teamId: string): Promise<void> {
    const key = HelperTeamCollection.getKey({ guildId, teamId });
    const now = Timestamp.now();
    const deleteAt = Timestamp.fromDate(
      new Date(now.toDate().getTime() + 30 * 24 * 60 * 60 * 1000),
    );
    await this.collection.doc(key).update({
      active: false,
      archivedAt: now,
      deleteAt,
    });
  }
}
```

- [ ] **Step 5: Run collection tests**

```bash
pnpm vitest run src/firebase/collections/helper-team.collection.spec.ts
```

Expected: all tests pass, including the existing `archives a team` test (now updated to verify TTL fields) and the two new `getByMemberRole` tests.

- [ ] **Step 6: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/firebase/models/helper-team.model.ts \
        src/firebase/collections/helper-team.collection.ts \
        src/firebase/collections/helper-team.collection.spec.ts
git commit -m "feat: add getByMemberRole query and 30-day archive TTL to HelperTeamCollection"
```

---

## Task 2: Update Slash Command Definition, Handler, and Spec

**Files:**
- Modify: `src/slash-commands/teams/teams.slash-command.ts`
- Modify: `src/slash-commands/teams/handlers/teams.command-handler.ts`
- Modify: `src/slash-commands/teams/handlers/teams.command-handler.spec.ts`

- [ ] **Step 1: Replace the failing tests**

Replace the full contents of `src/slash-commands/teams/handlers/teams.command-handler.spec.ts`:

```ts
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
      helperTeamCollection.getByMemberRole.mockResolvedValueOnce({
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
          getRole: (name: string) =>
            name === 'member-role'
              ? { id: 'member-role-id', name: 'Alpha Member' }
              : null,
          getString: () => null,
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
        expect.stringContaining('Alpha'),
      );
    });

    it('keeps existing leader when leader option is not provided', async () => {
      const now = Timestamp.now();
      helperTeamCollection.getByMemberRole.mockResolvedValueOnce({
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
          getRole: (name: string) =>
            name === 'member-role'
              ? { id: 'member-role-id', name: 'Alpha Member' }
              : null,
          getString: () => null,
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

    it('replies with error when no team is configured for the role', async () => {
      helperTeamCollection.getByMemberRole.mockResolvedValueOnce(undefined);

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: {
          getSubcommand: () => 'edit',
          getRole: (name: string) =>
            name === 'member-role'
              ? { id: 'role-id', name: 'Unknown Role' }
              : null,
          getString: () => null,
          getUser: () => null,
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining('No team is configured'),
      );
      expect(helperTeamCollection.upsert).not.toHaveBeenCalled();
    });
  });

  describe('archive subcommand', () => {
    it('archives the team matching the given role', async () => {
      const now = Timestamp.now();
      helperTeamCollection.getByMemberRole.mockResolvedValueOnce({
        guildId: 'guild-id',
        teamId: 'alpha',
        name: 'Alpha',
        active: true,
        memberRoleId: 'member-role-id',
        leaderUserId: 'leader-user-id',
        createdAt: now,
        updatedAt: now,
      });

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: {
          getSubcommand: () => 'archive',
          getRole: (name: string) =>
            name === 'member-role'
              ? { id: 'member-role-id', name: 'Alpha Member' }
              : null,
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(helperTeamCollection.archive).toHaveBeenCalledWith(
        'guild-id',
        'alpha',
      );
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining('Alpha'),
      );
    });

    it('replies with error when no team is configured for the role', async () => {
      helperTeamCollection.getByMemberRole.mockResolvedValueOnce(undefined);

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: {
          getSubcommand: () => 'archive',
          getRole: (name: string) =>
            name === 'member-role'
              ? { id: 'role-id', name: 'Unknown Role' }
              : null,
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining('No team is configured'),
      );
      expect(helperTeamCollection.archive).not.toHaveBeenCalled();
    });
  });

  describe('members subcommand', () => {
    it('shows leader mention and role members in embed', async () => {
      const now = Timestamp.now();
      helperTeamCollection.getByMemberRole.mockResolvedValueOnce({
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
          getRole: (name: string) =>
            name === 'member-role'
              ? { id: 'member-role-id', name: 'Alpha Member' }
              : null,
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(discordService.getMembersWithRole).toHaveBeenCalledWith({
        guildId: 'guild-id',
        roleId: 'member-role-id',
      });

      const replyArg = (interaction.editReply as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as {
        embeds: { data: { fields: { name: string; value: string }[] } }[];
      };
      expect(replyArg.embeds[0].data.fields[0]).toMatchObject({
        name: 'Leader',
        value: '<@leader-user-id>',
      });
    });

    it('shows None for members when no members have the role', async () => {
      const now = Timestamp.now();
      helperTeamCollection.getByMemberRole.mockResolvedValueOnce({
        guildId: 'guild-id',
        teamId: 'alpha',
        name: 'Alpha',
        active: true,
        memberRoleId: 'member-role-id',
        leaderUserId: 'leader-user-id',
        createdAt: now,
        updatedAt: now,
      });

      discordService.getMembersWithRole.mockResolvedValue([]);

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: {
          getSubcommand: () => 'members',
          getRole: (name: string) =>
            name === 'member-role'
              ? { id: 'member-role-id', name: 'Alpha Member' }
              : null,
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      const replyArg = (interaction.editReply as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as {
        embeds: { data: { fields: { name: string; value: string }[] } }[];
      };
      expect(replyArg.embeds[0].data.fields[1]).toMatchObject({
        name: 'Members',
        value: 'None',
      });
    });

    it('replies with error when no team is configured for the role', async () => {
      helperTeamCollection.getByMemberRole.mockResolvedValueOnce(undefined);

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: {
          getSubcommand: () => 'members',
          getRole: (name: string) =>
            name === 'member-role'
              ? { id: 'role-id', name: 'Unknown Role' }
              : null,
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining('No team is configured'),
      );
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

- [ ] **Step 2: Run the spec to verify the new tests fail**

```bash
pnpm vitest run src/slash-commands/teams/handlers/teams.command-handler.spec.ts
```

Expected: `edit`, `archive`, and `members` tests fail because the handler still calls `getString('team-id')` / `helperTeamCollection.get`.

- [ ] **Step 3: Update the slash command definition**

Replace the full contents of `src/slash-commands/teams/teams.slash-command.ts`:

```ts
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
    o.setName('leader').setDescription('Team leader').setRequired(true),
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
  .addRoleOption((o) =>
    o
      .setName('member-role')
      .setDescription('Role for the team to edit')
      .setRequired(true),
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

- [ ] **Step 4: Update the command handler**

Replace `handleEdit`, `handleArchive`, and `handleMembers` in `src/slash-commands/teams/handlers/teams.command-handler.ts`:

```ts
private async handleEdit(
  interaction: TeamsCommand['interaction'],
): Promise<void> {
  const memberRole = interaction.options.getRole('member-role', true);
  const name = interaction.options.getString('name');
  const description = interaction.options.getString('description');
  const leaderUser = interaction.options.getUser('leader');

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

  await this.helperTeamCollection.upsert({
    ...team,
    name: name ?? team.name,
    description: description ?? team.description,
    leaderUserId: leaderUser?.id ?? team.leaderUserId,
    updatedAt: Timestamp.now(),
  });

  await interaction.editReply(`Team **${team.name}** updated.`);
}

private async handleArchive(
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

  await this.helperTeamCollection.archive(interaction.guildId, team.teamId);
  await interaction.editReply(`Team **${team.name}** archived.`);
}

private async handleMembers(
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

- [ ] **Step 5: Run the handler tests**

```bash
pnpm vitest run src/slash-commands/teams/handlers/teams.command-handler.spec.ts
```

Expected: all tests pass.

- [ ] **Step 6: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 7: Run the full test suite**

```bash
pnpm test:ci
```

Expected: all tests pass, no regressions.

- [ ] **Step 8: Commit**

```bash
git add src/slash-commands/teams/teams.slash-command.ts \
        src/slash-commands/teams/handlers/teams.command-handler.ts \
        src/slash-commands/teams/handlers/teams.command-handler.spec.ts
git commit -m "feat: replace team-id string with member-role picker on /teams edit, archive, members"
```

---

## Self-Review

**1. Spec coverage:**

| Requirement | Task |
|---|---|
| Replace `team-id` string with `member-role` role on `edit`, `archive`, `members` | Task 2 Step 3 |
| Add `getByMemberRole` query filtering `active == true` | Task 1 Step 4 |
| Error message when no team configured for the role | Task 2 Steps 1 & 4 |
| `archivedAt` and `deleteAt` set on archive | Task 1 Step 4 |
| `deleteAt` is 30 days after `archivedAt` | Task 1 Step 4 |
| Archived teams invisible in `getByMemberRole` (already filtered by `active == true`) | Task 1 Step 4 |

**2. Placeholder scan:** No TBD/TODO language. Every step contains the complete code.

**3. Type consistency:**
- `getByMemberRole(guildId: string, memberRoleId: string): Promise<HelperTeamDocument | undefined>` defined in Task 1 Step 4, called in Task 2 Step 4 — match ✓
- `archive(guildId: string, teamId: string): Promise<void>` signature unchanged — match ✓
- `archivedAt?: Timestamp` and `deleteAt?: Timestamp` added in Task 1 Step 3, set in Task 1 Step 4 — match ✓
- Handler tests mock `helperTeamCollection.getByMemberRole` (Task 2 Step 1) matching the method defined in Task 1 — match ✓
