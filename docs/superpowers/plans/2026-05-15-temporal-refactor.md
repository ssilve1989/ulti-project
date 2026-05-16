# Temporal Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the timezone-aware scheduling logic in `src/helper-team/helper-team-time.ts` from legacy `Date` and `Intl` logic to the native `Temporal` API.

**Architecture:** Replace iterative UTC correction with `Temporal.ZonedDateTime` and refactor the entire call chain to use `Temporal.Instant` for absolute timestamps.

**Tech Stack:** TypeScript, Node.js (Temporal API), Vitest.

---

### Task 1: Refactor SessionOccurrence Interface and Utility

**Files:**
- Modify: `src/helper-team/helper-team-time.ts`

- [ ] **Step 1: Update imports and SessionOccurrence interface**

Modify `src/helper-team/helper-team-time.ts` to use `Temporal.Instant`.

```typescript
// src/helper-team/helper-team-time.ts

export interface SessionOccurrence {
  sessionId: string;
  teamId: string;
  start: Temporal.Instant;
  end: Temporal.Instant;
  unixSeconds: number;
}
```

- [ ] **Step 2: Update formatDiscordTimestamp**

Update the utility to accept `Temporal.Instant`.

```typescript
export function formatDiscordTimestamp(time: number | Temporal.Instant, style: 'f' | 'R') {
  const unixSeconds = typeof time === 'number' ? time : time.epochSeconds;
  return `<t:${unixSeconds}:${style}>`;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/helper-team/helper-team-time.ts
git commit -m "refactor: update SessionOccurrence and formatDiscordTimestamp to support Temporal"
```

---

### Task 2: Refactor getNextOccurrence Logic

**Files:**
- Modify: `src/helper-team/helper-team-time.ts`

- [ ] **Step 1: Rewrite getNextOccurrence with Temporal**

Remove `localDateToUtcMs` and replace the loop in `getNextOccurrence`.

```typescript
export function getNextOccurrence({
  dayOfWeek,
  startTime,
  durationMinutes,
  timezone,
  now,
  sessionId = 'session',
  teamId = 'team',
}: Pick<
  HelperTeamSessionDocument,
  'dayOfWeek' | 'startTime' | 'durationMinutes' | 'timezone'
> & {
  now: Temporal.Instant;
  sessionId?: string;
  teamId?: string;
}): SessionOccurrence {
  const [hour, minute] = startTime.split(':').map(Number);
  
  const nowZoned = now.toZonedDateTimeISO(timezone);
  
  // Find the next occurrence of the dayOfWeek
  // dayOfWeek is 0 (Sun) to 6 (Sat)
  // Temporal dayOfWeek is 1 (Mon) to 7 (Sun)
  const temporalTargetDay = dayOfWeek === 0 ? 7 : dayOfWeek;
  
  let occurrence = nowZoned.with({
    hour,
    minute,
    second: 0,
    millisecond: 0,
    microsecond: 0,
    nanosecond: 0,
  });

  // Calculate days to add
  const daysDiff = (temporalTargetDay - occurrence.dayOfWeek + 7) % 7;
  occurrence = occurrence.add({ days: daysDiff });

  // If the occurrence is in the past (or exactly now), move to next week
  if (Temporal.Instant.compare(occurrence.toInstant(), now) <= 0) {
    occurrence = occurrence.add({ weeks: 1 });
  }

  const start = occurrence.toInstant();
  const end = occurrence.add({ minutes: durationMinutes }).toInstant();

  return {
    sessionId,
    teamId,
    start,
    end,
    unixSeconds: start.epochSeconds,
  };
}
```

- [ ] **Step 2: Delete localDateToUtcMs**

Remove the unused `localDateToUtcMs` function.

- [ ] **Step 3: Verify build**

Run: `pnpm typecheck`
Expected: Errors in `src/helper-team/helper-team-time.spec.ts` and `src/slash-commands/helpers/handlers/helpers.command-handler.ts` (this is expected).

- [ ] **Step 4: Commit**

```bash
git add src/helper-team/helper-team-time.ts
git commit -m "refactor: implement getNextOccurrence using Temporal API"
```

---

### Task 3: Update Unit Tests

**Files:**
- Modify: `src/helper-team/helper-team-time.spec.ts`

- [ ] **Step 1: Update tests to use Temporal.Instant**

Refactor tests to pass `Temporal.Instant` and verify `Temporal.Instant` properties.

```typescript
describe('getNextOccurrence', () => {
  it('returns the next Friday occurrence when it is Thursday in America/Denver', () => {
    // 2026-05-14 18:00 UTC = Thursday 12:00 America/Denver
    const now = Temporal.Instant.from('2026-05-14T18:00:00Z');
    const occurrence = getNextOccurrence({
      dayOfWeek: 5, // Friday
      startTime: '20:00',
      durationMinutes: 120,
      timezone: 'America/Denver',
      now,
    });

    // In America/Denver, next Friday 20:00 MDT (UTC-6) = 2026-05-16 02:00 UTC
    expect(occurrence.start.toString()).toBe('2026-05-16T02:00:00Z');
    expect(occurrence.unixSeconds).toBe(Temporal.Instant.from('2026-05-16T02:00:00Z').epochSeconds);
  });

  it('handles DST transition (Fall Back)', () => {
    // America/Denver DST ends 2026-11-01 02:00
    // Sat Oct 31 2026 20:00 MDT (UTC-6) -> Sun Nov 01 2026 02:00 UTC
    // Sun Nov 01 2026 20:00 MST (UTC-7) -> Mon Nov 02 2026 03:00 UTC
    
    const now = Temporal.Instant.from('2026-10-31T18:00:00Z'); // Sat morning
    const occurrence = getNextOccurrence({
      dayOfWeek: 0, // Sunday
      startTime: '20:00',
      durationMinutes: 60,
      timezone: 'America/Denver',
      now,
    });

    expect(occurrence.start.toString()).toBe('2026-11-02T03:00:00Z'); // Corrected for MST
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest src/helper-team/helper-team-time.spec.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/helper-team/helper-team-time.spec.ts
git commit -m "test: update helper-team-time tests for Temporal"
```

---

### Task 4: Migrate Consumer: helpers.command-handler.ts

**Files:**
- Modify: `src/slash-commands/helpers/handlers/helpers.command-handler.ts`

- [ ] **Step 1: Refactor buildSessionSelectOptions**

Update the select menu builder to use `Temporal`.

```typescript
  private buildSessionSelectOptions(
    sessions: Awaited<
      ReturnType<HelperTeamSessionCollection['getActiveForTeams']>
    >,
    memberships: Awaited<
      ReturnType<HelperTeamMembershipService['getMembershipsForUser']>
    >,
  ): StringSelectMenuOptionBuilder[] {
    const now = Temporal.Now.instant();
    const cutoff = now.add({ days: DAYS_AHEAD });
    const options: StringSelectMenuOptionBuilder[] = [];

    for (const session of sessions) {
      try {
        const occurrence = getNextOccurrence({ ...session, now });
        if (Temporal.Instant.compare(occurrence.start, cutoff) <= 0) {
          const membership = memberships.find(
            (m) => m.teamId === session.teamId,
          );
          const teamName = membership?.teamName ?? session.teamId;
          options.push(
            new StringSelectMenuOptionBuilder()
              .setLabel(`${teamName} — ${session.startTime}`)
              .setValue(
                `${session.teamId}|${session.sessionId}|${occurrence.unixSeconds}`,
              ),
          );
        }
      } catch {
        // Skip sessions with no occurrence in range
      }
    }

    return options;
  }
```

- [ ] **Step 2: Verify full build**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Run all tests**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/slash-commands/helpers/handlers/helpers.command-handler.ts
git commit -m "refactor: migrate helpers command handler to Temporal"
```
