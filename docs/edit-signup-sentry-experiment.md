# /edit-signup Sentry Experiment Tracking

The command emits `edit-signup.<event>` messages tagged `edit_signup_event`,
`edit_kind`, `encounter`, `guard_reason`, and `with_comment`. All events inherit
the dispatch scope's `command`, `guild_id`, and `user` tags, so they are
filterable alongside normal command errors/transactions.

## Discover queries

- Daily funnel volumes (all edits):
  `message:"edit-signup.*"` grouped by `edit_signup_event`
- Usage by encounter:
  `message:"edit-signup.invoked"` grouped by `encounter`
- Correction vs reversal mix:
  `message:"edit-signup.saved"` grouped by `edit_kind`
- Completion rate (saved / invoked):
  saved: `message:"edit-signup.saved"`
  cancelled: `message:"edit-signup.cancelled"`
  timed out: `message:"edit-signup.timed-out"`
- Guard rejections:
  `message:"edit-signup.guard-blocked"` grouped by `guard_reason`
- Sheets problems:
  `message:"edit-signup.saved-with-sheets-error"`
- Conflicts:
  `message:"edit-signup.conflict"`
- Reviewer latency:
  `transaction:"EditSignupCommandHandler.execute"` → "Query performance",
  look at the `edit_signup.screen_time_s` measurement or span duration.

## Dashboard tiles

1. Invocations / day (bar, events = `message:"edit-signup.invoked"`)
2. Funnel (numbers widget): invoked vs saved vs cancelled vs timed-out
3. Outcome mix by `edit_kind` (table/chart)
4. Guard reasons (table grouped by `guard_reason`)
5. Conflict + sheet-error volume (line, two series)
6. p50/p95 reviewer screen time (from the `edit_signup.screen_time_s` measurement)

## Alerts

- `edit-signup` error rate: filter `command:"/edit-signup"`, kind = errors,
  sensitivity based on traffic.
- Conflict rate > threshold: count of `message:"edit-signup.conflict"` /
  count of `message:"edit-signup.invoked"`.
- Sheet-error rate > threshold: `message:"edit-signup.saved-with-sheets-error"`.

## Success criteria (reviewers)

- Completion rate = saved / invoked, per release (use Release pages to compare).
- Guard volume explains why non-completions happen.
- Conflict + sheet-error + error rates stay low and stable after rollout.