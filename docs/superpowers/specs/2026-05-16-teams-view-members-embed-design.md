# Design: `/teams view` — Role-and-Members Embed

**Date:** 2026-05-16

## Problem

`/teams view` currently shows each team's name as the field header and its description (or `teamId` as a fallback) as the field value. The `teamId` concept has been replaced across other subcommands — it no longer appears in the UI anywhere else. The view embed needs to show something meaningful: who is actually on each team.

## Goal

Replace the description/ID field value with a live member list fetched from Discord, grouped under the team's member role.

## Embed Structure

- **Title:** `Active Helper Teams` (unchanged)
- **One field per active team:**
  - `name`: `<@&{memberRoleId}>` — Discord renders this as a role pill
  - `value`: newline-joined list, leader always first:
    ```
    <@leaderUserId> (Leader)
    <@member2UserId>
    <@member3UserId>
    ```
    If no other members hold the role, the value is just `<@leaderUserId> (Leader)`.
  - `inline: false`

## Behaviour Details

- Members are fetched via `discordService.getMembersWithRole` — the existing method used by `handleMembers`.
- All teams are fetched in parallel with `Promise.all` to avoid sequential round-trips.
- The leader is always included at the top of the list (even if they don't hold the member role). Non-leader members are the `getMembersWithRole` result filtered to exclude the leader's user ID.
- User mentions use `<@userId>` (not display names), consistent with the request.
- Empty-teams case (`teams.length === 0`) is unchanged: plain-text reply "No active teams found."

## Files Changed

| File | Change |
|---|---|
| `src/slash-commands/teams/handlers/teams.command-handler.ts` | Rewrite `handleView` only |
| `src/slash-commands/teams/handlers/teams.command-handler.spec.ts` | Update/add `view` describe block |

No changes to: slash command definition, Firestore layer, other subcommands.

## Out of Scope

- Pagination / overflow handling for very large member lists (Discord field value limit is 1024 chars). Not a concern at current team sizes; can be addressed if needed.
- Sorting members beyond leader-first (no ordering requirement stated).
