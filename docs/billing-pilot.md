# Customer approval and billing sandbox

Updated 25 October 2026. This document records the isolated sandbox stage.
The current [paid-pilot release controls](paid-pilot-release.md) add versioned
offers, policies and real prepaid admission behind closed launch gates. The owner
has approved $19/month and $10/$25/$50 top-ups; calling rates remain pending.
This earlier release
adds the owner-reviewed customer workspace and a test-only payment integration.
It does not open paid calling or accept live payments.

## Access boundaries

- Existing `CLERK_ALLOWED_USER_IDS` operators retain their pilot access. This is
  the only group that can make real calls in this release. Their configured
  numbers remain assigned to the explicit legacy number owner.
- Other signed-in users save their business profile and select **Request account
  access** on onboarding. Requests, revisions, decisions and notes are stored in
  Postgres. Rejected requests can be resubmitted; suspended accounts require an
  owner decision. Approval opens the workspace and its own data, not paid calls.
- Only the existing configured owner/admin can use **Customer access** at
  `/console/customers` or its server API. A customer approval never grants an
  administrator role. Protected configured pilot accounts cannot be suspended
  through this customer queue.
- Number requests remain a separate workflow. Approving a business, verifying
  its number, paying, and granting real calling are separate decisions.
- Workspace/API checks await the current access record. Suspended customers
  lose access on subsequent requests. Existing active calls are not terminated.
  Opt-in callback emails use the same approved customer set and still require a
  verified recipient; this implementation does not send any test email.

## Test payment flow

`/console/billing` composes existing shadcn cards, tables, alerts, inputs, selects,
checkboxes and dialogs. It shows available credit, reservations, latest 50 ledger
entries, subscription status and links to Stripe-hosted Checkout/Customer Portal.
The mobile/tablet dock remains five items; Billing is reachable from the header.

The sandbox is restricted to the application owner, even when other users are
approved. Enable `VEILCALL_BILLING_TEST_ENABLED=true` with
`STRIPE_TEST_MONTHLY_PRICE_ID`, `STRIPE_TEST_WEBHOOK_SECRET`, and optionally
`STRIPE_TEST_PORTAL_CONFIGURATION_ID`. All payment operations use `stripeService()`
and its existing environment selection. Live mode is explicitly disabled in code;
no environment switch can launch live payments. The production Billing view has
no published monthly price or enabled checkout controls.

The fixture offer is $19/month plus separate $10/$25/$50 credit purchases in USD.
Customers must finish the subscription before topping up. Monthly renewal does
not replenish credit. These are test fixtures, not an approved commercial offer.
No subscription or payment was created by the catalog setup script.

Server-owned billing accounts map the Clerk operator and Stripe mode to a Stripe
Customer. The browser chooses an allowed top-up, never a customer ID or an
arbitrary charge amount. Order creation locks the account to prevent duplicate
open checkouts; customer and checkout creation use stable idempotency keys.
Checkout parameters are frozen before the provider request, so retries survive
configuration changes without changing the provider request body.

Only signed raw-body webhooks can credit an order or update paid state. The
success URL refreshes the view only. Payment fulfillment requires canonical
Checkout and PaymentIntent objects with matching customer, USD amount and paid
status. Delayed payment successes/failures and session expiration are handled.
Events and ledger references are durable and idempotent. Canonical subscription
reads under the customer's row lock make subscription/invoice events converge
despite replay and delivery order. Access also requires a paid-through timestamp,
not just a subscription status.

Refunds reconcile cumulative refunded amounts, including when payment events
arrive late. Refunds and disputes pause billing; later successes do not unpause
it. Resolution remains a manual operational task. An already spent refund can
make the credit balance negative; available funds display zero and calling is
blocked. The integration never automatically charges a replacement payment.

Required snapshot event destination (SDK API version, test mode):

```
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

Configure the endpoint at the isolated preview's `/api/billing/webhook`. For a
protected preview, use Vercel's supported authenticated automation mechanism for
the webhook; retain Clerk authorization and Stripe signature checks. Never print
or share a webhook URL containing a protection secret.

## Calling-credit simulation

Test credit cannot fund a telephone call. **Simulate call usage** does not invoke
Twilio. It quotes the selected owned number and an ordinary UK/Australian
landline/mobile route, requires explicit rate acceptance, and exercises the real
Postgres reservations and ledger. Quote fixtures are 6/9 cents per UK landline/
mobile minute and 8/18 cents per Australian landline/mobile minute, plus a one-cent
attempt fee. Connected seconds round up to whole minutes. Unsupported/special
routes are rejected. These figures must not become a live rate card implicitly.

The account row serializes reservations, allows one outstanding call, and limits
each reservation to the available unreserved balance and remaining $10 UTC daily
test cap, with at most five connected minutes. Unused permits expire after 45
seconds and are released on the next reservation. Consuming a permit binds its
account, destination, caller and unique call SID exactly once. Active holds are
not automatically released; settlement appends one usage debit and releases the
remainder once. Simulations stop at the reserved duration. Inconsistent durations
are capped at the quoted amount and pause the account for review.

This release deliberately does not connect these permits to the real Twilio
bridge. Before paid calling, implement the live route card, signed quote/permit
redemption, TwiML time limits, trusted terminal-call reconciliation of both voice
legs and recording/storage costs, abandoned-call recovery, and operational alerts.
The existing pilot's short-lived HMAC call tickets do not gain persisted one-use
redemption or prepaid limits merely by installing this sandbox.

Metronome remains the recommended option to evaluate for commercial usage billing.
The sandbox's application-owned ledger tests the proposed customer experience
without provisioning Metronome or committing to its commercial terms. Moving this
ledger into live service is a separate architecture decision, not a launch toggle.

## Setup and validation

Apply additive `007_billing_access.sql` after isolated migration validation.
`scripts/setup-billing-test.mjs --provision` creates/reuses only a test Product,
monthly Price and Customer Portal configuration, preserving existing local keys.
It writes IDs into ignored `.env.local`. Optional `--webhook-stdin` accepts one
JSON line containing `url` to configure the test webhook without a secret URL in
process arguments. The signing secret stays in ignored local storage.

`scripts/configure-billing-preview.mjs` targets only the linked VeilCall project's
`billing-pilot` Preview branch. It uses the existing isolated validation database,
development Clerk settings, owner IDs, test catalog and webhook configuration.
Real calling, recordings and callback emails are disabled there. Sensitive values
travel over stdin, and subprocess output is suppressed. This transfer requires
the owner's explicit approval after automatic approval review rejected it.
Production variables are not changed by that script. The owner approved this
scoped setup on 25 October 2026, and the branch-specific settings are configured.

The protected preview is available at
`https://veilcall-git-billing-pilot-ghostsyscoders-projects.vercel.app/console/billing`.
Its webhook uses a private project automation secret only for Vercel's protection
layer; Clerk still protects user APIs and Stripe signatures protect payment events.

Validation includes unit/API tests, real Postgres storage tests on the isolated
validation branch inside an outer rollback, and local headless component checks
at 320/390/768/1024/1440px. Storage tests use mocked Stripe objects and never make
payments, calls or email deliveries. Test catalog provisioning makes actual test
Stripe API calls. Hosted subscription and $10 top-up Checkout transactions were
completed with Stripe's documented test card in the protected preview. Actual
signed Stripe events activated the subscription and credited the wallet. A
60-second simulation debited seven test cents, leaving $9.93 and no held credit.
The browser-loaded Customer Portal showed the test subscription and test card.

Replayed paid webhooks returned HTTP 204 without adding credit again; a validly
signed event marked as live mode returned HTTP 403. Vercel request logs confirmed
HTTP 204 on the tested webhook deliveries. Unsigned webhooks and anonymous billing
and administrator requests were rejected. The preview's real-call token endpoint
returned HTTP 503 without a token. The verification sessions were signed out.
Production environment metadata and the production deployment were unchanged.

Before a live launch, approve final pricing, exact route economics, number rental,
credit/refund terms and tax treatment. Stripe Tax is not automatically enabled;
active tax registrations and collection requirements need to be confirmed first.

The isolated preview also includes a [stateful prepaid dialing test](prepaid-dialing-tests.md).
It exercises accepted quotes, one-use reservations, provider duration limits,
exactly-once settlement and recovery with a deterministic simulated provider.
Test credit remains separate from real calls; production calling is unchanged.
