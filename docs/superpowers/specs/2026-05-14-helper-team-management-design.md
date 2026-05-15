# Helper Team Management Design

## Purpose

The bot needs to help coordinators manage Final Fantasy XIV raid helper teams without integrating with RaidHelper. RaidHelper remains responsible for event signup and event operation. This bot will track guild-wide helper teams, recurring team schedules, and absences.

The design keeps Discord roles as the source of truth for team membership. Firestore stores team metadata, schedules, absences, coordinator-facing notification settings, and optional future reminder delivery state.

## Scope

In scope:

- Guild-wide helper teams backed by configured Discord member and leader roles.
- Helper self-service one-off session absences and date-range absences.
- Coordinator-managed team metadata and recurring weekly schedules.
- Coordinator-facing absence notifications.
- Reminder delivery design only when there is a helper-visible destination.
- Firestore TTL for absence cleanup.

Out of scope:

- Direct RaidHelper integration.
- Automatic event creation or assignment of helpers to RaidHelper events.
- Bot-managed Discord role assignment for team membership.
- Per-encounter helper team specialization in the first version.
- Full calendar export or external calendar integration.

## Roles And Authorization

Authorization is based on configured Discord role IDs, not Discord permission flags.

- Helper self-service commands are available to users who currently have at least one active helper team's member role or leader role.
- Team leader privileges are derived from the relevant team's configured leader role.
- Team management and global helper status commands are available to the configured coordinator role.
- The configured coordinator role can execute every helper-management command.
- The coordinator role ID is stored in guild settings.
- A helper may belong to multiple teams by having multiple configured team roles.
- Commands check Discord roles at execution time so role changes are reflected without data migration.

The existing role validation patterns can be reused, but this feature should not rely on Discord's `Administrator` permission as the primary access path. The intended admin path is role-based.

Coordinators, helpers, and team leaders are distinct concepts. Coordinators administer the feature across teams. Helpers are users with a team's member or leader role. Team leaders are helpers with a team's leader role, but the leader role does not automatically grant coordinator-level access.

Helper availability is inferred from team membership and team schedule. If a helper is on a team, they are assumed to be available for that team's active scheduled sessions unless they mark an absence.

## Data Model

### Settings

Extend guild settings with helper-management configuration:

```ts
interface HelperSettings {
  coordinatorRole: string;
  absenceNotificationChannelId?: string;
}
```

`coordinatorRole` authorizes team and schedule administration. `absenceNotificationChannelId` receives absence notifications and is expected to be visible to coordinators. It is not used for helper-facing schedule reminders. If the notification channel is missing, commands still record data but report that notification could not be posted.

### Helper Teams

`helperTeams` stores one document per guild-wide team.

```ts
interface HelperTeamDocument {
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
```

Discord roles are the source of truth for membership:

- A user is a team member if they have `memberRoleId` or `leaderRoleId`.
- A user is a team leader if they have `leaderRoleId`.
- Firestore does not store member lists.

### Helper Team Sessions

`helperTeamSessions` stores recurring weekly sessions separately from teams.

```ts
interface HelperTeamSessionDocument {
  guildId: string;
  sessionId: string;
  teamId: string;
  active: boolean;
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  startTime: string; // HH:mm
  durationMinutes: number;
  timezone: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

Teams may have multiple weekly sessions. Recurrence is stored structurally; views and reminders convert the next concrete occurrence to Discord timestamps such as `<t:1767225600:f>` and `<t:1767225600:R>`.

### Helper Absences

`helperAbsences` stores both session-specific and date-range absences.

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
  expiresAt: Timestamp;
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
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  timezone: string;
}
```

`expiresAt` is set to one week after the absence ends. For session absences, this is one week after `occurrenceEnd`. For range absences, this is one week after the end date in the absence timezone. Firestore TTL should be configured on `expiresAt`.

### Reminder Deliveries

`helperReminderDeliveries` stores idempotency records for sent reminders if a helper-visible reminder destination is added.

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

If reminders are enabled later, the reminder job checks this collection before posting so repeated scans and bot restarts do not duplicate reminders.

## Slash Commands

### `/helpers`

`/helpers absent session`

Starts an ephemeral picker flow:

1. Resolve all active teams where the user has the team member or leader role.
2. Find upcoming active session occurrences for those teams over the next 14 days.
3. Show a select menu with labels containing team name and concrete Discord timestamp.
4. Let the user optionally provide a short reason.
5. Re-check the selected occurrence before saving.
6. Write the absence and post to the absence notification channel.

The user should not need to type or copy a raw session ID.

`/helpers absent range`

Records a date-range absence with start date, end date, timezone, and optional reason. The response should include affected upcoming team sessions when any are found.

`/helpers absent remove`

Starts an ephemeral picker listing the user's future absences. Removing an absence posts a short update to the absence notification channel.

`/helpers status [team]`

Coordinator-only. Shows active helpers by team, current role-derived membership, expected upcoming sessions, and upcoming absences.

### `/teams`

`/teams create`

Creates a team with name, optional description, member role, and leader role.

`/teams edit`

Updates team name, description, active flag, member role, or leader role.

`/teams archive`

Marks a team inactive. Historical absences and reminder delivery records remain until their normal cleanup.

`/teams members list`

Resolves current team members and leaders from Discord roles. There are no first-version `add` or `remove` member commands because role assignment remains outside this feature.

`/teams schedule add`

Adds a recurring weekly session to a team.

`/teams schedule edit`

Updates a recurring session.

`/teams schedule remove`

Archives or deletes a recurring session. Archiving is preferred if existing future absences reference the session.

`/teams schedule list`

Lists all active sessions for a team.

`/teams view [team]`

Shows team metadata, member and leader roles, current role-derived roster, weekly sessions, and next occurrence timestamps.

### `/settings`

Extend the existing settings command group with helper-management configuration.

`/settings absence-channel`

Sets the coordinator-visible absence notification channel.

`/settings coordinator-role`

Sets the Discord role ID that can execute coordinator-level helper-management commands.

## Notifications

Absence notifications post to the coordinator-visible absence notification channel.

Session absence message includes:

- Helper mention.
- Team name.
- Session timestamp using Discord timestamp formatting.
- Optional reason.

Range absence message includes:

- Helper mention.
- Date range.
- Optional reason.
- Affected upcoming team sessions when any are found.

Absence removal posts a concise update so coordinators can see that the helper is no longer marked absent.

## Reminders

Do not post schedule reminders to `absenceNotificationChannelId`, because that channel is coordinator-visible and not useful for helper reminders.

First-version behavior:

- Views and commands still render upcoming sessions with Discord timestamps.
- Absence notifications remain coordinator-facing.
- Reminder delivery is deferred until there is a helper-visible target, such as team channels, team role mentions in an allowed channel, or direct messages.

If a helper-visible destination is added later, add a scheduled helper reminder job under the existing jobs architecture.

Future reminder behavior:

- Scan active guilds with reminder settings configured.
- Find active team sessions with occurrences approaching 24 hours and 1 hour away.
- Check `helperReminderDeliveries` for the occurrence and offset.
- Resolve current members and leaders from Discord roles.
- Query applicable session and range absences.
- Post a reminder to the helper-visible destination.
- Write the reminder delivery record.

Reminder content includes:

- Team name.
- Session time using `<t:unix:f>` and `<t:unix:R>`.
- Current members and leaders.
- Known absences.

Failures are isolated per guild/session. A missing destination or invalid role should log and skip that reminder without stopping the whole job.

## Error Handling

- Invalid schedule windows fail before Firestore writes.
- Unknown or inactive teams fail with clear ephemeral feedback.
- Missing helper roles prevent team creation or edit.
- If a helper has no active team roles, `/helpers absent session` returns a friendly no-sessions response.
- If a selected session occurrence becomes invalid during an ephemeral workflow, the bot asks the user to retry.
- Absence recording is not blocked by notification failure, but the command response reports the notification problem and logs the configuration issue.
- Future reminder job errors are captured with guild, team, session, occurrence, and reminder offset context.

## Testing

Add unit coverage for:

- Firestore collection key generation.
- Absence TTL calculation for session and range absences.
- Weekly occurrence calculation across timezones.
- Discord timestamp rendering helpers.
- Role-derived team membership resolution for member role, leader role, multiple teams, and no teams.
- Coordinator role authorization.
- `/helpers absent session` picker generation and stale selection handling.
- `/helpers absent range` affected-session lookup.
- `/helpers absent remove` future absence filtering.
- Team command validation for configured member and leader roles.
- Future reminder job scan windows and duplicate prevention.

Add component tests for embeds and select menus to keep labels and values within Discord limits.

## Implementation Notes

The feature should follow the existing module pattern:

- A new helper/team feature module under `src/slash-commands` or a dedicated `src/helpers` domain module if command handlers become too large.
- New Firestore collection services exported from `FirebaseModule`.
- New scheduled job under `src/jobs`.
- CQRS command handlers for command workflows and event handlers for notification side effects where that keeps command handlers focused.

Keep membership resolution behind a small service interface so command handlers and jobs do not duplicate Discord role traversal logic.
