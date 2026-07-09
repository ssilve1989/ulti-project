# /sync-prog-roles — Retroactive Prog-Point Role Backfill — Design

**Date:** 2026-07-08
**Status:** Approved
**Depends on:** `docs/superpowers/specs/2026-07-08-prog-point-role-assignment-design.md` (PR #1363)

## Problem

The prog-point role assignment feature only applies roles at approval time. Existing
approved signups predate the feature (and any mappings configured after deploy), so
their members hold no prog-point roles. Admins need a way to retroactively apply the
proper roles for all current signups once the feature is deployed and mappings are
configured.

## Decision Summary

- **Surface:** a new admin-only slash command, `/sync-prog-roles`, modeled on
  `/clean-roles` (`Administrator` default member permission, optional `dry-run`
  boolean, ephemeral replies). Not a CLI script — the CLI has no Discord client or
  guild context; the bot has both.
- **Semantics:** mirror approval exactly. For each active signup
  (`APPROVED`/`UPDATE_PENDING`) whose party status is EarlyProg/Prog/ClearParty and
  whose prog point is mapped for its encounter: add the mapped role, remove other
  mapped prog-point roles for that encounter the member holds. Unmapped prog points
  are a strict no-op. Prog/clear roles are untouched.
- **Shared logic:** extract the decision logic from
  `AssignRolesEventHandler.updateProgPointRoles` into a `ProgPointRolesService`
  (compute + apply) used by both the event handler and the new command, so backfill
  semantics can never drift from approval semantics.
- **Dry-run:** computes every change and prints an ephemeral summary without mutating
  anything.

## Components

### 1. `ProgPointRolesService` — `src/role-manager/prog-point-roles.service.ts`

Registered and exported by `RoleManagerModule`.

- `computeChanges(member: GuildMember, mapping: Record<string, string> | undefined, progPoint: string | undefined): ProgPointRoleChanges`
  - `ProgPointRoleChanges = { roleToAdd?: string; rolesToRemove: string[] }`
  - Pure decision logic (no I/O), extracted from
    `AssignRolesEventHandler.updateProgPointRoles`:
    - no mapping, no progPoint, or unmapped progPoint → empty changes
    - `rolesToRemove` = distinct mapped role ids the member currently holds,
      excluding the role being added (shared-role guard)
    - `roleToAdd` set only when the member does not already hold it
- `applyChanges(member: GuildMember, changes: ProgPointRoleChanges): Promise<void>`
  - `member.roles.remove(rolesToRemove)` (skipped when empty) then
    `member.roles.add(roleToAdd)` (skipped when unset), with the existing log lines.
  - Kept as the single place for ordering/logging even though it is a thin wrapper —
    `DiscordService` has no per-member role mutation (its `removeRole`/`retireRole`
    are role-centric bulk operations), and per-member mutations elsewhere call
    `member.roles` directly.

`AssignRolesEventHandler` is refactored to fetch the member and call
`computeChanges` + `applyChanges`. Behavior is identical; its existing 7 tests must
pass unchanged.

### 2. `/sync-prog-roles` command — `src/slash-commands/sync-prog-roles/`

New module mirroring `/clean-roles`' structure (slash-command builder, module,
handler). Builder: `setDefaultMemberPermissions(PermissionFlagsBits.Administrator)`,
optional `dry-run` boolean option.

Flow:
1. `deferReply` ephemeral.
2. Load settings; if `progPointRoles` is absent or has no entries → reply
   "No prog point role mappings configured" and stop.
3. Fetch active signups via `signupCollection.findByStatusIn([APPROVED, UPDATE_PENDING])`
   and all guild members (`guild.members.fetch()`, like `/clean-roles`).
4. Per signup, skip (with distinct counters) when: encounter has no mappings;
   `progPoint` unset or unmapped; `partyStatus` not EarlyProg/Prog/ClearParty;
   member not in the guild.
5. `computeChanges` per signup; skip empty change sets ("already correct").
   If `dry-run`: collect only. Otherwise `applyChanges` inside a per-signup
   try/catch — a failure increments an error counter and the sweep continues.
6. Ephemeral summary embed for both modes: signups examined, members changed, roles
   added/removed, skips by reason, errors. Per-member detail lines are chunked into
   ≤1024-char embed fields capped with an `… and N more` line (same treatment as the
   `/settings view` overflow fix).

## Error Handling & Edge Cases

- Whole command wrapped in the standard `errorService.handleCommandError` →
  ephemeral error embed.
- Per-signup failures never abort the sweep.
- Member left the server → counted as skipped, not an error.
- Cleared/missing `partyStatus` → skipped; clear-time stripping remains
  `RemoveRolesCommandHandler`'s job.
- One member with signups across multiple encounters is processed once per
  encounter; encounter mappings are independent.
- Signups are processed sequentially (matching `/clean-roles`); discord.js
  rate-limit queueing handles pacing at this guild's scale.

## Testing

- **`prog-point-roles.service.spec.ts`** (new): `computeChanges` matrix ported from
  the Task-4 assign-roles tests — mapped point (add + remove others), shared role
  (never removed/re-added), unmapped point / no mapping / no progPoint → empty,
  already-held role → no add; `applyChanges` removes then adds, skips empty parts.
- **`assign-roles.event-handler.spec.ts`** (existing): all 7 tests pass unchanged
  after the refactor — the proof that extraction preserved approval behavior.
- **`sync-prog-roles.command-handler.spec.ts`** (new): no-mappings early reply;
  dry-run computes but never calls `roles.add`/`roles.remove` and reports counts;
  real run applies and reports; member-left and Cleared-signup skips; a per-signup
  error doesn't abort the sweep.
- Verification: `pnpm typecheck`, `pnpm test:ci`, `biome check --fix .`.

## Out of Scope

- Per-encounter filtering options on the command (run it for everything; YAGNI).
- Reconciling prog/clear roles (already assigned at approval time by the existing
  feature).
- Scheduling/automation — this is a manual, admin-triggered, idempotent command
  (safe to re-run; second run reports "already correct").
- CLI integration.
