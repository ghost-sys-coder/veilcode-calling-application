# Paid pilot completion

This is the remaining scope for the single-operator UK/Australia paid pilot.
Existing owner calling and the isolated Stripe sandbox remain available.

| Requirement | Implementation | Release evidence / outstanding decision |
| --- | --- | --- |
| Customer approval and caller ownership | Existing owner approval and per-operator number assignments | Verify suspension and reassignment at paid admission |
| Draft route economics | Private caller-specific drafts and canonical observed costs | Built; no commercial rates approved or published |
| Commercial release controls | Built | Immutable offer/policy snapshots, explicit owner activation and pause; closed by default |
| Payments and credit | Built for both modes | Canonical mode-scoped fulfillment, retained cancellation access, atomic live eligibility; live catalog/secret setup awaits activation |
| Prepaid real-call admission | Built behind release controls | Server quote, explicit acceptance, atomic hold, one-use permit and TwiML limit |
| Terminal settlement and recovery | Canonical Twilio reconciliation and scheduled recovery built | Verify admission through settlement, stale permits, retries and isolation |
| Customer billing and dialing UI | Built and fixture-verified | Policy acceptance, immediate-start choice, quote consent and charges; 320/390/768/1440px checked |
| Commercial approval | Owner decision required | Monthly price, top-ups, exact caller/route rates, approved policies and tax treatment |
| Live activation | Closed | Requires configured live catalog/webhook and explicit owner release; test credit never funds Twilio |
| Framework security update | Applied after feature implementation | Next/ESLint 16.4.3, targeted compatible Zod 4.6.6 override; audit reports zero vulnerabilities |

No team features, campaigns or unrelated navigation are included. Provider facts
come from signed callbacks and canonical API reads. Browser timers and success
redirects never grant funds or determine charges. Already active calls retain
their hold and remain settleable when admission or payments are paused.

Completion requires passing automated and database rollback checks, production
build, customer/owner UI verification and deployment verification. A simulated
provider run must not be described as a real paid call. Commercial decisions and
an explicitly authorized live pilot call are recorded separately from code readiness.

Local evidence: 184 tests passed, lint/typecheck passed, patched production build
passed. The live-pilot SQL rollback check passed twice (including atomic checkout
guards on the final run); existing settlement recovery SQL checks passed. The
component browser checks passed across phone/tablet/desktop with intercepted API
responses and no calls or payments. Authenticated deployed preview verification
also passed: anonymous protection, sandbox isolation, empty/paused release state,
owner setup at 390/768/1440px, complete policy bundle at 320/390/768/1440px,
unchanged wallets/drafts and disabled real calling. The verifier signed out its
own session and removed its temporary private bypass input afterward.

Review: plan alignment and architecture boundaries passed; shadcn/theme patterns
are captured in `ui-registry.md`. Commercial activation remains a separate owner
decision, not an outcome established by mocked or sandbox tests.

Owner decisions received: $19.99/month (confirmed for the live Stripe plan),
$10/$25/$50 top-ups; VeilCode Studio, Uganda
with a UK presence; individuals, freelancers, agencies and businesses are eligible
audiences. Confirmed contact: support@veilcode.studio; business address:
Tankhill Road, Muyenga, Kampala, Uganda. Call-rate proposals and the exact Stripe
dashboard checklist are in `pricing-and-stripe-setup.md`. Rates remain private;
UK mobile needs a supplier-prefix check before the standard mobile proposal can
be published. Policy/tax approval and live activation remain pending.
