# Design: Teams Leader — User Select

**Date:** 2026-05-15
**Branch:** feat/helper-management (or follow-on)
**Status:** Approved

## Background

`/teams create` accepted a Discord role for `leader-role`, but a team leader is a single specific user — not a role. This design replaces the role option with a user select and propagates that change to the data model, command handler, and membership service.

## Scope

- `/teams create` — replace `leader-role` role option with `leader` user option (required)
- `/teams edit` — add `leader` user option (optional, for reassigning the leader)
- `HelperTeamDocument` — rename `leaderRoleId` → `leaderUserId`
- `HelperTeamMembership` — rename `leaderRoleId` → `leaderUserId`
- `TeamsCommandHandler` — update `handleCreate`, `handleEdit`, `handleMembers`
- `HelperTeamMembershipService` — update `getMembershipsForUser` leader check

No data migration required — data is fresh.

## Data Model

**`src/firebase/models/helper-team.model.ts`**

```diff
- leaderRoleId: string;
+ leaderUserId: string;
```

**`src/helper-team/helper-team-membership.service.ts` — `HelperTeamMembership` interface**

```diff
- leaderRoleId: string;
+ leaderUserId: string;
```

## Slash Command Definition

**`src/slash-commands/teams/teams.slash-command.ts`**

`CreateSubcommand`: replace `.addRoleOption` for `leader-role` with `.addUserOption` named `leader`, required.

`EditSubcommand`: add `.addUserOption` named `leader`, optional.

## Command Handler

**`src/slash-commands/teams/handlers/teams.command-handler.ts`**

### `handleCreate`

```diff
- const leaderRole = interaction.options.getRole('leader-role', true);
+ const leaderUser = interaction.options.getUser('leader', true);
  await this.helperTeamCollection.upsert({
    ...
-   leaderRoleId: leaderRole.id,
+   leaderUserId: leaderUser.id,
  });
```

### `handleEdit`

```diff
+ const leaderUser = interaction.options.getUser('leader');
  await this.helperTeamCollection.upsert({
    ...team,
    name: name ?? team.name,
    description: description ?? team.description,
+   leaderUserId: leaderUser?.id ?? team.leaderUserId,
    updatedAt: Timestamp.now(),
  });
```

### `handleMembers`

Drop `getMembersWithRole` call for leaders. No `Promise.all` needed — only the members role fetch remains async. The leaders embed field becomes a single user mention:

```diff
- const [leaders, members] = await Promise.all([
-   this.discordService.getMembersWithRole({ guildId: interaction.guildId, roleId: team.leaderRoleId }),
-   this.discordService.getMembersWithRole({ guildId: interaction.guildId, roleId: team.memberRoleId }),
- ]);
- const leaderList = leaders.length > 0 ? leaders.map((m) => m.displayName).join('\n') : 'None';
+ const members = await this.discordService.getMembersWithRole({
+   guildId: interaction.guildId,
+   roleId: team.memberRoleId,
+ });
+ const leaderList = `<@${team.leaderUserId}>`;
  const memberList = members.length > 0 ? members.map((m) => m.displayName).join('\n') : 'None';
```

## Membership Service

**`src/helper-team/helper-team-membership.service.ts`**

`getMembershipsForUser` — the guild member fetch stays (needed for `memberRoleId` role check). The leader check changes from role membership to ID equality:

```diff
- const isLeader = member.roles.cache.has(team.leaderRoleId);
+ const isLeader = discordId === team.leaderUserId;
  const isMember = member.roles.cache.has(team.memberRoleId);

  if (isLeader || isMember) {
    memberships.push({
      teamId: team.teamId,
      teamName: team.name,
      memberRoleId: team.memberRoleId,
-     leaderRoleId: team.leaderRoleId,
+     leaderUserId: team.leaderUserId,
      role: isLeader ? 'leader' : 'member',
    });
  }
```

## Testing

Each changed unit gets updated tests:

- `teams.command-handler.spec.ts` — update `handleCreate` test to pass a user instead of a role; add `handleEdit` test that reassigns leader; update `handleMembers` test to assert embed shows `<@userId>` and no role fetch call
- `helper-team-membership.service.spec.ts` — update leader detection test to use `discordId === leaderUserId` assertion
- `helper-team.collection.spec.ts` — update any fixture data using `leaderRoleId` to use `leaderUserId`
