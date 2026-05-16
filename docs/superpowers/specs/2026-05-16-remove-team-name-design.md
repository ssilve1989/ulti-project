# Design: Remove `name` from `HelperTeamDocument` — Source Display Names from Discord Role

**Date:** 2026-05-16

## Problem

`HelperTeamDocument` stores a `name` (and optional `description`) field in Firestore. If a coordinator renames the Discord role from within Discord, Firestore is never notified and the stored name becomes stale. The role is the authoritative identity of a team; the bot should not maintain a separate, divergence-prone copy of its name.

## Goal

Remove `name` and `description` from `HelperTeamDocument`. Derive all team display names from the Discord role at query time. Eliminate `normalizeTeamId` (which derived `teamId` from `name`) by using `memberRoleId` directly as `teamId`.

## Approach

Use `<@&roleId>` (Discord role mention) in contexts where Discord renders it (embed titles, descriptions, message content). Fetch the actual role name string via a new `DiscordService.getRoleName` method only in contexts where mentions do not render (embed field names, select menu option labels).

---

## Data Model

**`HelperTeamDocument`** — remove `name` and `description`:

```ts
export interface HelperTeamDocument extends DocumentData {
  guildId: string;
  teamId: string;       // now equals memberRoleId (stable Discord snowflake)
  active: boolean;
  memberRoleId: string;
  leaderUserId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  archivedAt?: Timestamp;
  deleteAt?: Timestamp;
}
```

`teamId` is set to `memberRole.id` on create. `normalizeTeamId` is deleted. No Firestore migration needed — data is fresh.

---

## DiscordService

Add one method:

```ts
public async getRoleName({
  guildId,
  roleId,
}: {
  guildId: string;
  roleId: string;
}): Promise<string> {
  const guild = await this.client.guilds.fetch(guildId);
  const role = await guild.roles.fetch(roleId);
  return role?.name ?? roleId;
}
```

Falls back to `roleId` if the role is somehow missing (defensive — avoids empty display strings).

---

## Slash Command Changes

### `/teams create`

- **Remove** `name` string option
- **Remove** `description` string option
- Keep `member-role` (required) and `leader` (required)
- `teamId` = `memberRole.id`
- Reply: `Team for <@&${memberRole.id}> created successfully!`

### `/teams edit`

- **Remove** `name` string option
- **Remove** `description` string option
- Keep `member-role` (required, identifies team) and `leader` (optional)
- Reply: `Team for <@&${team.memberRoleId}> updated.`

### `/teams archive`

- Options unchanged
- Reply: `Team for <@&${team.memberRoleId}> archived.`

### `/teams members`

- Options unchanged
- Embed title: `<@&${team.memberRoleId}> — Members` (mentions render in embed titles)

### `/teams view`

- Field name: fetched role name string via `getRoleName` (mentions do not render in field names)
- Field value: unchanged — leader-first user mentions as implemented

---

## HelperTeamMembership

`teamName: string` → `roleName: string`. The membership service fetches role names from Discord in parallel after identifying the user's teams:

```ts
const roleNames = await Promise.all(
  userTeams.map((t) =>
    this.discordService.getRoleName({ guildId, roleId: t.memberRoleId })
  )
);
// zip into memberships: { ..., roleName: roleNames[i] }
```

---

## helpers.command-handler.ts

- `membership.teamName` → `membership.roleName` everywhere
- Select menu label: `${membership.roleName} — ${session.startTime}` (unchanged structure, new field name)
- Notification call site: pass `teamRoleId: team.memberRoleId` instead of `teamName`

---

## helper-team-notification.service.ts

`sendSessionAbsenceNotification` input:
- Remove `teamName: string`
- Add `teamRoleId: string`
- Message: `the **${input.teamName}** session` → `the <@&${input.teamRoleId}> session`

(Role mention renders correctly in embed descriptions.)

---

## Files Changed

| File | Change |
|---|---|
| `src/firebase/models/helper-team.model.ts` | Remove `name`, `description` |
| `src/firebase/collections/helper-team.collection.ts` | Remove `normalizeTeamId`; `teamId` = `memberRoleId` in create |
| `src/firebase/collections/helper-team.collection.spec.ts` | Update affected tests |
| `src/discord/discord.service.ts` | Add `getRoleName` |
| `src/slash-commands/teams/teams.slash-command.ts` | Remove `name`, `description` options from `create` and `edit` |
| `src/slash-commands/teams/handlers/teams.command-handler.ts` | Remove `normalizeTeamId`, update all five subcommand handlers |
| `src/slash-commands/teams/handlers/teams.command-handler.spec.ts` | Update all affected tests |
| `src/helper-team/helper-team-membership.service.ts` | `teamName` → `roleName`, fetch via `getRoleName` |
| `src/helper-team/helper-team-membership.service.spec.ts` | Update tests |
| `src/slash-commands/helpers/handlers/helpers.command-handler.ts` | `teamName` → `roleName`; pass `teamRoleId` to notification |
| `src/slash-commands/helpers/handlers/helpers.command-handler.spec.ts` | Update affected tests |
| `src/helper-team/helper-team-notification.service.ts` | `teamName` → `teamRoleId`; use `<@&roleId>` in message |
| `src/helper-team/helper-team-notification.service.spec.ts` | Update tests |

## Out of Scope

- Any Firestore data migration (data is fresh)
- Changes to `HelperTeamSessionDocument` — `teamId` field there still refers to the team, now stable as `memberRoleId`
- Sorting or pagination of any member lists
