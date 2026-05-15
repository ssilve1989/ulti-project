# Teams Role-Based Lookup Design

## Purpose

The `/teams edit`, `/teams archive`, and `/teams members` subcommands currently require a `team-id` string option — an internal Firestore key that coordinators should never need to know or type. This design replaces that string with a Discord role picker and adds TTL cleanup for archived teams.

## Background

The helper team management spec establishes that Discord roles are the source of truth for team membership. Each team is configured with a `memberRoleId`. Coordinators already interact with these roles when creating teams, so identifying a team by its member role is the natural and correct model.

## What Changes

### Slash command options

Three subcommand definitions change. All other subcommands (`create`, `view`) are unchanged.

| Subcommand | Before | After |
|---|---|---|
| `/teams members` | `team-id` string (required) | `member-role` role (required) |
| `/teams edit` | `team-id` string (required) | `member-role` role (required) |
| `/teams archive` | `team-id` string (required) | `member-role` role (required) |

The internal `teamId` Firestore key is unchanged — it just stops being user-visible.

### Team lookup

Add `getByMemberRole(guildId: string, memberRoleId: string): Promise<HelperTeamDocument | undefined>` to `HelperTeamCollection`. This queries for a team where `guildId == guildId`, `memberRoleId == memberRoleId`, and `active == true`. Returns `undefined` if no match is found.

Each affected handler changes from:

```ts
const teamId = interaction.options.getString('team-id', true);
const team = await this.helperTeamCollection.get(guildId, teamId);
```

to:

```ts
const memberRole = interaction.options.getRole('member-role', true);
const team = await this.helperTeamCollection.getByMemberRole(guildId, memberRole.id);
```

### Error messages

| Situation | Response |
|---|---|
| Role selected but no team configured for it | `"No team is configured for the role @RoleName."` |
| Team already archived (archive command) | `"Team @RoleName is already archived."` |

### Data model additions

`HelperTeamDocument` gains two optional fields:

```ts
archivedAt?: Timestamp;   // set when active is set to false
deleteAt?: Timestamp;     // set to archivedAt + 30 days; Firestore TTL field
```

Firestore TTL must be configured on the `deleteAt` field in the Firebase console. The `active: true` filter on `getActiveForGuild` and `getByMemberRole` means archived teams disappear from all coordinator views immediately. Physical deletion follows 30 days later.

The `archive` handler sets both fields when marking a team inactive:

```ts
const now = Timestamp.now();
const deleteAt = Timestamp.fromDate(
  new Date(now.toDate().getTime() + 30 * 24 * 60 * 60 * 1000),
);
await this.helperTeamCollection.archive(guildId, teamId, now, deleteAt);
```

(Or the collection's `archive` method can accept the team document and compute `deleteAt` internally — implementation detail.)

## What Does Not Change

- The Firestore document structure other than the two new optional TTL fields
- The `teamId` key or `normalizeTeamId` logic
- The `/teams create` subcommand (already uses a role picker for `member-role` and a user picker for `leader`)
- The `/teams view` subcommand
- All `/helpers` commands
- Authorization logic

## Error Handling

- `getByMemberRole` returns `undefined` (not throws) when no team is found. Handlers check for `undefined` and reply with the "no team configured" message before doing any work.
- If the selected role maps to an inactive (archived) team, `getByMemberRole` returns `undefined` (because it filters `active == true`), so the coordinator sees "no team configured" rather than operating on a deleted team.

## Testing

- `HelperTeamCollection.getByMemberRole` unit test: query filters correctly, returns document when match found, returns `undefined` when not found.
- `TeamsCommandHandler` — for each of `members`, `edit`, `archive`:
  - Happy path: role maps to an active team, operation succeeds.
  - No-team path: role has no matching team, friendly error message returned.
- `archive` sets `archivedAt` and `deleteAt` 30 days out.
- `getActiveForGuild` does not return archived teams (existing test, verify still passes).
