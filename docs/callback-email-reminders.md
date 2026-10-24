# Email callback reminders

Open **Reminders → Email reminders** and enable the checkbox, then save. Each approved operator opts in separately. Messages go only to that operator's current verified primary Clerk email. The app checks that address again before sending; an arbitrary recipient supplied by the browser is ignored.

Only callbacks due after email reminders were enabled are eligible. Enabling the preference does not email an old overdue backlog. Changing the browser timezone and saving updates the timezone used in new emails. Disable the preference to stop unsent reminders.

Emails contain the saved contact name, phone number, scheduled time and timezone, and authenticated links to the dialer and follow-ups. They exclude callback notes, quality notes, and recordings. Opening a link never starts a call or completes a callback.

## Schedule and authentication

The Vercel team uses Hobby, so the existing daily recording-retention cron is unchanged. The GitHub Actions workflow `.github/workflows/callback-email-reminders.yml` calls the production dispatcher about every five minutes. The schedule avoids the first minute of the hour; GitHub can delay or drop scheduled runs. Scheduled workflows must exist on the default branch, and GitHub can disable schedules in public repositories after 60 days without activity. See [GitHub schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

The workflow uses no checkout, third-party action, API key, cron secret, or repository secret. Its only job permission is `id-token: write`. The app verifies the short-lived GitHub JWT's RS256 signature, issuer, audience, age/expiry, stable repository/owner IDs, repository name, `master` ref, exact workflow path, nonempty subject, and schedule/manual/push event. Caller identity is bound by those exact signed repository, owner, ref, workflow, and event claims; GitHub's customizable subject formatting is not used as an identity shortcut. It also runs when the workflow file itself changes on `master`, providing an initial access check. Forks, other workflows, pull requests, and other branches are rejected. The existing `CRON_SECRET` also permits a trusted operator to run the dispatcher manually. Authentication is checked before database access.

GitHub identity is sent in `X-VeilCall-Scheduler-Token`, keeping it separate from Clerk's session Authorization header. The workflow supports **Run workflow** in GitHub Actions for a manual check. Each response logs aggregate counts only. A successful empty run confirms dispatch access, not email inbox delivery. Permanent email failures make the workflow fail so they appear in Actions. Temporary failures stay queued for later runs.

## Configuration

- `RESEND_API_KEY`: server-side Resend key; production only.
- `RESEND_FROM_EMAIL`: verified sender, configured as `VeilCall <reminders@mail.veilcode.studio>`.
- `CALLBACK_EMAIL_ENABLED=true`: production delivery switch. Operators must still opt in individually. Previews always disable email delivery.
- Existing `NEXT_PUBLIC_SITE_URL`, database connections, Clerk credentials/allowlist, and `CRON_SECRET` remain in use. No secrets belong in GitHub Actions.

Resend's domain must be verified. A Resend send response means the provider accepted the email; this feature does not claim confirmed inbox delivery or implement delivery webhooks. See [Resend sending API](https://resend.com/docs/api-reference/emails/send-email).

## Storage and reliability

Run `npm run db:migrate` before release. Additive migration `005_callback_email.sql` adds operator preferences, an email schedule version, and delivery records. Note-only changes increment the normal callback revision but preserve the email schedule version, so editing a note does not send a duplicate. Snoozing, rescheduling, completion, and reopening change the schedule version.

The dispatcher claims up to ten due messages per run using database leases and `FOR UPDATE SKIP LOCKED`. It rechecks preferences, allowlisted ownership, current schedule, completion, and alert acknowledgement immediately before preparing a send. Dismissed, disabled, completed, superseded, or more-than-24-hour-old callbacks are excluded. An email already being accepted by the provider can still arrive after a last-second callback change.

The exact recipient, subject, and message payload are stored before the first provider request and reused on retries. A stable per-call/per-schedule Resend idempotency key prevents duplicate sends after timeouts or a failure to save provider acceptance. Because [Resend retains keys for 24 hours](https://resend.com/docs/dashboard/emails/idempotency-keys), uncertain requests stop retrying after 23 hours. Temporary network, rate-limit, and server failures retry with backoff (up to eight attempts); permanent errors remain failed for review. A change to the operator's verified email stops a retry from sending the frozen message to an old address.

## Verification

Run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`. Set `EMAIL_REMINDER_TEST_HOST` to an isolated branch's direct hostname and run `node scripts/check-email-reminder-storage.mjs`. Database fixtures roll back and that script sends no emails. Provider integration can be checked using Resend's test recipient `delivered@resend.dev`; do not enable real operators or create real callback fixtures merely for testing.
