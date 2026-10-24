# Stripe configuration and payment proposal

Updated 24 October 2026. The environment selection below is implemented. Pricing,
Checkout, subscriptions, usage billing, and paid onboarding below are proposals;
they are not enabled by installing the SDK or supplying API keys.

## Implemented environment selection

All future server billing code must obtain its Stripe client from
`stripeService()` in `src/lib/stripe.ts`. The official SDK is pinned to 23.0.1;
it uses that version's default Stripe API version. There is no payment endpoint
or client-side Stripe script in this release.

| Runtime | Selected variable | Required key mode |
| --- | --- | --- |
| Vercel Production deployment | `STRIPE_PROD_API_KEY` | `rk_live_` or `sk_live_` |
| Vercel Preview / Development / custom environment | `STRIPE_TEST_API_KEY` | `rk_test_` or `sk_test_` |
| Local dev, local production build/server, ordinary CI | `STRIPE_TEST_API_KEY` | `rk_test_` or `sk_test_` |

Live mode requires `NODE_ENV=production`, `VERCEL=1`,
`VERCEL_ENV=production`, a `dpl_...` `VERCEL_DEPLOYMENT_ID`, and no conflicting
`VERCEL_TARGET_ENV`. Vercel supplies these deployment variables. Requiring the
deployment ID also protects this project's local file, which contains copied
production environment flags. Do not manually copy deployment IDs into local or
test environments. A future move to another host needs an explicit mode policy;
`NODE_ENV=production` alone deliberately does not enable real payments.

Both modules are `server-only`. Configuration is evaluated on demand; missing
billing keys do not break existing calls or static builds. The selected key must
be present and have the expected mode. Missing or swapped keys cause a
`StripeConfigurationError`, with the variable name and no secret in its message.
There is no fallback to the other environment's key. Restricted keys are preferred;
the supplied restricted keys are supported without renaming.

Store the live key only in Vercel Production. Store the test key in Preview and
Development, and keep it in the ignored local environment file. Vercel changes
need a new deployment. Neither key belongs in a `NEXT_PUBLIC_` variable.

Products, Prices, Customers and subscriptions are isolated between Stripe test
and live modes. They will need separate IDs/configuration when billing is built.
Webhook signing secrets are separate from API keys and must also be scoped by
environment. A separate Stripe sandbox is preferable for new development.
No webhook secret or product/price variable is needed for this foundation alone.
Prefix validation verifies key type/mode, not whether a key is unexpired or has
the permissions that future Checkout, Billing and Portal operations will need.

## Starting offer

The first audience is individual salespeople and small agencies, paying in USD.
Start with one manually approved single-operator pilot offer:

- **$19 per operator per month** for the dialer, contacts/import, outcomes,
  callbacks/reminders, dashboard, call review, recording controls and private
  playback with the existing 30-day audio retention setting.
- **Calling credit purchased separately**, initially in $10, $25 or $50 amounts.
  The first payment is $19 subscription plus a $10 top-up, or $29 before tax.
  The monthly subscription does not replenish calling credit.
- Display a destination-specific per-minute rate before dialing. Draw usage
  from the prepaid balance. Do not promise unlimited calls or a universal rate.
- Do not bundle a dedicated number until provisioning, ownership and customer
  compliance approval are implemented. Quote any dedicated number separately.
- No automatic top-up initially. Add it later with explicit opt-in, a payment
  mandate and a customer-set cap. Define credit validity, cancellation and
  refunds clearly before selling. Prefer credit that survives monthly renewals
  while the account remains eligible; settlement rules need separate approval.

The $19 proposal is a willingness-to-pay experiment for the first 5-10 approved
operators, not a proven market price. Measure activation, completed calls,
repeat use, realized margin and support time before adding tiers or annual plans.
Quo currently lists a $19 monthly Starter seat with a number and US/Canada
calling, but its coverage and features differ. VeilCall's current pitch should
focus on the UK/Australia outreach and review workflow users have tested.
Do not advertise US/Canada calling as available until this account's restriction
has been resolved and both destinations have passed live tests.

## Calling economics

Twilio's public USD list prices checked on 24 October 2026 are below. These are
ordinary base routes, not an account-specific quote. Browser/app connectivity
adds $0.004/minute; recording adds $0.0025/recorded minute; storage is
$0.0005/recorded minute/month. The estimates assume one browser leg, one
telephone leg, recording throughout, and one month of storage, without taxes,
origin surcharges, special destinations, discounts or rounding differences.

| Ordinary destination | Telephone leg/min | Estimated combined provider cost/min | Candidate retail/min |
| --- | ---: | ---: | ---: |
| UK landline | $0.0158 | $0.0228 | $0.06 |
| UK standard mobile | $0.0305 | $0.0375 | $0.09 |
| Australia landline | $0.0252 | $0.0322 | $0.08 |
| Australia mobile | $0.0750 | $0.0820 | $0.18 |

Candidate retail rates are planning numbers only. UK origin-dependent and
special mobile rates can be much higher; ordinary country validation is not a
complete billing rate classification. Quote by destination prefix/type AND
outgoing caller origin, reject routes without an approved profitable rate, and
compare the exact route with actual account charges before publishing prices.

For scale: 1,000 fully recorded Australian mobile minutes at these assumptions
cost about $82 before payment fees and overhead. An unlimited $19 plan cannot
fund that usage. At a candidate $0.18/min retail rate, voice revenue is $180;
the $98 difference still needs to cover payment fees, infrastructure, support
and other expenses. It is not net profit.

Use `retail rate = route cost / (1 - target gross margin)` as the starting
calculation, then account for payment fees, currency conversion, number rental,
failed-attempt browser leg costs, taxes, support and actual billing increments.
Do not sell at cost plus a tiny markup. Collect a representative pilot sample
across landlines, mobiles, short and unanswered attempts before fixing the rate
card. Stripe processing fees depend on the merchant account country and method;
USD pricing does not imply US Stripe fees. Billing's public pay-as-you-go fee is
0.7% of Billing volume, separate from payment processing; confirm the account's
actual agreement and any Metronome fees before projecting margin.

Twilio rounds partial voice minutes up per leg. The current browser timer and
call-review duration are not a sufficient billing ledger. Store and reconcile
both browser and telephone provider records plus separate recording/storage
usage. A Call resource's `price` covers connectivity, not all add-ons. Fix the
customer's rate and rounding policy at call authorization; reconcile supplier
cost later without silently changing the customer's agreed rate.

## Payment flow to build next

1. Keep operator approval separate from payment. Check eligibility before
   offering Checkout so a blocked account cannot pay for unusable access.
2. Create a server-owned billing account and map it to the authenticated Clerk
   operator and a Stripe Customer. Scope provider object IDs and event IDs by
   test/live mode; never accept a customer ID or charge amount from the browser.
   A billing-account boundary lets future workspaces own shared bills without
   rewriting historical usage. Agency seats/shared contacts require a workspace
   and membership model; the existing app stores data per operator.
3. Use Stripe-hosted Checkout and Billing for the flat subscription, and
   Customer Portal for payment-method changes and cancellation. Create the
   actual Product and monthly Price in test mode first, then live after approval.
4. For the new usage/prepaid component, evaluate Stripe Metronome as Stripe's
   recommended usage billing engine alongside the flat Stripe subscription.
   Its payment-gated prepaid model releases credit only after payment succeeds.
   Confirm availability and commercial terms before choosing it. If a small
   pilot instead uses one-time Checkout top-ups and an application-owned credit
   ledger, that is an explicit engineering tradeoff: VeilCall owns rating,
   balances, refunds, reconciliation and overspend prevention.
5. Implement required signed, durable, idempotent webhooks before taking money.
   For Checkout, reconcile `checkout.session.completed` and
   `checkout.session.async_payment_succeeded` against payment status and handle
   asynchronous failure. Subscription changes require `customer.subscription.*`,
   `invoice.paid` and `invoice.payment_failed`. Handle refunds/disputes and
   out-of-order delivery. Verify raw-body signatures with the matching mode's
   webhook secret; reject the wrong mode. Credit/access must never depend on
   visiting the success page. Map events through persisted provider ownership.
6. Calling authorization must require an eligible account, paid subscription,
   an approved caller identity/route and enough unreserved credit. Atomically
   reserve credit and redeem a one-use call permit; reject concurrent attempts
   that would spend the same balance. Enforce call duration at Twilio based on
   that reservation, including browser/recording costs and a safety allowance.
   Settlement releases unused reservations or debits confirmed usage exactly
   once. Asynchronous spend notifications alone cannot stop an in-flight call.
7. Present balance, reserved/pending usage, the rate quote, transaction history
   and invoices in the app using shadcn/ui. Start with one concurrent call and
   low per-account daily spend caps. Require balance/storage/rating services
   for paid calling; the current pilot permits calling without review storage.
8. Configure taxes, terms, recording consent and refund/credit policy before
   launch. Consider Stripe Tax for the selling countries; automatic tax needs
   applicable active registrations, not just an enabled flag. Do not treat
   test/live API keys as evidence the Stripe business is activated for payouts.

Neither open onboarding nor the existing owner's access has changed in this
release. Paid account state, a credit ledger, spend reservations, one-use permits,
per-account caller-ID allocation, payment webhooks, Checkout and Customer Portal
remain implementation work before a paid public launch.

## Validation

`npm test` includes environment-selection tests for Vercel production, Preview,
custom environments, local production builds with copied flags, swapped/missing
keys, restricted/secret/public key types, secret-safe errors and lazy SDK setup.
The tests use generated fixtures and make no Stripe requests or charges.

## Sources

- [Stripe API key modes and restricted keys](https://docs.stripe.com/keys)
- [Vercel system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables)
- [Stripe subscription Checkout](https://docs.stripe.com/billing/quickstart)
- [Stripe webhook fulfillment](https://docs.stripe.com/checkout/fulfillment)
- [Stripe customer portal](https://docs.stripe.com/customer-management/integrate-customer-portal)
- [Stripe Billing pricing](https://stripe.com/billing/pricing)
- [Stripe Tax for recurring payments](https://docs.stripe.com/billing/taxes/collect-taxes)
- [Metronome payment-gated commits](https://docs.metronome.com/guides/pricing-packaging/apply-credits-and-commits/manual-payment-gated-commits)
- [Twilio UK list prices](https://www.twilio.com/en-us/voice/pricing/gb)
- [Twilio Australia list prices](https://www.twilio.com/en-us/voice/pricing/au)
- [Twilio billing rounding](https://help.twilio.com/articles/223132307-How-do-you-rou)
- [Twilio call prices and invoice reconciliation](https://www.twilio.com/docs/voice/why-doesnt-my-invoice-match-what-i-pull-from-the-call-logs)
- [Quo plan comparison](https://www.quo.com/pricing)
