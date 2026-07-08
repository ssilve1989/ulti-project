# Prog-Point Role Assignment — Design

**Date:** 2026-07-08
**Status:** Approved

## Problem

When a signup is approved, roles are assigned only at party-status granularity: the
reviewer's prog-point selection resolves to a `PartyStatus`, and
`AssignRolesEventHandler` assigns the encounter's single prog role or clear role from
settings. Communities want finer-grained roles that reflect *where* in the encounter a
player is (e.g., a role per phase), assigned from the same prog-point selection the
reviewer already makes.

## Decision Summary

- **Granularity:** Map prog point id → role id directly. No phase concept is added
  anywhere; "phases" emerge by mapping several prog points to the same role.
- **Coexistence:** The new mapping **supplements** the existing prog/clear role
  behavior. Nothing about `progRoles`/`clearRoles` changes.
- **Cleanup on progression:** On approval, all *other* mapped prog-point roles for that
  encounter are removed from the member, then the newly mapped role is added. A member
  holds at most one mapped prog-point role per encounter.
- **Cleanup elsewhere:** `RemoveRolesCommandHandler` (already-Cleared approvals,
  retire) and `/clean-roles` both sweep mapped prog-point roles alongside prog/clear
  roles.
- **Editing UX:** New `/settings prog-point-roles` subcommand using the existing
  prog-point select menu (multi-select). No autocomplete infrastructure is added — the
  bot's interaction dispatcher only handles chat-input commands today, and the select
  menu component already exists.

## Data Model

`src/firebase/models/settings.model.ts`:

```typescript
progPointRoles?: {
  [key in keyof typeof Encounter]?: {
    [progPointId: string]: string; // Discord role id
  };
};
```

Same per-encounter keying as `progRoles`/`clearRoles`, one level deeper for the prog
point. Multiple prog points may map to the same role id.

## Components

### 1. `/settings prog-point-roles` subcommand

New subcommand on `SettingsSlashCommand` (generated via `pnpm g:slash-command`
conventions), following the `edit-encounter-roles.command-handler.ts` pattern.

- **Options:** `encounter` (required string, same choices as `encounter-roles`),
  `role` (optional Discord role option).
- **Flow:** Ephemeral reply containing the encounter's prog-point multi-select menu,
  reusing `EncountersComponentsService.createProgPointSelectMenu` (extended to support
  multi-select). The admin selects one or more prog points:
  - `role` provided → each selected prog point maps to that role.
  - `role` omitted → the selected prog points' mappings are **deleted**.
- **Persistence:** Merge into `settings.progPointRoles[encounter]` via the existing
  `settingsCollection.upsert` pattern.
- `/settings view` gains a field listing each encounter's prog-point → role mappings.

### 2. Assignment flow — `assign-roles.event-handler.ts`

After the existing party-status prog/clear logic (unchanged):

1. `mapping = settings.progPointRoles?.[encounter]`; do nothing if the mapping or
   `signup.progPoint` is absent.
2. `newRole = mapping[signup.progPoint]` (may be undefined for an unmapped prog point).
3. `rolesToRemove` = all distinct role ids in `mapping` **except `newRole`**. The
   exclusion prevents remove-then-re-add when two prog points in the same phase share a
   role. Only remove roles the member actually holds.
4. Remove `rolesToRemove`, then add `newRole` if defined.
5. `Cleared`/nullish party status: handler keeps doing nothing;
   `RemoveRolesCommandHandler` covers it.

Errors remain inside the existing try/catch → Sentry capture; a role failure never
breaks the approval.

### 3. Cleanup — `RemoveRolesCommandHandler`

Removal list additionally includes all role ids from `progPointRoles[encounter]`,
deduplicated, using a type-safe filter (replacing the existing `as string[]` cast).

### 4. Cleanup — `/clean-roles`

`prepareProcessingContext` adds every role id from every encounter's `progPointRoles`
into the `allRoleIds` set, so sweep and dry-run treat them like prog/clear roles. The
"no roles configured" guard also counts `progPointRoles` as configuration.

Side benefit of both cleanup paths iterating mapping *values*: stale mappings (e.g., a
prog point renamed in encounter YAML) still get swept.

## Error Handling

- Role add/remove failures in the approval flow are captured to Sentry and do not fail
  the approval (existing behavior, preserved).
- Unmapped prog points are a no-op for the new logic; existing prog/clear behavior
  still applies.
- Stale prog-point ids in settings never match a selection and are eventually swept by
  the cleanup paths.

## Testing

Unit tests follow existing spec patterns (`createAutoMock`, `Mocked<T>`, explicit
Discord.js partials):

- **`assign-roles.event-handler.spec.ts`** (extend): mapped prog point adds the role;
  other mapped roles removed; shared-role case (two prog points → same role) does not
  remove the role being added; unmapped prog point / no mapping / no `progPoint` leaves
  behavior unchanged; existing prog/clear assertions untouched.
- **New spec for `prog-point-roles` subcommand:** role provided → mappings upserted for
  selected prog points; role omitted → mappings deleted; select-menu interaction wiring
  (mocked collector).
- **`remove-roles.command-handler.spec.ts`** (extend): removal list includes mapped
  prog-point roles, deduplicated.
- **`clean-roles.command-handler.spec.ts`** (extend): `allRoleIds` includes prog-point
  roles; guard passes when only `progPointRoles` is configured.
- **`view-settings.command-handler.spec.ts`** (extend): mappings rendered.

Verification: `pnpm typecheck`, `pnpm test:ci`, `biome check --fix .`.

## Out of Scope

- Centralizing role management into a shared service (existing TODO in
  `assign-roles.event-handler.ts`) — deliberate deferral; this feature extends the
  three existing sites in place.
- Autocomplete infrastructure for slash commands.
- Any change to prog-point data (`ProgPointDocument`, encounter YAML, CLI sync).
- Migration/backfill of existing members' roles; mappings apply to approvals going
  forward.
