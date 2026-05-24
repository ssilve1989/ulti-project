# Helper Team Management Design

**Date:** 2026-05-16
**Status:** Canonical — supersedes all prior helper team management specs

## Purpose

The bot helps coordinators manage Final Fantasy XIV raid helper teams without integrating with RaidHelper. RaidHelper remains responsible for event signup and event operation. This bot tracks guild-wide helper teams, recurring team schedules, and absences.

Discord roles are the source of truth for team membership. Firestore stores team metadata, schedules, absences, coordinator-facing notification settings, and optional future reminder delivery state.

## Scope

In scope:

- Guild-wide helper teams backed by a configured Discord member role and a designated leader user.
- Helper self-service one-off session absences and date-range absences.
- Coordinator-managed team metadata and recurring weekly schedules.
- Team-leader-restricted schedule management (coordinators may only manage schedules for teams they lead).
- Coordinator-facing absence notifications.
- Reminder delivery design only when there is a helper-visible destination.
- Firestore TTL for absence and archived team cleanup.

Out of scope:

- Direct RaidHelper integration.
- Automatic event creation or assignment of helpers to RaidHelper events.
- Bot-managed Discord role assignment for team membership.
- Per-encounter helper team specialization in the first version.
- Full calendar export or external calendar integration.

## Roles and Authorization

Authorization uses three tiers, checked at command execution time.

**Helper** — any user who currently holds at least one active team's `memberRoleId`. Helper self-service commands (`/helpers absent *`) are available to helpers.

**Team leader** — the user whose Discord ID matches a team's `leaderUserId`. Team leaders have helper access for their team. Additionally, team leaders who also hold the coordinator role can manage schedules for their own team via the `schedule-*` subcommands.

**Coordinator** — any user who holds the configured `coordinatorRole` ID in guild settings. Coordinators can execute all `/teams` and `/settings` commands. For schedule management subcommands (`schedule-add`, `schedule-list`, `schedule-edit`, `schedule-remove`), coordinators must also be the leader of the specific team.

The `coordinatorRole` ID is stored in guild settings. Commands check Discord roles at execution time so role changes are reflected without data migration. The bot does not use Discord's `Administrator` permission as an access path.

## Data Model

### Guild Settings

Extend guild settings with helper-management configuration:

```ts
interface HelperSettings {
  coordinatorRole: string;
  absenceNotificationChannelId?: string;
}
```

`coordinatorRole` authorizes team and schedule administration. `absenceNotificationChannelId` receives absence notifications and is expected to be visible to coordinators only. If the notification channel is missing, commands still record data but report that notification could not be posted.

### Helper Teams

Collection: `helperTeams`. One document per guild-wide team.

```ts
interface HelperTeamDocument {
  guildId: string;
  teamId: string;       // equals memberRoleId — stable Discord snowflake
  active: boolean;
  memberRoleId: string;
  leaderUserId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  archivedAt?: Timestamp;
  deleteAt?: Timestamp; // Firestore TTL field — set to archivedAt + 30 days
}
```

`teamId` is set to `memberRole.id` on creation. There is no separate `name` or `description` field — display names are sourced from the Discord role at query time using `DiscordService.getRoleName`. Role mentions (`<@&roleId>`) are used in contexts where Discord renders them (embed titles, message content); the role name string is fetched only in contexts where mentions do not render (embed field names, select menu labels).

Discord roles are the source of truth for membership:
- A user is a team member if they hold `memberRoleId`.
- A user is the team leader if their Discord ID equals `leaderUserId`.
- Firestore does not store member lists.

Archiving a team sets `active: false`, `archivedAt`, and `deleteAt` (30 days out). The `active == true` filter on all read queries means archived teams disappear from coordinator views immediately. Physical deletion follows via Firestore TTL.

### Helper Team Sessions

Collection: `helperTeamSessions`. Recurring weekly sessions stored separately from teams.

```ts
interface HelperTeamSessionDocument {
  guildId: string;
  sessionId: string;    // randomUUID() assigned on creation
  teamId: string;       // equals the team's memberRoleId
  active: boolean;
  dayOfWeek: 1 | 2 | 3 | 4 | 5 | 6 | 7; // 1=Mon, 7=Sun (Temporal ISO standard)
  startTime: string;    // HH:mm
  durationMinutes: number;
  timezone: string;     // IANA timezone identifier, e.g. "America/Denver"
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

Teams may have multiple weekly sessions. Recurrence is stored structurally; views convert the next concrete occurrence to Discord timestamps such as `<t:1767225600:f>` and `<t:1767225600:R>` using `getNextOccurrence` from `helper-team-time.ts`.

Archiving a session sets `active: false`. Sessions have no TTL — they are kept indefinitely unless explicitly removed.

### Helper Absences

Collection: `helperAbsences`. Both session-specific and date-range absences.

```ts
type HelperAbsenceDocument =
  | HelperSessionAbsenceDocument
  | HelperRangeAbsenceDocument;

interface BaseHelperAbsenceDocument {
  guildId: string;
  absenceId: string;
  discordId: string;
  reason?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  expiresAt: Timestamp; // Firestore TTL field
}

interface HelperSessionAbsenceDocument extends BaseHelperAbsenceDocument {
  type: 'session';
  teamId: string;
  sessionId: string;
  occurrenceStart: Timestamp;
  occurrenceEnd: Timestamp;
}

interface HelperRangeAbsenceDocument extends BaseHelperAbsenceDocument {
  type: 'range';
  startDate: string;  // YYYY-MM-DD
  endDate: string;    // YYYY-MM-DD
  timezone: string;
}
```

`expiresAt` is set to one week after the absence ends. For session absences, one week after `occurrenceEnd`. For range absences, one week after the end date in the absence timezone. Firestore TTL must be configured on `expiresAt`.

### Reminder Deliveries

Collection: `helperReminderDeliveries`. Idempotency records for sent reminders (deferred until a helper-visible reminder destination is configured).

Document key: `{guildId}-{teamId}-{sessionId}-{occurrenceStartUnix}-{offsetMinutes}`.

```ts
interface HelperReminderDeliveryDocument {
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

## Slash Commands

### `/helpers`

**`/helpers absent session`**

Helper self-service. Starts an ephemeral picker flow:

1. Resolve all active teams where the user holds `memberRoleId`.
2. Find upcoming active session occurrences for those teams over the next 14 days.
3. Show a select menu with labels containing role name and concrete Discord timestamp.
4. Let the user optionally provide a short reason.
5. Re-check the selected occurrence before saving.
6. Write the absence and post to the absence notification channel.

**`/helpers absent range`**

Records a date-range absence with start date, end date, timezone, and optional reason. The response includes affected upcoming team sessions when any are found.

**`/helpers absent remove`**

Starts an ephemeral picker listing the user's future absences. Removing an absence posts a short update to the absence notification channel.

**`/helpers status [team]`**

Coordinator-only. Shows active helpers by team, current role-derived membership, expected upcoming sessions, and upcoming absences.

---

### `/teams`

All `/teams` subcommands require the coordinator role.

**`/teams create`**

Options: `member-role` (role, required), `leader` (user, required).

Creates a team. `teamId` is set to `memberRole.id`. Replies with a role mention confirming creation.

**`/teams edit`**

Options: `member-role` (role, required — identifies team), `leader` (user, optional).

Looks up team by `memberRoleId`. Updates `leaderUserId` if `leader` option is provided. Replies with role mention confirming update.

**`/teams archive`**

Options: `member-role` (role, required).

Marks team inactive. Sets `archivedAt` and `deleteAt` (30 days out). Replies with role mention confirming archive.

**`/teams members`**

Options: `member-role` (role, required).

Fetches current members from Discord via `getMembersWithRole`. Returns an embed showing the leader (`leaderUserId`) and all role members.

**`/teams view`**

No options.

Returns an embed listing all active teams. Each field uses the role name as the field name and shows the leader followed by non-leader members as user mentions. Data is fetched in parallel.

**`/teams schedule-add`**

Options: `member-role` (role, required), `day-of-week` (integer, required, choices Mon=1 through Sun=7), `start-time` (string, required, HH:mm), `duration-minutes` (integer, required, min 15 max 480), `timezone` (string, required).

Authorization: coordinator role + must be `leaderUserId` of the resolved team.

Validates `start-time` format before any Firestore reads. Looks up team by `memberRoleId`. Checks leader authorization. Creates a new session with a `randomUUID()` sessionId. Replies with a summary line: `Schedule added: Fri at 20:00 (120min, America/Denver).`

**`/teams schedule-list`**

Options: `member-role` (role, required).

Authorization: coordinator role + must be `leaderUserId` of the resolved team.

Looks up team, checks leader authorization. Fetches active sessions for the team. Returns an embed titled with a role mention showing each session as a field (day/time/duration as field name; timezone and next occurrence Discord timestamp as field value). Returns a plain message if no active sessions.

**`/teams schedule-edit`**

Options: `member-role` (role, required), `day-of-week` (integer, optional), `start-time` (string, optional), `duration-minutes` (integer, optional), `timezone` (string, optional).

Authorization: coordinator role + must be `leaderUserId` of the resolved team.

Validates `start-time` format if provided, before any Firestore reads. Looks up team, checks leader authorization. Fetches active sessions. Shows an ephemeral select menu. Waits up to 60 seconds for selection. Upserts the session with new values merged over existing values (unset options keep their current values). Replies with `Session updated.`

**`/teams schedule-remove`**

Options: `member-role` (role, required).

Authorization: coordinator role + must be `leaderUserId` of the resolved team.

Looks up team, checks leader authorization. Fetches active sessions. Shows an ephemeral select menu. Waits up to 60 seconds for selection. Archives the selected session. Replies with `Session Fri 20:00 removed.`

---

### `/settings`

**`/settings absence-channel`**

Sets the coordinator-visible absence notification channel ID in guild settings.

**`/settings coordinator-role`**

Sets the Discord role ID that authorizes coordinator-level helper-management commands.

## Notifications

Absence notifications post to `absenceNotificationChannelId`.

Session absence message includes: helper mention, team role mention, session timestamp using Discord timestamp formatting, optional reason.

Range absence message includes: helper mention, date range, optional reason, affected upcoming team sessions when any are found.

Absence removal posts a concise update so coordinators can see that the helper is no longer marked absent.

Absence recording is not blocked by notification failure, but the command response reports the notification problem and logs the configuration issue.

## Reminders

First-version behavior: views and commands render upcoming sessions with Discord timestamps. No proactive reminder delivery.

When a helper-visible destination is added later, add a scheduled helper reminder job under the existing jobs architecture. The job scans active guilds, finds sessions with occurrences approaching 24 hours and 1 hour away, checks `helperReminderDeliveries` for duplicates, resolves current members and leaders, queries applicable absences, and posts a reminder. Failures are isolated per guild/session.

`helperReminderDeliveries` collection is ready for this purpose. The `absenceNotificationChannelId` must not be used for helper reminders — it is coordinator-facing.

## Error Handling

| Situation | Response |
|---|---|
| Invalid `start-time` format | `Invalid start time. Use HH:mm format (e.g. 20:00).` — before any Firestore call |
| Role has no team configured | `No team is configured for the role <@&roleId>.` |
| Team already archived | Returns "no team configured" (archived teams filtered by `active == true`) |
| Coordinator is not the team leader | `You are not the leader of the <@&roleId> team.` |
| Team has no active sessions (list/edit/remove) | `No active sessions for this team.` |
| Select menu times out (60s) | `Selection timed out.` — components cleared |
| Selected session no longer active (edit) | `That session is no longer active.` — components cleared |
| Helper has no active team roles | `/helpers absent session` returns a friendly no-sessions response |
| Stale session selected during ephemeral flow | Bot asks user to retry |
| Missing notification channel | Absence recorded; response reports notification could not be posted |

## Testing

Unit coverage required for:

- Firestore collection key generation (`HelperTeamCollection`, `HelperTeamSessionCollection`).
- Absence TTL calculation for session absences and range absences.
- Weekly occurrence calculation via `getNextOccurrence` across timezones and DST transitions.
- Discord timestamp rendering via `formatDiscordTimestamp`.
- Role-derived team membership resolution (member role, leader user ID, multiple teams, no teams).
- Coordinator role authorization.
- `/helpers absent session` picker generation and stale selection handling.
- `/helpers absent range` affected-session lookup.
- `/helpers absent remove` future absence filtering.
- `/teams schedule-add` — happy path, invalid time, no team, not leader.
- `/teams schedule-list` — happy path with next-occurrence embed, no sessions, no team, not leader.
- `/teams schedule-edit` — happy path (fields updated), no-op (fields preserved), invalid time, no team, not leader, no sessions, timeout.
- `/teams schedule-remove` — happy path, no team, not leader, no sessions, timeout.
- `HelperTeamCollection.getByMemberRole` — match found, no match.
- `HelperTeamCollection.archive` — sets `archivedAt` and `deleteAt`.

Component tests for embeds and select menus to keep labels and values within Discord limits.

## Implementation Notes

- The feature uses the existing module pattern: `src/slash-commands/teams/` for `/teams` commands, `src/slash-commands/helpers/` for `/helpers` commands, `src/helper-team/` for shared domain services.
- `HelperTeamSessionCollection` is already exported from `FirebaseModule` and available for injection.
- `getNextOccurrence` and `formatDiscordTimestamp` live in `src/helper-team/helper-team-time.ts`.
- Select menu interactions use `isSameUserFilter` from `src/common/collection-filters.ts` and a 60-second timeout via `awaitMessageComponent`.
- `DAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']` — index matches `dayOfWeek` (1–7).
- Keep membership resolution behind `HelperTeamMembershipService` so command handlers and future jobs do not duplicate Discord role traversal logic.
