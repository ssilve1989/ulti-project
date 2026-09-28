# Flow spec port

Porting the bot's slash-command tests from handler unit specs to flow specs.
This file is the port's **stopping condition**. When it is met, the port is done
and no further review rounds are run.

`docs/testing.md` holds the standards. This file holds the goal.

## Done means

1. **Every slash-command feature has a flow spec**, or is listed under
   [Scope exceptions](#scope-exceptions). The features that count are the ones
   with a handler wired into `SlashCommandsModule`.
2. **No handler has its own spec.** No `*.command-handler.spec.ts` remains for a
   feature that has a flow spec (`docs/testing.md` rule: "Command and event
   handlers are glue code").
3. **Each flow spec covers every reachable branch** of its handlers: every
   `catch` and reported-failure path, every button, select and modal branch, and
   every permission check. "Reachable" is the bar, not "every line" — a
   defensive guard production never takes may stay uncovered, and says why in a
   comment.
4. **Green**: `pnpm test:ci`, `pnpm check`, `pnpm build:check`, `pnpm knip`.

## Scope exceptions

- **`turboprog` (the `turbo-prog` and `final-push` commands, and the
  `settings turbo-prog` subcommand) is being removed.** It is not ported. Its
  two handler unit specs stay until the feature is deleted:
  `turboprog/handlers/turbo-prog.command-handler.spec.ts` and
  `settings/subcommands/turbo-prog/edit-turbo-prog.command-handler.spec.ts`.
  They are the only handler specs the port leaves behind.
- `finalpush/final-push-signup.slash-command.ts` builds a command and has no
  handler of its own; its behaviour is `TurboProgCommandHandler`, so it is
  covered by the same exception.

## The review gate

A review round produces findings. A finding is only a finding if it does all
three:

1. **Cites a numbered rule** in `docs/testing.md` (Rules 1–8, or the Core
   principle), quoted.
2. **Names `file:line`** in this branch.
3. **Is one of four categories:**
   - **(a) production is wrong** — the code under test has a real defect
   - **(b) a fake diverges** — a fake in `test-utils/` does something the real
     system cannot, or refuses something it can
   - **(c) a test proves nothing** — it passes for a reason other than the
     behaviour its name claims
   - **(d) done means, unmet** — a numbered item above

Anything that fails those three is not a finding. In particular these are out of
scope and must not be raised: naming and wording preferences, comment phrasing,
helper extraction, file layout, and "consider also covering" suggestions for
code already covered.

**The loop stops when a round produces no findings.** Categories (a) and (b) are
finite per file. When a round finds nothing, the port is done — the branch ships
and the branch's own remaining nits are not worth a round.

Findings that cite a rule but fall outside the four categories go in a list at
the end of this file, not into the branch.

## Status

Met:

- Flow harness built (`test-utils/flow-app.ts` and fakes), booting real feature
  modules with only external systems replaced.
- Flow specs for `signup`, `status`, `settings`, `blacklist`, `lookup`,
  `search`, `encounters`, `help`, `clean-roles`, `remove-signup`, `retire`,
  `remove-role`, `sync-prog-roles`.
- `pnpm test:ci` green: 57 files, 742 tests. `pnpm check`, `pnpm build:check`
  and `pnpm knip` pass.
- A review round was run. Its findings were triaged: fake divergences fixed
  (`discord-mock.ts` follow-up, `fake-client.ts` array role removal), production
  defects fixed (clean-roles dry-run embed field cap, remove-role honest failure
  reporting, view-encounter partial-data label), and flow tests added for the
  newly fixed and still-reachable paths (clean-roles field cap, remove-role
  above-bot failure, view-encounter partial/offline data, signup deleted review
  channel). Unreachable-in-flow branches carry comments saying why
  (`signup.command-handler` FFLogs/URL catches, `send-signup-review` unset
  channel, `view-settings` catch, `clean-roles` per-role catch, `retire` outer
  catch).

Not met:

- Nothing outstanding at time of writing.

Deferred (not findings, not for this branch):

- The `settings turbo-prog` subcommand is uncovered by `settings.flow.spec.ts`
  and covered only by its unit spec. It goes with the feature.
- `clean-roles.command-handler.ts:207` logs `roles > 0 ? 'processed' :
  'processed'`; the ternary picks the same word either way. Cosmetic log
  wording, outside the four review categories.
- The invite-cleaner test logs "Failed to delete invite old-invite" from a
  background job after its app closes, while passing. Pre-existing noise,
  outside the flow-spec port.
