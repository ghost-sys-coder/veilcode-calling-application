# Owner draft calling rates

The existing **Call costs** page includes a private draft-rate section for ordinary
UK and Australian landline/mobile calls. It helps the owner evaluate pricing before
a paid pilot. It adds no customer page, published rate card, payment product or
calling entitlement. Live payments remain disabled and sandbox rates are unchanged.

Select one of your active calling numbers and enter USD per connected minute and
per started attempt. Per-minute rates must be above zero; attempts may be zero.
Amounts support six decimal places, up to $100. Unset routes remain unset rather
than inheriting fixture rates. Clearing a per-minute field unsets that proposal;
all proposals can be cleared without deleting the draft document. Save persists one draft document for the exact owner,
Twilio account and caller number. Switching callers requires saving or discarding
edits first. Cost-period changes and cost refreshes preserve unsaved price edits.

Optimistic revisions reject stale or simultaneous saves with 409. The UI preserves
the unsaved fields after a conflict; Discard changes reloads the current saved draft.
The API checks owner administration, same-origin writes, bounded JSON and current
caller ownership before accessing or changing the draft. There is no publish action.

## Observed-cost checks

The selected 7/30/90-day UTC period uses up to the latest 100 saved calls made by
the owner from that exact caller number. Only snapshots for the configured Twilio
account qualify. A cost snapshot must have complete discovery, no failed sync,
exactly one matching browser leg, exactly one telephone leg, finished resources,
explicit nonnegative USD prices and consistent canonical call durations. Missing
prices, multiple legs, stale snapshots, unsupported routes, invalid durations and
other currencies are excluded and counted visibly. No FX conversion or zero-price
substitution is performed. Calls with explicit zero prices remain valid evidence.

The comparison sums browser connectivity, telephone connectivity and all known
recording creation charges. Each call separately rounds the telephone leg's connected
seconds up to whole minutes, then adds the draft attempt fee. Parent/browser time
does not become customer connected time. Unanswered attempts with published zero
connected seconds can still incur browser/provider charges and are checked against
the attempt fee. The draft can cover the aggregate sample while losing money on
individual calls, so the UI also shows how many calls cost more than the proposal.

For a chosen attempt fee, the sample-only connected-call minimum rate is the maximum
of `ceil(max(0, callCost - attemptFee) / ceil(connectedSeconds / 60))` across connected
calls, in integer micro-USD. Zero-second attempts need enough attempt fee; raising
the per-minute rate cannot cover them. No sample means no evidence of cost coverage.

These are historical direct-cost checks, not supplier quotes or a profit forecast.
Payment fees, dedicated numbers, recording storage, taxes, other add-ons, subscription
income and future supplier changes are outside the calculation. Recorded-call counts
show when the evidence includes recording creation costs. Use the existing **Sync
costs** action to refresh delayed or corrected prices; draft operations make no
Twilio requests and never debit a wallet.

## Release and verification

Apply additive `012_rate_drafts.sql` to the isolated validation database before the
protected billing preview, then prepare the production schema before merging. No new
environment variables or credentials are required. Drafts entered in preview stay
in the validation database and are not copied into production.

Run `npm test`, lint, typecheck and build. `node scripts/check-rate-draft-storage.mjs`
verifies migration idempotency, revisions, account/caller/owner boundaries, observed
cost checks and period/sample limits on the validation branch. All fixture and schema
writes roll back; no Twilio requests or billing mutations occur. Browser verification
checks editing, conflicts, period changes, empty/error states and mobile layouts.

References: [Twilio call prices cover connectivity](https://www.twilio.com/docs/voice/api/call-resource),
[recording creation prices](https://www.twilio.com/docs/voice/api/recording).
