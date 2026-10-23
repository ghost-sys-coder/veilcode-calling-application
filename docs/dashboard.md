# Outreach dashboard

Open **Dashboard** in the console sidebar. Today is the initial activity period; Last 7 days and Last 30 days include today and the preceding 6 or 29 calendar days in the browser's named timezone. Calls with future start times are excluded. Calendar boundaries use the requested timezone, including daylight-saving changes.

## Metric definitions

- Calls made: saved call attempts started in the selected period, including unfinished calls.
- Connection rate: completed telephone calls divided by finished attempts (completed, failed, busy, no-answer, canceled). Unfinished/unknown attempts do not enter the denominator. With no finished calls, show an em dash rather than 0%.
- Interested prospects: distinct nonempty recipient numbers whose latest classified conversation is Interested and began in the selected period. A later negative classification replaces earlier interest. An unclassified call does not erase the previous classification. Order ties use the call SID, consistently with call history.
- Callbacks due today: all open callbacks scheduled on the local calendar date, independent of the activity period. The overdue count includes all open callbacks before the refresh time, including earlier today. The two counts can overlap. Completed callbacks are excluded.
- Average call quality: mean of non-null ratings on calls started in the selected period, with the rated-call sample size. Missing ratings are not zeroes. With no ratings, show an em dash.

The attention list shows the first five overdue or due-today callbacks, oldest first. The recent list shows up to six calls in the activity period. Contact names are matched by normalized phone number only within the operator's own address book. Listen appears only when a completed, unexpired, undeleted recording exists; opening the review still enforces private recording access.

Review links open the exact owned call, including calls outside the first history page. Invalid or foreign references show a generic unavailable message and leave normal call history accessible. Callback Dial links prefill the number through the existing protected flow and never place a call.

The dashboard refreshes every minute while visible, on browser focus, and when Refresh is pressed. Errors replace metrics with a retry state so failed reads are not mistaken for zero activity. Counts reflect saved app history; use Sync recent calls in call history for missing provider activity.

No schema changes, providers, or environment variables are required. The single read-only query uses one consistent database snapshot, parameterized values, operator-scoped calls and contact joins, and bounded lists. The API preserves Clerk session/allowlist checks and no-store responses.

Validation: `npm test`, lint, typecheck, and build. `node scripts/check-dashboard-storage.mjs` verifies real aggregates, repeated-number classifications, unfinished-call exclusions, rating samples, callback independence, recording availability, ownership, and empty results in a transaction that rolls back. Set `DASHBOARD_TEST_HOST` to an existing isolated Neon validation branch hostname when checking a branch.
