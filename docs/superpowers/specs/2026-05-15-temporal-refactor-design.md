# Design Spec: Temporal Refactor for Helper Team Scheduling

Refactor the timezone-aware scheduling logic in `src/helper-team/helper-team-time.ts` from legacy `Date` and `Intl` iterative logic to the native `Temporal` API. This improves readability, eliminates DST bugs, and provides better type safety.

## 1. Objectives

- Replace manual timezone iterative correction with `Temporal.ZonedDateTime`.
- Refactor the entire call chain to use `Temporal` types instead of legacy `Date`.
- Improve type safety by using `Temporal.Instant` for absolute timestamps.

## 2. Architecture Changes

### 2.1 Interface: `SessionOccurrence`

Refactor the `SessionOccurrence` interface to use `Temporal.Instant` for `start` and `end`.

```typescript
export interface SessionOccurrence {
  sessionId: string;
  teamId: string;
  start: Temporal.Instant;
  end: Temporal.Instant;
  unixSeconds: number; // Retained for easy Discord timestamp generation
}
```

### 2.2 Core Logic: `getNextOccurrence`

The function will be refactored to:
1. Accept `now: Temporal.Instant`.
2. Convert `now` to a `Temporal.ZonedDateTime` in the target timezone.
3. Use native `Temporal` arithmetic to find the next occurrence of a specific `dayOfWeek` (0-6) at a specific `startTime` (HH:mm).
4. Handle the "past-today" case by adding `{ weeks: 1 }`.
5. Return the result using `Temporal.Instant`.

### 2.3 Utility: `formatDiscordTimestamp`

Update to accept `Temporal.Instant` as an alternative to `number` to simplify usage in template strings.

## 3. Implementation Details

### 3.1 `src/helper-team/helper-team-time.ts`

- Remove `localDateToUtcMs` (no longer needed).
- Simplify `getNextOccurrence` using `toZonedDateTimeISO` and `with`.
- Map `dayOfWeek` (0-6, Sun-Sat) to `Temporal`'s ISO weekday if necessary (1-7, Mon-Sun).
  - *Correction*: Standardize internal `dayOfWeek` mapping to ensure consistency between Firebase storage and `Temporal`.

### 3.2 `src/slash-commands/helpers/handlers/helpers.command-handler.ts`

- Update `now` to `Temporal.Now.instant()`.
- Refactor `cutoff` calculation to use `Temporal.Now.instant().add({ days: DAYS_AHEAD })`.
- Update comparison logic: `Temporal.Instant.compare(occurrence.start, cutoff) <= 0`.

## 4. Verification Plan

### 4.1 Unit Testing
- Update `src/helper-team/helper-team-time.spec.ts` to pass `Temporal.Instant` instead of `Date`.
- Verify DST transitions (e.g., scheduling across the start/end of Daylight Savings).
- Verify "today but past time" correctly jumps to next week.

### 4.2 Integration
- Run `vitest` to ensure no regressions in the command handler.
- Verify `unixSeconds` in the returned occurrence still generates valid Discord timestamps.
