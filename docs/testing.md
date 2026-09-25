# Testing

The bot's tests form a pyramid:

- **Flow specs** (`<feature>.flow.spec.ts`) boot the real Nest modules for a
  feature, fake only external systems, and describe what users see. `/signup`
  and `/status` have one so far; every slash-command feature is meant to.
- **Unit specs** (`<file>.spec.ts`) cover code with branching logic you can
  exercise directly.

`isolate: false` is set and CI shuffles test order, so every test must set up
its own state.

## Core principle: test the code that actually runs

A test must exercise the code paths production executes. A test that passes
because of what its own mocks return proves only that the test works.

This happened. A unit test for `/signup` stubbed `SignupCollection.upsert` to
return an APPROVED signup, and checked that the old review message was kept.
The real `upsert` never returns APPROVED; it always returns PENDING or
UPDATE_PENDING. The protection the test "covered" never ran, and resubmitting
an approved signup deleted its approved review message in production. The test
stayed green the whole time.

So:

- **Behaviour that crosses our own classes goes in a flow spec**, with the real
  classes wired together. Don't stub one of our classes to return a chosen
  value in order to test another.
- **A stub or fake may only produce what the real thing can produce.** Before
  stubbing a value, name the real code path that returns it. If you can't, the
  test is testing itself. Fakes model real failure modes (`FFLogsMock`'s
  `goOffline()` makes the SDK fail the way it does when the API is down).
- **Flow specs state intended behaviour.** When one fails because production is
  wrong, fix production. Never rewrite the test to match the bug. If the fix
  can't land in the same change, mark the test `it.fails(...)` with a comment
  naming the bug: it keeps asserting the intended behaviour and turns red once
  production is fixed.
- **Prove a new test can fail, through its own assertion.** Break the exact
  thing the test's name claims (invert a condition, drop an event publish),
  watch the test go red, and revert. Check that the failure is the test's own
  `expect`, not an incidental harness check like a recording mismatch. A test
  that stays green, or only fails for some other reason, doesn't test what it
  claims. This is how a fake that diverged from Firestore (it merged an empty
  map instead of replacing the field) was caught, and how three sheet
  assertions that only read back replayed data were found.

## Flow spec or unit spec?

- Command and event handlers are glue code. Test them through their feature's
  flow spec, never with their own spec. Features without a flow spec yet keep
  their existing handler specs until they get one.
- Write unit specs for schemas, utils, strategies, component builders,
  collections, and services that manage multi-step Discord interactions.
- Ask whether a bug here would be visible to a user. If yes, cover it in a flow
  spec. If it's an edge case that's awkward to reach through a flow (timeouts,
  expired interaction tokens, error reporting), cover it in a unit spec.

## Rules

1. **Naming.** `describe` names the scenario ("when a player submits a signup",
   "and the reviewer declines it"). `it` states the observable result in the
   present tense ("stores it as pending"), never "should…". Each test states one
   behaviour; several `expect`s are fine when they describe that one behaviour.
2. **Assert outcomes, not calls.** Check stored documents, return values, and
   what Discord, Sheets or FFLogs received. Use `toHaveBeenCalled*` only when a
   call to an external system *is* the behaviour, never to check that one of our
   own classes called another.
3. **Assert the whole output.** Compare a return value, stored document or
   message with `toEqual` against all of it, not a few fields: a field nobody
   asserts can break unnoticed. No `toMatchObject`, `objectContaining` or
   `toContain` on an output. In flow specs, a message is everything a user sees
   of it: where it is (channel, DM, or a reply and whether it's ephemeral), its
   content, embeds and components (`shown(message)` in the signup flow spec).
   For values that differ per run, use a matcher that still checks the value,
   like `signupExpiryFor(from)` and `isoDateSince(from)` in
   `test-utils/matchers.ts`, not `expect.any(...)`.
   This is about what users see and callers use. For an error, check it's the
   right one (its class or code if production branches on it, or a key phrase),
   not its full message.
4. **Tests that don't earn their place.** No `is defined` tests. No tests that
   only check a call was passed through to another class. No `withInternals` in
   new tests; test through the public API, or extract the logic.
5. **Setup.** Use the harness and helpers in `apps/bot/src/test-utils/`. If the
   same setup appears in three or more tests, move it to a `beforeEach` or a
   helper. Never hand-build collector callbacks or `editReply` response chains.
6. **Fakes vs mocks.** Flow specs override DI providers with the
   `test-utils/` fakes. Unit specs use `createAutoMock`, `mockOf` and
   `partialMock`. Nobody uses `vi.mock` for app modules.
7. **State.** Each test starts from fresh fakes (`createFlowApp()` /
   `new InMemoryFirestore()`), and nothing is shared between tests or spec
   files. Give each test its app, fakes and subject as Vitest fixtures
   (`test.extend` with `fresh(create, teardown)` from `test-utils/fixtures.ts`),
   not as `let`s in a `describe` that a `beforeEach` reassigns. Freeze
   module-level test constants (`Object.freeze`) so no test can change them for
   the next.
8. **No type assertions.** Use `mockOf<T>()` for discord.js shapes and
   `partialMock<T>()` for our domain types.

## The flow harness

`createFlowApp()` (`apps/bot/src/test-utils/flow-app.ts`) boots the real
feature modules. Only what sits behind an external system is swapped:

| External system | In flow specs | What tests do with it |
|---|---|---|
| Firestore | `InMemoryFirestore`, behind the `FIRESTORE` token | `db.seed(path, data)` / `db.read(path)`; `db.onWrite(listener)` to check what else had happened when the app wrote |
| Discord | `DiscordMock`, as `DiscordService` and the client | set up members, channels and emojis (`addMember`, `addChannel(guildId, channelId)`, `addEmoji`); drive the bot with `command` (delivered through the real command listener, and only with commands and options the bot registered), `react`, `click`, `choose` and `submitModal`; assert with `channel`, `dmsTo`, `repliesTo`, `modalsShownTo`, `rolesOf` |
| FFLogs | `FFLogsMock`, behind the SDK token, so the real `FFLogsService` runs | `fflogs.addReport(code, { daysAgo })`, `fflogs.goOffline()` |
| Google Sheets | **Recorded real traffic.** The real `SheetsService` and client run; their HTTP is replayed from recordings of the shared test spreadsheet | `sheets.writes()`: every change the app sent to Sheets in this test, in full; `sheets.valuesRead(range)`: what the sheet returned when the app read it |

### Recorded Google Sheets traffic

This follows the practice Google documents for its own API clients: test
against saved real responses, never the live API
([Python guide](https://googleapis.github.io/google-api-python-client/docs/mocks.html)).

- **Normal runs** (`pnpm test`, pre-commit, CI) replay each test's recording
  from `__recordings__/` next to the spec, with the network disabled. They need
  no credentials and use no quota. A test that makes no Sheets requests has no
  recording, and any Sheets request it later starts making fails.
- **`pnpm test:record`** re-records against the real test spreadsheet using the
  dev service account (`apps/bot/.env.development` + `.env`, decrypted with
  `.env.keys`). It paces itself under Google's 60 requests/minute/user limit.
  Credentials are redacted from recordings before they're written, and
  responses are stored as the plain JSON Google sent, so a recording diff shows
  exactly what changed.
- **Re-record when a test's Sheets traffic changes.** A replay fails if the app
  makes a request that isn't in the recording, or doesn't make one that is.
  That's the signal that behaviour changed. Check the diff of the recordings
  as part of the review.
- Assert on what the app **sent** (`sheets.writes()`, each request in full),
  never by reading the sheet back. In a replay, a read returns the recorded
  sheet, so it passes whether or not this run wrote anything. Work out rows
  from what the app read (`sheets.valuesRead(range)`), not a regex, so a write
  to the wrong row fails.
- Tests write rows under a per-test character name (`stableTestKey()`): unique
  between tests, stable between runs. Only touch rows your test created, and
  remove them in cleanup. The spreadsheet is shared with manual testing.

- Call `await flow.settle()` after driving the bot so event handlers and sagas
  finish. It waits until no HTTP request is in flight and no call into a
  tracked adapter (currently `SheetsService`) is pending. A client keeps
  working after its request closes (decompressing, parsing), and only the
  adapter's own promise covers that. So when a feature adds a new external
  HTTP dependency, register its adapter with `activity.trackCalls` in
  `flow-app.ts`.
- Close the app in the `flow` fixture's teardown (`flow.close()`). It times out
  any prompt still awaiting a click, and **fails the test if the app reported a
  problem the test didn't expect**: a logged error or warning, or anything sent
  to Sentry. Event handlers, sagas and reaction handling catch their own errors
  and only log them or report them to Sentry, so without this check a failure
  there would go unnoticed. When a report is part of the scenario (a DM that
  fails on purpose, FFLogs being down), declare it with
  `flow.expectReported(/pattern/)`, matching its kind (`error:`, `warning:`,
  `Sentry exception:`, `Sentry warning:`).
- The fakes behave exactly like the real system or refuse loudly. A fake that
  quietly differs from the real thing is a bug in the fake. They implement only
  what current flows use, and they fail loudly on
  anything else (`InMemoryFirestore does not support …`,
  `… is not a function`). Extend the fake when a new flow needs more. Model the
  failure modes of the real system as named options on the fake (like
  `goOffline()` or `addReport(code, { daysAgo })`), not as
  `mockRejectedValue` in a spec.
- `DiscordMock` enforces what Discord enforces:
  - Channels belong to a guild (`addChannel(guildId, channelId)`). Fetching one
    through another guild rejects with discord.js's `GuildChannelUnowned`, and
    an unknown guild, channel, member or message with the API's 404 codes.
  - Users can only click enabled buttons and choose offered options, never on
    a deleted message or one they can't see (someone else's DM or ephemeral
    reply).
  - Modal submits only carry the modal's own inputs, within its `required` and
    length limits, as the Discord client enforces.
  - Each interaction is answered exactly once before any follow-up.
  - Timeouts reject with the real `DiscordjsError`; a user who blocks DMs
    rejects with the API's 50007.
  - Message options it doesn't model (`allowedMentions`, `files`, flags other
    than ephemeral) are refused, not dropped.

  One stated assumption: Discord's gateway updates reach what the bot holds
  before it next reads them. Role changes are in the member's cached roles
  before the bot's next role call, and an edit to a message shows in every
  `Message` the bot holds for it. In discord.js those catch up when the
  gateway sends the member or message update, and the fake can't know when
  that is.

  If a flow test fails on one of these rules, the bot would fail the same way
  in production.
- The flow app boots `SlashCommandsModule`, so every slash command feature is
  wired as in production; a new feature needs no harness change.

## Example

```ts
const it = base.extend<{ flow: FlowApp }>({
  flow: fresh(
    async () => {
      const flow = await createFlowApp();
      givenAGuild(flow);
      return flow;
    },
    (flow) => flow.close(),
  ),
});

describe('when a submitted signup is reviewed', () => {
  it.beforeEach(({ flow }) => submitSignup(flow));

  describe('and the reviewer declines it with a reason', () => {
    it.beforeEach(({ flow }) => decline(flow, reason));

    it('marks it declined with the reason', ({ flow }) => {
      expect(flow.db.read(SIGNUP_PATH)).toEqual(
        storedSignup(flow, {
          status: SignupStatus.DECLINED,
          reviewMessageId: latestReview(flow).id,
          reviewedBy: REVIEWER.username,
          declineReason: reason,
        }),
      );
    });

    it('DMs the player the reason', ({ flow }) => {
      expect(flow.discord.dmsTo(PLAYER.id).map(shown)).toEqual([
        declineDm(flow, declinedFor(reason)),
      ]);
    });
  });
});
```

See `apps/bot/src/slash-commands/signup/signup.flow.spec.ts` for the complete
reference.

### Before and after

Before: a unit test that only checks one class called another.

```ts
it('should delegate getEncounter to collection', async () => {
  mockEncountersCollection.getEncounter.mockResolvedValue(mockEncounter);
  const result = await service.getEncounter('test-id');
  expect(mockEncountersCollection.getEncounter).toHaveBeenCalledWith('test-id');
  expect(result).toBe(mockEncounter);
});
```

After: no test. The behaviour it protects (reading an encounter) is exercised by
the flows that use it, against `InMemoryFirestore`.
