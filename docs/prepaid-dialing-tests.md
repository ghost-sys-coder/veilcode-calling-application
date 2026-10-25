# Prepaid dialing tests

This stage tests the complete quote → reserve → start → settle flow in the existing
isolated billing preview. It does not enable paid calls or execute TwiML at Twilio.
Production owner calling and the live-payment boundary remain unchanged.

Open **Billing & credit → Test prepaid dialing** in the protected `billing-pilot`
preview. The existing paid test subscription and test credit are reused. No new
Stripe product, payment or environment variable is required.

## Customer flow being tested

1. Choose an owned caller, UK/Australia destination and preview the rate. A persisted
   quote freezes the route, per-minute rate, attempt fee, maximum connected seconds
   and maximum charge. It expires after 45 seconds and does not hold any credit.
2. Accept the displayed rate and maximum charge. The server rechecks subscription,
   current caller ownership, credit, daily cap and concurrent reservations. Acceptance
   time and version are recorded. The reservation holds the quoted maximum for 45
   seconds. A retry returns the same unused reservation rather than another hold.
3. Choose a simulated outcome and requested connected seconds, then start. A caller
   revoked since acceptance cannot start. The reservation becomes a one-use permit,
   bound to one server-created provider run and immutable scenario. Start retries
   reuse that run. They cannot change the result or create another call.
4. The provider fixture caps connected seconds at the reserved limit. The shared
   TwiML renderer generates `Dial timeLimit`, a 30-second ringing timeout, disabled
   recording, and a final `Hangup`. Tests verify those instructions without sending
   them to Twilio. The existing real-call TwiML route is not changed in this stage.
5. Complete the test to fast-forward its saved provider result. Both canonical call
   legs must be terminal and match the reserved operator, provider account, parent,
   destination and caller. Completion requests accept no duration, price or provider
   identifiers from the browser. The existing locked ledger deducts accepted usage
   once and releases the unused hold. Repeated completion cannot charge again.

Unanswered, busy, failed and ringing-canceled tests have zero connected seconds and
pay only the accepted test attempt fee. Canceling an unused reservation or letting
it expire releases its full hold without charging. An active run cannot be canceled
by simply releasing its hold; it must settle against the saved provider result.

The fixture rates remain 6/9 cents per UK landline/mobile minute and 8/18 cents per
Australian landline/mobile minute, plus a one-cent started-attempt fee. Connected
seconds round up to whole minutes. Calls are capped at five connected minutes and
the available credit, with a $10 cap per UTC call-start day. These are test fixtures,
not approved live prices or a complete supplier-cost model.

## Recovery and isolation

The provider run is created in the same database transaction that consumes the
permit. Its scenario, bounded duration and simulated finish time are durable.
Refreshing or reopening the page restores a reserved/active run. Recovery releases
unused expired holds and settles a run only after its saved completion or simulated
finish time. It does not release an active hold merely because the browser closed.
Interrupted settlement resumes from the durable provider result and ledger key.

Recovery runs when the page opens, refreshes, or polls while visible. There is no
claim of background execution while this test preview is closed. Natural simulated
completion allows up to 35 seconds for ringing, including Twilio's documented buffer.
Manual completion is an explicit fast-forward of this deterministic fixture.

The test API requires the existing authenticated owner, same-origin writes, enabled
test billing, the exact isolated validation database, and disabled real calling,
recording and callback emails. Production and production DB connections fail before
the test ledger is accessed. Synthetic calls never enter real call history, supplier
cost tracking or recordings. Normal customer approval does not grant sandbox access.

## Deployment and checks

Apply additive `009_prepaid_call_tests.sql` to the existing validation branch before
deploying this feature to the `billing-pilot` Preview. Production is not migrated or
deployed for this test stage. Existing preview variables and its approved automation
bypass are reused; no additional live Twilio credentials are copied.

Validation:
- `npm test`: environment isolation, TwiML limits, provider binding, caller revocation,
  consent, immutable result inputs and API restrictions, plus existing regressions.
- `node scripts/check-prepaid-storage.mjs`: full Postgres lifecycle, quote/permit
  expiry, duplicate starts/settlement, failed attempts, balance changes, daily caps,
  cancellation and recovery. All fixture/schema writes roll back.
- Headless browser checks across phone, tablet and desktop, followed by authenticated
  preview checks with actual test credit and concurrent reservation/start requests.

A commercial release still needs approved origin-aware route economics, pricing and
policies, a live provider adapter with signed callbacks and authoritative provider
fetches, abandoned-call handling, and reconciliation of both legs and recording costs.
The deterministic test provider does not establish that live integration by itself.

The next staged backend is documented in [Twilio prepaid settlement](twilio-prepaid-settlement.md).
It adds canonical provider verification and a durable recovery queue while keeping
live admission disabled; it does not change this deterministic test flow.

References: [Twilio Dial limits and ringing buffer](https://www.twilio.com/docs/voice/twiml/dial),
[call records and duration](https://www.twilio.com/docs/voice/api/call-resource).
