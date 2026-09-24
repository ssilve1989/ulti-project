# Testing

The bot's tests form a pyramid:

- **Flow specs** (`<feature>.flow.spec.ts`) boot the real Nest modules for a
  feature, fake only external systems, and describe what users see. There's one
  per slash-command feature.
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
  `unreachable` returns what the real service returns when the API is down).
- **Flow specs state intended behaviour.** When one fails because production is
  wrong, fix production. Never rewrite the test to match the bug. If the fix
  can't land in the same change, mark the test `it.fails(...)` with a comment
  naming the bug: it keeps asserting the intended behaviour and turns red once
  production is fixed.
- **Prove a new test can fail.** Break the code path it covers (invert a
  condition, drop an event publish), watch the test go red, and revert. A test
  that stays green is testing something else. This is how a fake that diverged
  from Firestore (it merged an empty map instead of replacing the field) was
  caught while the harness was being built.

## Flow spec or unit spec?

- Command and event handlers are glue code. Test them through their feature's
  flow spec, never with their own spec.
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
3. **Tests that don't earn their place.** No `is defined` tests. No tests that
   only check a call was passed through to another class. No `withInternals` in
   new tests; test through the public API, or extract the logic.
4. **Setup.** Use the harness and helpers in `apps/bot/src/test-utils/`. If the
   same setup appears in three or more tests, move it to a `beforeEach` or a
   helper. Never hand-build collector callbacks or `editReply` response chains.
5. **Fakes vs mocks.** Flow specs override DI providers with the
   `test-utils/` fakes. Unit specs use `createAutoMock`, `mockOf` and
   `partialMock`. Nobody uses `vi.mock` for app modules.
6. **State.** Each test starts from fresh fakes (`createFlowApp()` /
   `new InMemoryFirestore()`), and nothing is shared between spec files.
7. **No type assertions.** Use `mockOf<T>()` for discord.js shapes and
   `partialMock<T>()` for our domain types.

## The flow harness

`createFlowApp()` (`apps/bot/src/test-utils/flow-app.ts`) boots the feature
modules with these overrides:

| External system | Replaced by | What tests do with it |
|---|---|---|
| Firestore | `InMemoryFirestore` | `db.seed(path, data)` / `db.read(path)` |
| Discord | `DiscordMock` | set up members and channels; drive the bot with `command`, `react`, `click`, `choose` and `submitModal`; assert with `channel`, `dmsTo`, `rolesOf` |
| Google Sheets | `SheetsMock` | `sheets.rows(spreadsheetId)` |
| FFLogs | `FFLogsMock` | `fflogs.reportAge = 'expired'` |

- Call `await flow.settle()` after driving the bot so event handlers and sagas
  finish.
- Call `flow.close()` in `afterEach`. It times out any prompt still awaiting a
  click.
- The fakes implement only what current flows use, and they fail loudly on
  anything else (`InMemoryFirestore does not support …`,
  `… is not a function`). Extend the fake when a new flow needs more. Model the
  failure modes of the real system as named options on the fake (like
  `reportAge`), not as `mockRejectedValue` in a spec.
- To cover a new feature, add its module to `FLOW_MODULES` in `flow-app.ts`.

## Example

```ts
describe('when a submitted signup is reviewed', () => {
  beforeEach(() => submitSignup(flow));

  describe('and the reviewer declines it with a reason', () => {
    beforeEach(() => decline(flow, reason));

    it('marks it declined with the reason', () => {
      expect(flow.db.read(SIGNUP_PATH)).toMatchObject({
        status: SignupStatus.DECLINED,
        declineReason: reason,
      });
    });

    it('DMs the player the reason', () => {
      expect(flow.discord.latestDmTo(PLAYER.id).content).toContain(reason);
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
