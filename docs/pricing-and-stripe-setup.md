# Pricing proposal and Stripe setup

Prepared 25 October 2026. All amounts are USD. Route prices below are private
planning drafts for the existing UK outgoing number, not published tariffs.
Live purchases and paid calling remain closed.

## Proposed offer

- Subscription: approved $19.99 per operator/month. No included calling credit or
  dedicated number rental.
- Credit purchases: approved $10, $25 and $50. No automatic top-up.
- Ordinary UK landline: draft $0.06 per connected minute.
- Standard UK mobile: draft $0.09 per connected minute, subject to the UK prefix
  restriction below. This must not be published as a price for every UK mobile.
- Ordinary Australia landline: draft $0.08 per connected minute.
- Ordinary Australia mobile: draft $0.18 per connected minute.
- Every route: draft $0.01 per attempt, including unanswered attempts, plus
  connected telephone seconds rounded up to whole minutes for each call.
- Recording capture and the existing 30-day audio retention are intended to be
  covered by these draft rates, without a separate recording surcharge.

Example: a 3-minute standard UK mobile call would cost $0.28; an Australian
mobile call of the same length would cost $0.55. An unanswered attempt would
cost $0.01. All charges need to appear in the accepted dialer quote.

## Evidence and limitations

Read-only account-specific Twilio Voice Pricing v2 checks for the existing
outgoing caller returned these telephone-leg tariffs:

| Route | Supplier USD/minute | Proposed retail USD/minute |
| --- | ---: | ---: |
| UK ordinary landline | 0.0158 | 0.06 |
| UK standard mobile | 0.0305 | 0.09 |
| Australia ordinary landline | 0.0252 | 0.08 |
| Australia ordinary mobile | 0.0750 | 0.18 |

Telephone tariffs exclude browser audio, recording, storage, payment processing,
taxes, number rental and application overhead. Current public Twilio prices
also list browser audio at $0.004/minute, recording capture at $0.0025/minute and
storage at $0.0005/recorded minute/month. Provider billing increments and ringing
can make a short call more expensive per connected minute. The attempt fee is a
buffer for the browser connection; it is our proposed fee, not a claim that
Twilio charges a fixed one-cent fee for every attempt.

The saved complete USD sample contains three UK mobile calls (one recorded),
costing $0.1775 in total, and five Australian mobile attempts (two connected),
costing $0.1580. At the proposed prices, hypothetical revenue is $0.48 and $0.41
respectively. No eligible sampled call costs more than its proposed charge.
The combined $0.5545 difference is before storage, payment processing, tax,
number rental and all other overhead; it is not profit. No saved eligible
landline calls exist. This sample is too small to establish long-term margins.
Subscription income is separate from this usage calculation.

**UK mobile tariff safeguard:** the account-specific price list also includes
UK Mobile Other at $0.32/minute and Personal at $0.5577/minute. Ordinary-looking
mobile numbers can fall into higher-cost prefix groups. The current generic
`GB_MOBILE` route and common premium exclusions do not prove a number qualifies
for $0.0305 termination. Paid quotes now fetch Voice Pricing v2 for the exact
destination and outgoing number after admission checks and before writing a
quote. Unknown/mismatched/non-USD prices and provider outages reject the quote.
The retail minute rate must cover the highest matching origin tariff and an
additional $0.007/minute allowance for browser audio, capture and 30-day storage; the
attempt fee must cover an additional $0.004 browser minute for ringing/rounding.
This blocks expensive prefixes and origin surcharges at the proposed rates.
It does not guarantee profit or freeze Twilio's future prices. A single tested
mobile number is not evidence for every UK mobile prefix. Other originating callers can attract surcharges; drafts
must be checked again for each newly assigned caller. Never copy this proposal
to a Ugandan caller identity without checking its origin-specific tariffs.

Recheck live account tariffs before launch and periodically afterward. Do not
publish all four routes simply because saving a private offer is possible.

## Confirmed operator details

VeilCode Studio, Uganda, with a UK presence.
Business address: Tankhill Road, Muyenga, Kampala, Uganda.
Support, complaints, cancellation and privacy: support@veilcode.studio.
The owner states that the business is a sole proprietorship, not VAT registered,
and gives its operator/trading name as VeilCode Studio. No individual proprietor
name has been supplied; none is invented or represented as independently verified.
The owner reports completing policy review. The saved private offer already has
both review checkboxes completed; those existing owner choices were preserved.
Non-registration alone is not a finding that no tax obligations apply to every
customer jurisdiction. No VAT registration or automatic-tax collection was added.
Updating draft defaults does not
rewrite previously saved policy snapshots or accepted contracts.

## Stripe dashboard walkthrough

The existing live API key was checked read-only. Its account reports country GB,
payments and payouts enabled, details submitted and no currently-due fields.
The owner created a $19.99 USD monthly Price and explicitly confirmed keeping
that amount instead of the original $19 proposal. The live portal has invoice
history, payment-method changes and end-of-period cancellation enabled, with
plan changes disabled; its configuration ID is now scoped to Vercel Production.
The live webhook is enabled at the correct URL, and the missing checkout,
subscription, refund and dispute event subscriptions have been added to it.
Its signing-secret variable is scoped only to Production. Its snapshot version
is currently `2026-08-26.dahlia`, while canonical API reads use the installed
SDK's `2026-09-30.endive`. The Node handler consumes only signed event type/mode
and resource/customer identifiers from snapshots; invoice, subscription, charge,
dispute and Checkout billing facts are fetched canonically with the current SDK.
Contract tests cover Dahlia and Endive invoice envelopes with misleading snapshot
subscription fields, plus Dahlia signed payloads and canonical top-up fulfillment.
The reviewed envelope is compatible with this handler; no endpoint replacement
or signing-secret rotation was needed. The
existing endpoint and signing secret were preserved. An existing, non-payment
VeilCall `product.created` event was resent to that exact live endpoint using the
official Stripe CLI. Stripe reported one pending webhook immediately after the
resend and zero afterward, confirming successful delivery of the signed event.
The handler ignores this event after signature/mode validation; it does not
create financial objects or fulfill a payment. This proves delivery/signature
handling, not end-to-end paid fulfillment. Account readiness is not a tax determination.
The confirmed live Price and business details are saved as an audited private
pilot offer. Existing owner review approvals are retained; rates stay private
until the final release. The proposed calling prices are also saved in Call costs. No offer has
been activated, and no customer payment or calling-credit entry was created.
Confirm that Stripe's legal merchant identity and payout details represent the
actual operator; UK presence alone does not establish a separate UK company.

1. Open the Stripe Dashboard and select the same account in **live mode**.
   Review business details, public support details and payout bank information.
   Keep the existing account country/legal identity accurate; the app's Uganda
   address is not an instruction to replace a registered UK entity's address.
2. Open **More > Product catalog > Add product**. Name it **VeilCall — Single
   operator**. Describe browser calling and call management; calling credit and
   number rental are separate. Use flat-rate **$19.99 USD, recurring monthly**,
   one operator, without a trial or setup fee. Review tax treatment before
   publication: the current integration expects any applicable tax included in
   the approved total, rather than adding tax on top. Do not enable automatic
   tax without the corresponding registration/setup. Copy the resulting
   `price_...` ID into **Billing & credit > Paid pilot setup** and save privately.
   The app creates $10/$25/$50 top-up line items server-side; three additional
   catalog products or Payment Links are not required.
3. Open **Settings > Billing > Customer portal**. Enable invoice history,
   payment-method management and cancellation at the end of the paid period.
   Leave subscription/plan/quantity changes disabled. Save the live
   configuration; store its `bpc_...` ID as
   `STRIPE_PROD_PORTAL_CONFIGURATION_ID` in Vercel **Production**.
4. Open **Workbench > Webhooks > Create an event destination**. Select **Your
   account**, **Snapshot** payload, API version **2026-09-30.endive** (the version
   pinned by the installed Stripe SDK), and the event types below. Choose
   **Webhook endpoint** and enter exactly:

   `https://call.veilcode.studio/api/billing/webhook`

   After creating the destination, reveal its signing secret and store it as
   `STRIPE_PROD_WEBHOOK_SECRET` in Vercel **Production**. It begins `whsec_` and
   is different from the live API key. Do not put the secret in chat, source
   control, a public `NEXT_PUBLIC_` variable or Preview. Keep the test endpoint
   and test signing secret separate.

   Required snapshot events:

   ```text
   checkout.session.completed
   checkout.session.async_payment_succeeded
   checkout.session.async_payment_failed
   checkout.session.expired
   customer.subscription.created
   customer.subscription.updated
   customer.subscription.deleted
   invoice.paid
   invoice.payment_failed
   charge.refunded
   charge.dispute.created
   charge.dispute.closed
   ```

5. Redeploy Production after environment changes. Keep
   `VEILCALL_LIVE_BILLING_ENABLED` absent/false while checking delivery, portal,
   price, policies, caller tariffs and tax treatment. Snapshot webhook handling
   and the portal remain available while new purchases are paused.
6. Review the saved offer and exact policies. Only an explicit owner release
   should set the live switch and activate the saved offer. Do not create a
   real payment or paid call merely to verify configuration. Later, an
   authorized paid pilot verifies checkout, durable subscription/credit,
   quoted usage, settlement, cancellation and webhook retries end to end.

Only the Price and portal IDs are non-secret references suitable for sharing.
The API key is already supplied; no replacement key is needed for this setup.

## Verification of tariff safeguards

190 automated tests, lint, TypeScript and the production build pass. The real
SQL validation suite passes with every change rolled back and a deterministic
provider-price fixture. Guard tests cover standard routes, expensive UK mobile
prefixes, origin surcharges, missing/wrong currency or identities, malformed
prices, provider outages, and no quote/hold creation after refusal. Read-only
account-specific pricing checks for two existing successful calls matched the
exact origin/destination identities and returned the expected UK/AU mobile
tariffs. No new call, recording, subscription, charge or credit was created.

References: [Twilio account-specific Voice Pricing](https://www.twilio.com/docs/voice/pricing),
[UK Voice prices](https://www.twilio.com/en-us/voice/pricing/gb),
[Australia Voice prices](https://www.twilio.com/en-us/voice/pricing/au),
[Stripe products and prices](https://docs.stripe.com/products-prices/manage-prices),
[Stripe customer portal](https://docs.stripe.com/customer-management/integrate-customer-portal),
[Stripe webhooks](https://docs.stripe.com/webhooks).
