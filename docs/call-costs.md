# Owner call costs

The owner can open **Call costs** in the desktop sidebar, or select **View call
costs** in Billing on any screen size. Page and API access require the existing
configured owner/admin. Approving a customer never grants access to supplier costs.

The report covers the latest 100 saved application calls within 7, 30 or 90 UTC
calendar days, including today. Its known-charge total covers that sample only,
not every call on the Twilio account. Each call shows its browser leg, all discovered
telephone legs, and one-time recording charges, grouped by currency. Prices use
integer micro-units and are never inferred from a browser timer or a public rate.
The owner can review their own calls; the report does not grant playback or review
access to another operator's recordings.

The account recording-storage snapshot uses the same date range but includes the
whole configured Twilio account. It is displayed separately and is not allocated
to individual calls or added to the call sample. Number rental, tax, Stripe fees,
other add-ons and infrastructure costs are excluded. This is an operational
supplier-cost report, not invoice reconciliation or a published customer rate card.

Finished call and recording callbacks schedule capture after acknowledging the
signed webhook. Provider failures do not block the existing outcome or recording
metadata updates. Prices can arrive later. **Sync costs** checks up to five saved
finished calls per request, starting with the least recently attempted calls, and
refreshes account storage. The result states how many more calls are ready. A
one-minute per-call cooldown and a 90-second lease prevent duplicate work. Call
history's existing **Sync recent calls** imports missing provider calls; cost sync
does not enumerate or import unrelated account calls.

`Published` means every discovered resource has a provider price and terminal
status. Missing prices, a missing expected telephone leg, deleted recordings whose
charges were never captured, and running resources remain pending. Failed refreshes
retain previous snapshots and show **Sync needed**. Zero is shown only when the
provider explicitly returned a zero price. Already captured recording charges
survive audio deletion. Subsequent successful syncs can update provider corrections;
they never append duplicate charges or write to a customer's credit ledger.

Collection verifies the provider account, browser caller identity, parent-child
associations and recording parent before storing metadata. It reads metadata only,
never audio, and never places calls, starts recordings or changes Twilio resources.
Enumerations are bounded at ten telephone legs and 100 recordings per call; reaching
the bound fails the refresh instead of publishing a partial enumeration as final.
Amounts with unsupported decimal precision stay unknown. Currencies are not converted.

## Deployment and validation

Owner draft pricing and observed-cost comparisons are documented in
[Draft calling rates](draft-calling-rates.md). They stay inside Call costs and
cannot publish prices, change sandbox rates or charge customer credit.

Apply additive `008_call_costs.sql` before deploying the code. Existing production
Clerk owner settings, `DATABASE_URL` and Twilio credentials are reused; no additional
environment variables are required. Live Checkout and paid calling remain disabled.

Run `npm test`, `npm run lint` and `npm run build`. Run
`node scripts/check-call-cost-storage.mjs` against the existing isolated validation
branch. It validates the migration twice and exercises leases, cooldown, stale-token
rejection, retained recording costs, missing prices, mixed currencies, date filtering,
review ownership and account-scoped storage. All fixture and schema writes roll back.

Provider definitions:
- [Call prices cover connectivity and may be delayed](https://www.twilio.com/docs/voice/api/call-resource)
- [Recording prices cover one-time creation](https://www.twilio.com/docs/voice/api/recording)
- [Account usage categories, including recording storage](https://www.twilio.com/docs/usage/api/usage-record)
