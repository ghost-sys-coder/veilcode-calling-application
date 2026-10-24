# Business and phone-number onboarding

New accounts can submit business details and request a calling number at
`/onboarding`. Approved operators use `/console/numbers`, available through the
sidebar and the phone icon in the workspace header. The five mobile navigation
destinations are retained. New sign-ups land on onboarding; unapproved users who
open the dialer are redirected there.

## What this release supports

- Business/trading name, contact name, business country, optional HTTPS website
  and calling purpose. Each submitted number request keeps a business snapshot
  so later profile edits do not change what the administrator approved.
- **Use an existing number:** enter an international number and confirm control.
  An administrator reviews the request first. The user then explicitly agrees
  to a Twilio verification call, answers it and enters the displayed six-digit
  code on their phone. The code is not entered into VeilCall. The call is in
  English, with a ten-second delay to allow the page to show the code.
- **Request a new number:** request US, Canadian, UK or Australian numbering,
  with an optional preferred area or number type. An administrator confirms
  availability, eligibility, required documents and the agreed rental, provisions
  the number through the existing Twilio process, then assigns it in VeilCall.
  The assignment checks that it is already owned by this Twilio account,
  supports voice and matches the requested country. The app does not buy numbers
  or change their incoming-call routing.
- **Owner review:** `/console/numbers/review` supports filtered requests,
  approval, requesting changes, assignment of provisioned numbers and disabling
  assigned numbers. Reviews require the expected revision; stale actions fail
  with HTTP 409. Review messages are visible to the requesting user. An audit
  table records submission, verification results and administrator actions.

Neither a new Clerk account, setup approval nor phone verification grants paid
calling access. `CLERK_ALLOWED_USER_IDS` remains the real-calling pilot gate. The
[customer access and billing sandbox](billing-pilot.md) adds a separate owner
decision for workspace access and test-only payments. Current records are owned by
an individual operator; shared agency workspaces and Twilio subaccounts are a
later integration rather than a feature of this release.

Verified caller IDs apply to outbound calling where Twilio/carriers permit
them. An existing number's incoming calls stay with its current provider;
verification is not a number port. A requested number's country is distinct
from the destination country. Existing destination restrictions still apply.

## Configuration and deployment

This release adds two server environment variables:

```dotenv
# Owner/admin Clerk IDs, comma-separated. Every administrator must also be an
# approved operator. No automatic administrator role for other approved users.
VEILCALL_ADMIN_USER_IDS=

# Sole owner of the configured TWILIO_PHONE_NUMBER and TWILIO_CALLER_IDS.
TWILIO_CALLER_ID_OWNER_USER_ID=
```

Set both to the existing owner's Clerk ID in this single-operator installation.
Keep `CLERK_ALLOWED_USER_IDS` unchanged for customer onboarding; use the Customer
access queue for workspace approval. Real paid calling remains a later release.
Set the explicit caller-ID owner before adding a second approved operator.
For backward compatibility, an installation with exactly one approved operator
and no explicit owner still assigns its configured caller IDs to that operator.
With multiple approved operators and no explicit owner, nobody inherits the
configured numbers. There is no fallback granting the pool to every operator.

Number setup uses existing `DATABASE_URL` / `DIRECT_DATABASE_URL` and Twilio
settings. Verification calls require `TWILIO_CALLING_ENABLED=true`, account
credentials and the configured public HTTPS webhook origin. The callback URL
is supplied per verification attempt; no extra TwiML App setting is needed.
The existing calling kill switch also prevents new ownership-verification calls.

1. Validate `006_number_onboarding.sql` and the storage workflow on an isolated
   branch. `scripts/check-number-storage.mjs` runs rollback-only fixtures on the
   explicitly permitted validation host.
2. Run `npm run db:migrate` using the direct production connection. The new
   migration is additive and idempotent. Existing migrations are idempotent.
3. Configure the two owner variables and deploy the matching application commit.
4. The owner can open Phone numbers and the review queue. A new account can
   complete setup and submit requests without receiving a Voice token.
5. For an existing number, approve verification, have its owner initiate the
   consented call, and wait for Twilio's signed success callback. Then separately
   approve calling access when appropriate. Check applicable caller ID and
   destination eligibility before enabling the customer.

Identity documents and payment details should not be pasted into the free-text
fields. This is assisted compliance review, not an automated identity-document
upload or regulatory-bundle submission system. A customer-facing message can
explain which documents are needed and the approved collection process.

## Ownership and safety

All setup APIs authenticate with Clerk. Customer writes enforce same-origin,
small JSON requests; customer IDs come from the session. Admin routes check
both the explicit administrator list and existing operator approval. Lists are
limited to 50 requests; ordinary reads return only the session owner's profile,
requests and current-account identities. Administrator lists never expose
verification codes.

Each operator can have at most three open requests and submit five per rolling
24 hours. Verification calls require a reviewed existing-number request and a
fresh explicit consent. Durable database admission serializes concurrent starts,
allows one unexpired attempt per request, and caps attempts at three per operator,
three per phone and thirty globally per rolling 24 hours. Reservations commit
before contacting Twilio. An uncertain timeout retains its reservation until
callback or the ten-minute expiry; it cannot immediately issue another paid call.
Confirmed provider rejections mark that attempt failed and still count against
the daily limit.

Callbacks validate Twilio's signature against the configured canonical URL,
including a random attempt ID in its query string. They check account, recipient,
provider call SID, attempt expiry and current request state. A successful result
also reads the verified caller resource from Twilio and checks that the number
and account match. Failed, stale, expired or replayed callbacks cannot assign a
number. A callback arriving before the create response can bind its call SID;
a late response cannot reset a completed attempt. Codes disappear from responses
at expiry and are cleared on completion or a confirmed failure. No code or
credential is logged.

Phone claims and assignments are unique. Identity updates never transfer a
number to another operator. Revocation removes it from the user's effective
caller list. The dialer, token route, destination authorization and signed TwiML
callback enforce that effective list; the TwiML route also rechecks operator
approval at call time. Configured legacy caller IDs remain available only to
their designated owner. If storage is unavailable, that owner can still use
those configured numbers; other operators fail closed. Revocation does not
hang up an already connected call or delete/release a Twilio resource.

## Validation

- `npm test`: profile/input validation, caller ownership, session/origin/admin
  checks, consent before provider calls, bounded body parsing, timeout handling,
  provider ownership, signed callbacks and caller authorization regressions.
- `NUMBER_TEST_HOST=ep-noisy-waterfall-b9lcv5rb.c-7.eu-central-1.aws.neon.tech node scripts/check-number-storage.mjs`:
  rollback-only schema, approval/revision, immutable snapshot, private code,
  assignment, expiry/replay/race, quota, audit and revocation checks.
- Local headless browser fixtures exercise the actual shadcn forms, phone-call
  consent dialog, code display, assisted request and owner review workflow at
  phone/tablet/desktop sizes. All provider calls and data are mocked. A real
  ownership-verification call must be initiated by the number owner from the UI.

## Provider references

- [Twilio outgoing caller IDs and verification callbacks](https://www.twilio.com/docs/voice/api/outgoing-caller-ids)
- [Twilio phone number provisioning](https://www.twilio.com/docs/phone-numbers/api/incomingphonenumber-resource)
- [Twilio regulatory compliance](https://www.twilio.com/docs/phone-numbers/regulatory/faq)
