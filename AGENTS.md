# AGENTS.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## Testing

Before writing or changing tests, read `docs/testing.md`. It covers when to
write a flow spec (`*.flow.spec.ts`: real Nest wiring with the fakes in
`apps/bot/src/test-utils/`) versus a unit spec, and the naming, assertion and
setup rules both follow.

## Slash command handlers

- Let unexpected errors propagate. The dispatcher
  (`apps/bot/src/slash-commands/slash-commands.service.ts`) reports them to
  Sentry and shows the user the standard error. Catch only what you turn into a
  specific message, such as a missing document.
- Defer with `MessageFlags.Ephemeral`. The dispatcher's `replyPrivately` edits a
  deferred reply in place, so a public deferral would post errors publicly.
- Don't put `@SentryTraced()` on a handler that writes to
  `Sentry.getCurrentScope()` (`setContext`, `setExtra`). The decorator's span
  gets its own scope, so that data never reaches the dispatcher's error report,
  and no test catches it.
- A prompt the user lets expire (`isCollectorTimeout` in
  `apps/bot/src/discord/discord.helpers.ts`) isn't an error. Tell them, remove
  the components and call `recordExpiredPrompt`, which counts it and logs it to
  Sentry without raising an issue. A prompt run through
  `ComponentSessionService.run` does all three itself on expiry; only pass
  `expiredContent`.
