# VeilCall

Private browser dialer for US outbound calls with Clerk authentication and Twilio Programmable Voice. The original custom landing page is retained. Authenticated console and calling code are implemented. **Live calling has not been tested with actual Clerk or Twilio credentials.**

## Stack and structure

Next.js 16 App Router, React 19, strict TypeScript, Tailwind CSS 4, Clerk, Twilio Voice JavaScript SDK, shadcn-inspired Button, Lucide. Server components by default. Each first-party React component lives in a separate file. No database is needed for this initial calling workflow.

```text
src/
  app/
    page.tsx                              public landing page
    sign-in/[[...sign-in]]/page.tsx       Clerk sign in
    sign-up/[[...sign-up]]/page.tsx       Clerk registration
    console/page.tsx                     server-enforced access check
    api/voice/token/route.ts             authorized short-lived Twilio JWT
    api/voice/authorize/route.ts         authorized US destination ticket
    api/voice/twiml/route.ts             signed Twilio Voice webhook
    globals.css                          landing + console design tokens
  components/
    auth/auth-shell.tsx
    console/call-workspace.tsx
    console/console-header.tsx
    console/dialer.tsx
    console/unauthorized.tsx
    landing/...                          original modular landing design
    ui/button.tsx
  lib/
    access.ts                             allowlisted Clerk IDs
    call-ticket.ts                        HMAC signed, short-lived dial permit
    destination.ts                        verified United States destinations
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

**Security:** Clerk registration alone **does not grant calling access**. The allowlist is checked independently on the server for both `/console` and token/authorization endpoints. Do not implement this allowlist only in the UI.

## 3. Configure Twilio

You need a Twilio account with enough credit, a voice capable Twilio US number that you control, an API Key SID + Secret, your Account SID and Auth Token, and a TwiML App. Confirm your account is upgraded if the trial prevents unverified outbound recipients. Also configure Twilio Voice geographic dialing permissions for **United States only**, and activate a usage budget/alert before making live calls.

1. In Twilio Console, create an **API Key**. Copy `TWILIO_API_KEY_SID` (`SK...`) and `TWILIO_API_KEY_SECRET` into `.env.local`.
2. Copy `TWILIO_ACCOUNT_SID` (`AC...`) and `TWILIO_AUTH_TOKEN` from Twilio Console into `.env.local`.
3. Set `TWILIO_PHONE_NUMBER` to your Twilio owned, voice enabled US phone number in E.164 format, such as `+12125550123`. This is the **only** outbound caller ID. A number you do not own or have permission to use cannot be substituted.
4. In Twilio Console > Voice > TwiML Apps, create an application. Set **Voice Request URL** to the publicly accessible, HTTPS URL `https://YOUR_DOMAIN/api/voice/twiml`. Set **HTTP Method = POST**. Copy the resulting application SID (`AP...`) to `TWILIO_TWIML_APP_SID`.
5. Set `TWILIO_WEBHOOK_URL` to that **identical** full HTTPS URL. Twilio signatures rely on the URL matching exactly, including any trailing slash or proxy configuration.
6. Generate the call permit signing secret in PowerShell: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Copy into `TWILIO_CALL_SIGNING_SECRET`. This is independent from Twilio credentials.
7. Before the first test, optionally set `TWILIO_ALLOWED_DESTINATIONS=+1...` to the US recipient numbers you own/control for verification.
8. Once settings, caller ID, dialing permissions, and spend alerts are verified, set `TWILIO_CALLING_ENABLED=true` and restart/redeploy. This is the emergency shutdown switch, set it to `false` to turn off new calls.

### Public HTTPS requirement

Twilio cannot call `http://localhost:3000/api/voice/twiml` from its cloud. Deploy this project to Vercel with your domain or expose a temporary HTTPS development tunnel. A TwiML App URL configured as a tunnel address must match `TWILIO_WEBHOOK_URL`, then change it when deploying to the permanent domain. Set `NEXT_PUBLIC_SITE_URL` to the production HTTPS site URL and set the Clerk production keys as needed.

### First end-to-end test

1. Sign in as an allowlisted Clerk user and visit `/console`.
2. Allow microphone access in your browser. Enter a real US test number in **+1...** format.
3. Click **Place call**, confirm Twilio connects the voice leg, the recipient's phone rings and displays your configured US number, and confirm both parties can hear each other.
4. Verify mute and hangup. Inspect Twilio Call Logs and actual charges.

The call timer measures the **browser voice session**, not verified PSTN answer time. Do not interpret it as billable duration or recipient answer confirmation.

## Security notes and production limitations

- Twilio Account SID, Auth Token, API secrets and call signing key never enter browser JavaScript. The browser receives a 10-minute scoped Voice Access Token (which is usable only with its configured TwiML App) and a 45-second HMAC destination permit.
- Clerk user IDs are explicitly approved, even after login. The destination is validated against real **US** numbering rules. 900 premium service and 976 exchange patterns are rejected. An optional test-recipient allowlist restricts dialing further.
- The Voice callback validates the Twilio request signature, the Twilio Account SID, the client identity, the signed destination permit, and the destination again. Arbitrary `To` or caller ID values from the browser are never trusted.
- The origin check on the destination authorization API blocks ordinary cross-origin form submissions, but does not replace Clerk session verification.
- This is a private **single-operator pilot**, not a hardened multi-tenant contact center. HMAC permits are short-lived but do not have persisted one-time redemption state. There is no durable per-user quota, rate limiting, contact permission enforcement, or real-time billing limit. Keep Twilio's geo permissions restricted and use account usage triggers and a low spend threshold; add durable quotas via Redis/database before scaling to multiple operators or exposing it beyond a private pilot.
- Sales calls can be restricted by US telemarketing, Do Not Call, time-of-day, consent and caller identification rules, depending on the destination and outreach method. Do not assume a displayed US number exempts you from these rules. Call recording is intentionally omitted.
- If credential values are missing, the console shows the missing **variable names only**, never secret values. `TWILIO_CALLING_ENABLED=false` is the default.

## Checks

```powershell
npm run typecheck
npm run lint
npm run build
```

The authoring environment had no access to npm registry, so dependency installation and the full Next.js build could not be completed. Syntax, local imports and CSS parsing were checked locally; **a real Clerk login and Twilio call still need to be tested**.

Official docs: [Clerk Next.js](https://clerk.com/docs/nextjs/getting-started/quickstart); [Twilio Voice JS SDK](https://www.twilio.com/docs/voice/sdks/javascript); [Twilio Voice TwiML](https://www.twilio.com/docs/voice/twiml).
