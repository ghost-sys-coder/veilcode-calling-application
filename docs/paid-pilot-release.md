# Paid pilot release controls

VeilCall's approved starting offer is **$19 per operator/month**, with separate
**$10/$25/$50 USD credit purchases**. No connected-minute or attempt rates have
been approved. Live commerce remains closed until the owner supplies them and
completes the release controls. Existing configured owner calling is preserved.

## Owner setup

Open Billing & credit → Paid pilot setup. This reuses shadcn cards, a dialog,
inputs and checkboxes; it adds no navigation section or subscription tiers.

Save the operator's legal name, country, business address, support/privacy email,
live monthly Stripe Price ID, policy URLs/revision and exact outgoing-number
rates. Incomplete offers can be saved privately. The company currently supplied
is VeilCode Studio, based in Uganda with a UK presence. Customers may be
individuals, freelancers, agencies or businesses. No email/address is invented.

Use **VeilCall policy drafts** to select the four application-specific documents.
The terms page includes the full bundle for printing/saving. Saving captures
the rendered wording and business details in the database, independently of
later code changes. Review that saved snapshot before approving publication.
The wording covers the actual approval flow, caller IDs, rate acceptance,
unanswered-attempt fees, holds, recordings, privacy, retention, cancellation,
unused-credit refunds and consumer rights. Business details, tax treatment and
policy approval remain explicit owner decisions before a commercial release.

Rates are USD micro-units per connected minute plus a per-attempt fee. They are
bound to an exact outgoing number and one of the four ordinary GB/AU routes.
Private drafts on Call costs never become published prices automatically.
Changing form values or saving a new draft does not change an active offer.
Versions and owner stage/activate/pause actions are audited with stale-write
protection. Old activated policy snapshots remain accessible even after a pause.

## Release gates and environment

Apply additive migration `013_pilot_release.sql` before deploying. It creates
offer/control/audit/acceptance tables and nullable offer references on orders and
quotes. It does not seed prices, alter balances or open commerce.

New optional Production-only variables:

| Variable | Default / purpose |
| --- | --- |
| `VEILCALL_LIVE_BILLING_ENABLED` | Absent/false closes new live commerce; never set during sandbox verification |
| `STRIPE_PROD_WEBHOOK_SECRET` | Live endpoint signing secret, distinct from the API key and test secret |
| `STRIPE_PROD_PORTAL_CONFIGURATION_ID` | Live portal with cancellation/invoices and without unapproved plan changes |

The monthly live Price ID is versioned with the offer in Postgres, not another
environment variable. Existing Stripe mode selection is unchanged: only a real
Vercel Production deployment selects the live key. Preview/local use test mode.

Even with the release switch set, opening requires a complete saved offer,
explicit `OPEN PAID PILOT` owner confirmation, an activated Stripe business,
matching live USD monthly Price, active cancellation portal, every required
signed webhook event, configured calling and 30-day audio retention. Activation
also rechecks that each priced number is still owned or verified in the same
Twilio account. Restricted Stripe keys need read access for these readiness
checks as well as the existing Customer/Checkout/Portal/Billing operations.

Pausing blocks new checkout requests and paid call admission. It does not cancel
previously issued Stripe Checkout URLs, erase balances or stop settlement of
already admitted calls. Signed payment/refund/dispute processing and customers'
portal access remain available while new commerce is paused. Resolve an already
issued payment or refund through Stripe and the canonical webhook flow.

## Customer payment and calling

Customers need owner-approved workspace access, an active assigned number and a
published rate for that number before being offered payment. Policy acceptance
records the immutable offer ID and timestamp. A separate, unchecked-by-default
immediate-service request preserves consumer cancellation rights; without it,
paid calling and checkout wait 14 days, so the customer is not charged before
calling can become usable. Replaying acceptance cannot alter the original choice.

Hosted Checkout uses server-owned prices and orders. Current subscription pricing
comes from its server-created order; publishing another offer does not silently
change a customer's existing Stripe subscription. Live and test customers,
events, balances and provider objects remain mode isolated. Canonical paid
Checkout/PaymentIntent/Charge confirmation credits a top-up once. Refunds and
disputes retain their sticky billing pause. No success-page visit grants credit.

The paid dialer offers UK/Australia only. Its quote freezes the outgoing number,
destination route, rate, attempt fee, maximum charge and duration. Acceptance
atomically reserves unreserved live credit and issues a signed, one-use permit.
At redemption, Postgres rechecks the active offer, policies, access, caller
assignment, provider account, paid subscription and permit expiry under locks.
Twilio's signed request must match the operator identity and exact bound numbers.
Test credit cannot enter this path. Tracking must succeed before a paid call dials.

The TwiML enforces the quoted duration (at most five connected minutes), rings
for at most 30 seconds and hangs up the browser leg after Dial. Recording starts
off, retaining the existing consent-based recording controls. Rates must cover
provider voice and recording costs; supplier costs never retroactively change
the accepted customer rate. Canonical terminal provider records settle once,
update history and release unused holds. Missing evidence retains the hold for
recovery/review. Expired unused permits release on the next status/billing check.

The dialer shows pending holds and the latest final charge after reload. A single
outstanding call and a $10 UTC daily usage cap remain enforced by the ledger.

## Verification

- `npm test`: closed launch, configuration/policy validation, accepted quotes,
  signed one-use TwiML, canonical live webhook ownership, mode isolation, replay
  and the existing app regressions.
- `node scripts/check-live-pilot-storage.mjs`: real SQL release/CAS/snapshots,
  acceptance/waiting period, test/live funds, quote/hold/admission, suspension,
  revocation, pause, settlement/history and unused-permit expiry. Exact validation
  database guard; all changes and wallet fixtures roll back.
- Existing settlement storage verification continues to exercise worker leases,
  retries, crashes, overruns, quarantine and audited owner rechecks.

These checks make no real calls, payments, recordings or emails. A real paid
pilot call still requires supplied commercial rates, completed policies/business
details, explicit activation and an owner-authorised test recipient.

Policy drafting references: [Twilio recording responsibilities](https://www.twilio.com/docs/voice/api/recording),
[Twilio acceptable use](https://www.twilio.com/en-us/legal/aup),
[UK service cancellation rules](https://www.legislation.gov.uk/uksi/2013/3134/regulation/36/made),
[UK online contract information](https://www.gov.uk/online-and-distance-selling-for-businesses).
