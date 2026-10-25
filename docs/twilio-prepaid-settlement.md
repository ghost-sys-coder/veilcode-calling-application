# Twilio prepaid settlement stage

This adds the real-provider verification and recovery layer after the deterministic
[prepaid dialing tests](prepaid-dialing-tests.md). It does **not** enable live
payments or paid calls. Existing owner calls and recordings use their existing
routes. No existing call is backfilled into a customer wallet or charged.

## Admission boundary

`preparePrepaidTwilioCall` is deliberately not connected to the live dialer or an
admission API. It first checks `liveBillingEnabled()`, which remains hard-coded to
false. No environment variable enables it. Future admission must still authenticate
the Twilio request and signed operator permit before calling this function.

The staged admission function rechecks caller ownership and consumes an unexpired
live-wallet reservation, with recorded `prepaid-live-v1` rate acceptance matching
its immutable quote. Test wallets and simulated provider identities are rejected.
The provider account, parent call and recovery job bind in the same transaction as
permit consumption. A replay cannot create a second dial. Its TwiML caps connected
time at the accepted limit (at most five minutes), rings for 30 seconds, disables
recording, and installs the prepaid callback and final Hangup.

No live quote/checkout/admission workflow is exposed by this stage. The existing
test workflow continues to use only its synthetic provider.

## Completion and evidence

`POST /api/voice/prepaid/callback` verifies the exact Twilio signature and configured
account through the existing webhook verifier. Both a Number terminal callback and
the Dial action can wake an already bound job. The action returns Hangup XML.
Callback durations, charges and caller-supplied metadata never authorize a debit.
Unknown calls cannot create a settlement job.

The adapter fetches the parent and lists up to two children through the authenticated
Twilio SDK. It requires exactly one telephone child and verifies both account IDs,
the original browser identity/direction, parent-child association, reserved caller,
destination, terminal statuses and explicit, consistent durations. A missing child
or unpublished duration stays pending; additional or foreign legs require review.
Usage comes from canonical connected telephone seconds, not browser-leg time.

The locked ledger rounds seconds against the accepted rate, deduplicates by
reservation and releases the unused hold. A duration overrun is never charged above
the accepted maximum and blocks further wallet spending. No supplier price is
invented from duration: actual browser, telephone and recording costs remain the
separate owner cost-report integration. This stage does not bill for recordings.

## Recovery operations

Migration `010_twilio_settlements.sql` is additive and creates an initially empty
queue. Leases last 90 seconds, claims are bounded to three jobs, and transient
failures back off from 15 seconds to 15 minutes. Twelve unsuccessful attempts or
conflicting evidence move a job to review, retaining the hold. Callbacks cannot
remove review status or shorten retry backoff after the first attempt. Raw provider
errors and credentials are not persisted.

The initial recovery due time includes the connected cap and a two-minute buffer,
so a missed callback does not remove the job. Signed terminal callbacks wake it
earlier. A callback attempts reconciliation after responding; unfinished provider
records schedule a later retry. An interrupted worker can be claimed after its
lease expires. A committed ledger with an unfinished job recovers without another
provider fetch or debit.

Existing owner administrators can inspect aggregate queue counts with authenticated
`GET /api/admin/call-settlements`. A same-origin, bodyless `POST` to that endpoint
processes up to three due jobs. It accepts no reservation, duration or amount from
the browser. These operations remain available if new live calling is paused.

**A recurring worker is not enabled in this stage.** Due retries require another
terminal callback or the owner recovery action. Before admitting live customers,
connect a separately authenticated recurring worker, add an owner review screen
and audited resolution procedure, and verify missed-callback recovery while the
app is closed. The active GitHub reminder workflow is unchanged.

## Validation and release

No new environment variables or live credentials are required for the preview.
Apply migration 010 to the isolated validation database before deploying to the
existing protected billing preview. Do not seed live wallets, bind historical calls,
or migrate production as part of this stage.

- Unit checks cover provider identity, missing/inconsistent duration, multiple legs,
  callback authentication, paused admission, recovery and owner endpoint access.
- `node scripts/check-twilio-settlement-storage.mjs` applies migrations twice and
  tests permit/quote binding, worker leases, stale workers, retained holds, debit
  deduplication, interrupted completion, review and capped overruns. Schema and
  fixture writes roll back on the dedicated validation database. It makes no
  Stripe or Twilio requests.
- `node scripts/check-twilio-settlement-provider.mjs` is a separate, read-only check
  against up to five existing owner call records. It verifies real provider record
  shapes without creating calls, reading audio, binding historical reservations or
  writing wallets. It requires the existing production call-history connection and
  existing owner voice credentials and prints aggregate counts only.
- Run the full test suite, lint, typecheck and production build before release.

Commercial launch still requires approved origin-aware prices, the live funding and
admission integration, recurring recovery, review operations, and an end-to-end
real-provider pilot. The provider adapter alone does not establish that launch.

Provider references: [Call resource and durations](https://www.twilio.com/docs/voice/api/call-resource),
[Number terminal callbacks](https://www.twilio.com/docs/voice/twiml/number),
[Dial action and limits](https://www.twilio.com/docs/voice/twiml/dial).
