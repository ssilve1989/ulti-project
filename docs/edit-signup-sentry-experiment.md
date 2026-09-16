# /edit-signup Sentry Experiment Tracking

The command emits one counter per funnel stage via the Application Metrics API:
`Sentry.metrics.count("edit-signup.<event>", 1, { attributes })`. Metric names:

`edit-signup.invoked`, `edit-signup.guard-blocked`, `edit-signup.saved`,
`edit-signup.saved-with-sheets-error`, `edit-signup.conflict`,
`edit-signup.cancelled`, `edit-signup.timed-out`

Attributes vary by event: `encounter`, `edit_kind` (correction|reversal),
`guard_reason`, `with_comment` (boolean). Metrics are trace-connected: each
counter event carries a `trace_id` and `span_id`, so you can pivot from a metric
spike into the command's transaction waterfall. Default attributes (environment,
release, SDK name/version, user, server address) attach automatically.

## Discover queries

- Daily funnel volumes (all edits): `sum(edit-signup.invoked)`,
  `sum(edit-signup.guard-blocked)`, `sum(edit-signup.saved)`,
  `sum(edit-signup.cancelled)`, `sum(edit-signup.timed-out)`
- Usage by encounter: `sum(edit-signup.invoked)` grouped by `encounter`
- Correction vs reversal mix: `sum(edit-signup.saved)` grouped by `edit_kind`
- Completion rate (saved / invoked): `sum(edit-signup.saved) /
  sum(edit-signup.invoked)`
- Guard rejections: `sum(edit-signup.guard-blocked)` grouped by `guard_reason`
- Sheets problems: `sum(edit-signup.saved-with-sheets-error)`
- Conflicts: `sum(edit-signup.conflict)`
- Reviewer latency:
  `transaction:"EditSignupCommandHandler.execute"` → "Query performance",
  look at the `edit_signup.screen_time_s` measurement or span duration.

## Dashboard tiles

1. Invocations / day (bar, `sum(edit-signup.invoked)`)
2. Funnel (numbers widget): invoked vs saved vs cancelled vs timed-out
3. Outcome mix by `edit_kind` (table/chart)
4. Guard reasons (table grouped by `guard_reason`)
5. Conflict + sheet-error volume (line, two series)
6. p50/p95 reviewer screen time (from the `edit_signup.screen_time_s` measurement)

## Alerts

- `edit-signup` error rate: filter `command:"/edit-signup"`, kind = errors,
  sensitivity based on traffic.
- Conflict rate > threshold: `sum(edit-signup.conflict)` /
  `sum(edit-signup.invoked)`.
- Sheet-error rate > threshold: `sum(edit-signup.saved-with-sheets-error)`.

Unlike message events, these counters do not create Issues.

## Success criteria (reviewers)

- Completion rate = saved / invoked, per release (use Release pages to compare).
- Guard volume explains why non-completions happen.
- Conflict + sheet-error + error rates stay low and stable after rollout.