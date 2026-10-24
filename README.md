# VeilCall

[Business and number onboarding](docs/number-onboarding.md) supports existing-number ownership verification, assisted new-number requests, an owner review queue and caller IDs assigned to individual operators. New accounts can complete setup while calling access remains separately approved. Migration `006_number_onboarding.sql` and the two owner configuration variables are required for this release.

The [customer access and billing sandbox](docs/billing-pilot.md) adds owner-reviewed workspace approval, shadcn billing screens, test subscriptions/top-ups, signed payment webhooks and a calling-credit simulator. Live payments and paid customer calling remain disabled. The server selects `STRIPE_PROD_API_KEY` for Vercel Production and `STRIPE_TEST_API_KEY` for local/Preview; commercial pricing remains a [proposal](docs/billing.md).

Callback reminders are available throughout the workspace: due notices, a Follow-ups badge, persistent dismissal, snooze, reschedule, completion, and dialer shortcuts. See [callback reminders](docs/callback-reminders.md) for behavior, migration, and validation details.

Operators can also opt into [email reminders](docs/callback-email-reminders.md) through Reminders. Resend delivers to verified account emails; GitHub Actions is configured to check due callbacks about every five minutes while the app is closed. Confirm a successful **schedule** event in Actions before relying on automatic delivery; a successful push or manual check only verifies that invocation.

Private browser dialer for US, Canadian, UK, and Australian outbound calls with Clerk authentication and Twilio Programmable Voice. The original custom landing page is retained. Authenticated console and calling code are implemented. Live account records confirm a completed UK call; US attempts were rejected by Twilio with error 13225.

## Stack and structure

Call history, consent-based recording controls, private playback/downloads, ratings, notes, bookmarks, and audio retention are implemented. See [call review setup and operation](docs/call-reviews.md) for database variables, migrations, deployment, and the first consented recording test.

After hang-up, the dialer opens a review panel for the outcome, audio rating, callback time and conversation note, with recording playback beside the review workflow. One save updates the rating and follow-up atomically. This uses existing storage and recording configuration; no new environment variables or migration are required.

Next.js 16 App Router, React 19, strict TypeScript, Tailwind CSS 4, Clerk, Twilio Voice JavaScript SDK, shadcn/ui, Lucide, and Postgres for call reviews. Server components by default. Each first-party React component lives in a separate file. Ordinary calling remains available without review storage.

The console uses a responsive shadcn sidebar and shared form/dialog components. See the [UI component and theme guide](docs/ui-components.md) before changing theme tokens or adding controls.

The private [Contacts directory](docs/contacts.md) adds searchable names, numbers, companies, and notes, with safe dialer prefill. It uses the existing database and needs no new environment variables.

[CSV contact import](docs/contact-import.md) adds column mapping, previews, duplicate checks, and rejected-row downloads for batches of up to 500 contacts.

[Call outcomes and follow-ups](docs/followups.md) add business outcomes, callback dates and notes, an overdue/upcoming/completed queue, and callback dialer prefill. They use the same database with migration `003_call_followups.sql`.

The [outreach dashboard](docs/dashboard.md) summarizes call activity, connection rate, interested prospects, today's callbacks, and quality ratings, with direct links to reviews and the dialer. It uses existing storage without new environment variables or migrations.

```text
src/
  app/
    page.tsx                              public landing page
    sign-in/[[...sign-in]]/page.tsx       Clerk sign in
    sign-up/[[...sign-up]]/page.tsx       Clerk registration
    console/page.tsx                     server-enforced access check
    api/voice/token/route.ts             authorized short-lived Twilio JWT
    api/voice/authorize/route.ts         authorized destination ticket
    api/voice/status/route.ts            operator-owned call outcome and error codes
    api/voice/twiml/route.ts             signed Twilio Voice webhook
    globals.css                          landing + console design tokens
  components/
    auth/auth-shell.tsx
    console/call-workspace.tsx
    console/console-shell.tsx             shared console header and sidebar provider
    console/app-sidebar.tsx               shadcn workspace navigation
    console/caller-id-selector.tsx        approved outgoing caller numbers
    console/dialer.tsx
    console/unauthorized.tsx
    landing/...                          original modular landing design
    ui/button.tsx
  lib/
    access.ts                             allowlisted Clerk IDs
    call-ticket.ts                        HMAC signed operator, destination, and caller ID permit
    caller-ids.ts                         server-approved outgoing caller ID registry
    calling-countries.ts                  shared country options and input normalization
    destination.ts                        permitted US, Canadian, UK, and Australian destinations
    voice-outcome.ts                      safe call outcome and error descriptions
    voice-config.ts                       fail-closed Twilio settings
    voice-responses.ts                    JSON, request origin checks
  proxy.ts                                Clerk request context, Next.js 16
```

## 1. Install and start locally

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Use Node 22 or later. Visit `http://localhost:3000`.

## 2. Configure Clerk while the app is running

1. In [Clerk Dashboard](https://dashboard.clerk.com), create a **Next.js** application. Do not create or use a second app through the Clerk CLI.
2. Copy the **Publishable Key** and **Secret Key** from **API Keys** into `.env.local` as `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`. Never paste the secret key into this chat, a repository, or any `NEXT_PUBLIC_` variable.
3. Enable your preferred sign-in method in Clerk (email sign in is sufficient for phase 1). Visit `/sign-up` and register your operator account. Add MFA in Clerk for production use.
4. Visit `/console`. Before approval, the page intentionally shows **Signed in. Not yet authorized.** and your exact `user_...` Clerk user ID.
5. Add that ID to `.env.local` as `CLERK_ALLOWED_USER_IDS=user_...` and restart the development server. More IDs can be comma separated.
6. Return to `/console`; this should show the workspace. The phone controls are disabled until Twilio is configured and explicitly enabled.

**Security:** Clerk registration alone **does not grant workspace or calling access**. New customers request owner approval through onboarding; approved workspace access is checked on the server. Real calling remains limited to configured pilot operators until live billing is implemented. Number approval and payment never implicitly grant an administrator role.

## 3. Configure Twilio

You need a Twilio account with enough credit, a voice capable Twilio US number that you control, an API Key SID + Secret, your Account SID and Auth Token, and a TwiML App. Confirm your account is upgraded if the trial prevents unverified outbound recipients. Configure Twilio Voice geographic dialing permissions for only the supported destinations you intend to call (US, Canada, UK, Australia), and activate a usage budget/alert before making live calls.

1. In Twilio Console, create an **API Key**. Copy `TWILIO_API_KEY_SID` (`SK...`) and `TWILIO_API_KEY_SECRET` into `.env.local`.
2. Copy `TWILIO_ACCOUNT_SID` (`AC...`) and `TWILIO_AUTH_TOKEN` from Twilio Console into `.env.local`.
3. Set `TWILIO_PHONE_NUMBER` to your primary Twilio-owned, voice-enabled number in E.164 format, such as `+12125550123`. It stays the default outbound caller ID. To enable additional Twilio-owned or verified outgoing caller IDs, follow the configuration below. A number you do not control or have permission to use cannot be substituted.
4. In Twilio Console > Voice > TwiML Apps, create an application. Set **Voice Request URL** to the publicly accessible, HTTPS URL `https://YOUR_DOMAIN/api/voice/twiml`. Set **HTTP Method = POST**. Copy the resulting application SID (`AP...`) to `TWILIO_TWIML_APP_SID`.
5. Set `TWILIO_WEBHOOK_URL` to that **identical** full HTTPS URL. Twilio signatures rely on the URL matching exactly, including any trailing slash or proxy configuration.
6. Generate the call permit signing secret in PowerShell: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Copy into `TWILIO_CALL_SIGNING_SECRET`. This is independent from Twilio credentials.
7. Before the first test, optionally set `TWILIO_ALLOWED_DESTINATIONS=+1...,+44...,+61...` to the supported recipient numbers you own/control for verification.
8. Once settings, caller ID, dialing permissions, and spend alerts are verified, set `TWILIO_CALLING_ENABLED=true` and restart/redeploy. This is the emergency shutdown switch, set it to `false` to turn off new calls.

### Public HTTPS requirement

Twilio cannot call `http://localhost:3000/api/voice/twiml` from its cloud. Deploy this project to Vercel with your domain or expose a temporary HTTPS development tunnel. A TwiML App URL configured as a tunnel address must match `TWILIO_WEBHOOK_URL`, then change it when deploying to the permanent domain. Set `NEXT_PUBLIC_SITE_URL` to the production HTTPS site URL and set the Clerk production keys as needed.

### Multiple outgoing caller numbers

The console's **Call from** selector lists only numbers in the server configuration. `TWILIO_PHONE_NUMBER` remains the default; existing single-number installations work without extra configuration. Add more approved identities in `TWILIO_CALLER_IDS` as a JSON array of labels and E.164 numbers:

```dotenv
TWILIO_PHONE_NUMBER=+12125550123
TWILIO_CALLER_IDS='[{"label":"UK sales","number":"+442079460123"},{"label":"Uganda mobile","number":"+256772123456"}]'
```

These are illustrative numbers. Each additional number must actually be voice-enabled and owned by the same Twilio account, or verified there as an outgoing caller ID. See [Twilio's verified caller ID documentation](https://www.twilio.com/docs/voice/api/outgoing-caller-ids). Verification does not move a non-Twilio number's incoming calls into this app.

You may include the primary number in the JSON list to customize its label; it remains first and is not duplicated. Invalid numbers, empty/overlong labels, duplicate entries, malformed JSON, or more than 50 entries disable calling and show the configuration variable name. An empty array means only the primary number is available.

Choose **Call from** separately from the destination country. Changing it preserves the recipient; both selectors lock while preparing or making a call. The chosen caller ID is checked on the server, included in the 45-second signed permit, checked against current configuration again by the Twilio webhook, and used in TwiML. Arbitrary browser-supplied caller IDs cannot override it.

For local development, restart the app after changing the environment. For production, set `TWILIO_CALLER_IDS` in your hosting environment and redeploy; a local `.env` change does not update Vercel. This feature does not remove Twilio's destination restrictions or customer-profile requirements.

### First end-to-end test

1. Sign in as an allowlisted Clerk user and visit `/console`. Select the outgoing number under **Call from**, then choose United States (+1), Canada (+1), United Kingdom (+44), or Australia (+61) as the destination country. Switching countries clears the previous recipient and sets the new prefix. Australian local landline and mobile numbers (such as `02 5550 0123` or `0412 345 678`) are converted to international format without the leading zero.
2. Allow microphone access in your browser. Enter a real test number for the selected country. Local numbers and international numbers with spaces, parentheses, or hyphens are normalized before authorization. The number must match the selected country, including US versus Canada.
3. Click **Place call**, confirm Twilio connects the voice leg, the recipient's phone rings and displays your configured US number, and confirm both parties can hear each other.
4. Verify mute and hangup. Inspect Twilio Call Logs and actual charges.

The call timer measures the **browser voice session**, not verified PSTN answer time. Do not interpret it as billable duration or recipient answer confirmation.

### Diagnosing failed calls

After the browser session ends, the console reads the operator's own Twilio parent/telephone-child call records and error notifications. It retries briefly for delayed log updates, displays the telephone outcome and error code, and shows the Call SID for support. Account credentials and raw diagnostic payloads stay on the server.

**Twilio 13225 — call blocked:** Recent US attempts on October 12, 2026 failed before the telephone leg connected, with the notification `Phone number is blacklisted`. The account was active and upgraded, US low-risk geographic permission was enabled, and an Individual Primary Customer Profile was approved. A UK telephone call completed for 67 seconds. This confirms a Twilio-side restriction; the logs do not identify the underlying risk or regulatory reason. Contact Twilio Support with a failed parent Call SID and request review of the destination and account's +1 calling eligibility. See [Twilio's 13225 documentation](https://www.twilio.com/docs/api/errors/13225). No account restrictions or permissions were changed during diagnosis.

Supported countries in this application still require permission from Twilio. Enable the geographic permissions for the destinations you intend to call; application validation does not grant carrier access.

## Security notes and production limitations

- Twilio Account SID, Auth Token, API secrets and call signing key never enter browser JavaScript. The browser receives a 10-minute scoped Voice Access Token (which is usable only with its configured TwiML App) and a 45-second HMAC destination permit.
- Clerk user IDs are explicitly approved, even after login. The destination is validated against **US, Canadian, UK, and Australian** numbering rules. North American 900 premium service and 976 exchange patterns are rejected, along with the configured UK premium, paging, and special-rate ranges and Australian 19-prefixed premium services. An optional test-recipient allowlist restricts dialing further.
- The Voice callback validates the Twilio request signature, the Twilio Account SID, the client identity, the signed operator/destination/caller-ID permit, and the destination and caller ID again. Arbitrary `To` or caller ID values from the browser are never trusted.
- The origin check on the destination authorization API blocks ordinary cross-origin form submissions, but does not replace Clerk session verification.
- This is a private **single-operator pilot**, not a hardened multi-tenant contact center. HMAC permits are short-lived but do not have persisted one-time redemption state. There is no durable per-user quota, rate limiting, contact permission enforcement, or real-time billing limit. Keep Twilio's geo permissions restricted and use account usage triggers and a low spend threshold; add durable quotas via Redis/database before scaling to multiple operators or exposing it beyond a private pilot.
- Sales calls can be restricted by telemarketing, Do Not Call, time-of-day, consent and caller identification rules, depending on the destination and outreach method. Do not assume a displayed business number exempts you from these rules. Call recording requires an explicit operator consent attestation; see the recording setup guide before enabling it operationally.
- If credential values are missing, the console shows the missing **variable names only**, never secret values. `TWILIO_CALLING_ENABLED=false` is the default.

## Checks

```powershell
npm run typecheck
npm test
npm run lint
npm run build
```

The focused tests cover number normalization, country mismatches, premium/allowlist restrictions, diagnostic access control, parent/child call failures, caller-ID configuration, signed caller-ID binding, and authorization/webhook enforcement. Live records were read without placing calls. A fresh end-to-end browser call after deploying changes still needs verification.

Official docs: [Clerk Next.js](https://clerk.com/docs/nextjs/getting-started/quickstart); [Twilio Voice JS SDK](https://www.twilio.com/docs/voice/sdks/javascript); [Twilio Voice TwiML](https://www.twilio.com/docs/voice/twiml).
