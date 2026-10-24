# Call history and recording reviews

## Operator workflow

Open **Call history** from the console navigation. The first visit imports up to 25 recent calls made by your own Clerk operator identity. Use **Sync recent calls** for an updated recent import; stored history is paginated in groups of 20. New calls are tracked through the signed TwiML and call-status callbacks when the database is available. Storage outages do not disable ordinary calling; recent calls can be synced later.

Past calls without recordings have history but no recoverable audio. Historical recordings made outside this feature are not automatically admitted without a stored consent record.

During an answered call:

1. Inform every participant that the call will be recorded for quality review, and obtain their agreement before proceeding. The app's checkbox records the operator's attestation; it does not play an announcement or independently verify consent.
2. Confirm the consent checkbox and press **Start recording**. Recordings are off by default for every call. The backend also checks that the telephone recipient has answered.
3. Use **Pause**, **Resume**, and **Stop** as needed. Paused portions are replaced with silence rather than conversation audio. Resuming requires the consent confirmation to remain selected. A recording ends automatically with the call.
4. After hang-up, the dialer shows **How did it go?** above the next-call controls. Choose the business outcome, an optional 1–5 audio rating, callback time if needed, and an outcome/callback note. **Save call review** saves the rating and follow-up together; existing quality notes and bookmarks remain intact. The saved outcome and callback also appear in Call history and Follow-ups. A newer edit in another tab requires reloading saved details before replacing it.
5. Play or download audio in the after-call panel when Twilio finishes processing. It refreshes availability for about a minute, then supports manual refresh. Each start/stop segment can produce a separate recording. Recording is off by default for each new call, and unavailable for calls that were never recorded.
6. Use **Open full review** for quality notes, timestamped bookmarks, and recording deletion. Save notes, the shared rating, and bookmark descriptions with **Save review**. Switching calls prompts before discarding unsaved changes.

Recording/retention requirements depend on participant location and the use of their information. The app implements an explicit operator confirmation flow; it is not a determination of legal compliance. Twilio's guidance: https://help.twilio.com/articles/360011522553

## Storage and configuration

Audio remains at Twilio. The application stores call metadata, consent attestations, notes, ratings, bookmarks, recording SIDs, and retention deadlines in Postgres. Clerk authentication and the existing operator allowlist apply to all history, control, review, media, and deletion endpoints. Operators can only access their own calls.

Twilio can return `processing` for recording reads even while the call is active. The app preserves the last confirmed start/pause/stop response during that call, so polling does not hide the controls or undo a pause. A late start callback cannot replace a confirmed pause/stop. A confirmed resume can. Terminal provider states still win; new segments wait for previous processing to finish. An uncertain recording mutation makes a best-effort stop before reporting failure. See [Twilio recording status behavior](https://www.twilio.com/docs/voice/api/recording).

The initial dedicated Neon project is `veilcall` (`raspy-glade-69911381`), with the `development` branch in `aws-eu-central-1`. Credentials were written to ignored `.env.local`; they are not committed. This branch is the local development backend. Use a separate branch/database for production if production isolation is required.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Pooled Postgres URL used by the app; use TLS certificate verification. |
| `DIRECT_DATABASE_URL` | Direct Postgres URL for migrations and the storage integration check. |
| `VOICE_RECORDING_ENABLED` | `true` enables new recordings and resumes; pausing/stopping an existing recording remains available when false. Every start still requires consent. |
| `RECORDING_RETENTION_DAYS` | Integer from 1 to 365, default 30. Sets the deadline for newly created recording rows; changing it does not extend existing deadlines. |
| `CRON_SECRET` | Strong random bearer credential for the retention endpoint. Set the same secret in Vercel. |

Existing Twilio account credentials continue to authorize provider operations. Recording media is fetched server-side using `TWILIO_API_KEY_SID` and `TWILIO_API_KEY_SECRET`; neither credentials nor public media URLs are sent to the browser.

Run `npm run db:migrate` against the intended database before serving review routes. The checked-in migration creates only the review tables and indexes, and can be rerun. `node scripts/check-review-storage.mjs` exercises real SQL with synthetic data inside a transaction that is always rolled back.

## Callback and deployment setup

The existing `TWILIO_WEBHOOK_URL` still points to `/api/voice/twiml`. Its HTTPS origin determines the following additional URLs automatically:

- `/api/voice/calls/callback`: telephone-leg outcomes and durations.
- `/api/voice/recordings/callback`: recording status/availability. The handler verifies Twilio's signature and Account SID, then fetches authoritative recording metadata. It never fetches a callback-supplied media URL.

Both routes must be publicly reachable on the deployment handling that Twilio account, and must share the same review database/configuration. The TwiML response and recording creation requests register the callbacks, so no extra TwiML App is required. Localhost cannot receive Twilio callbacks; use an HTTPS tunnel or deploy. The review page can reconcile recording state directly from Twilio while testing locally.

Set the new variables in the hosting environment, run the migration there, and deploy the app. Local `.env.local` values do not automatically update Vercel. `vercel.json` schedules retention daily at `03:00 UTC`; Vercel sends `Authorization: Bearer <CRON_SECRET>`. Another scheduler can call the same endpoint with that header. No scheduler was activated remotely by the local implementation.

## Retention and deletion behavior

Playback and downloads reject expired or deleted recordings immediately. The daily retention job removes expired provider audio and retries failed deletions in bounded batches. A manual deletion first writes a database tombstone, then removes the Twilio audio; provider failures leave deletion pending for the job to retry. Delayed callbacks cannot make deleted audio accessible again or reset its expiry.

**Delete recording** requires an in-app confirmation and deletes audio, not call notes or ratings. Notes/bookmarks and call history remain until an operator edits them or a separately agreed metadata retention policy is implemented. Paused recordings cannot be deleted until stopped. Downloaded copies cannot be recalled by server-side deletion. Twilio may retain provider-side recording metadata according to its own policies.

## Verification and remaining live check

Automated tests cover operator access, consent, answered-call checks, duplicate recording prevention, pause/resume/stop, media ranges, deletion, callback signatures, review validation, and retention authorization. The real database check covers SQL ownership boundaries, consent gating, lease behavior, immutable expiry, tombstones, notes, terminal outcomes, and cursor pagination. Browser verification covers real history import and save/reload of notes and ratings.

The after-call API additionally checks expected follow-up revision and rating before an atomic save. `WRAPUP_TEST_HOST=<isolated branch hostname> node scripts/check-call-wrapup-storage.mjs` verifies ownership, stale edits, rollback on a failed follow-up write, preservation of quality notes/bookmarks, and callback email versioning using rollback-only fixtures. This extension has automated and database verification; it still needs an interactive browser/consented-call check.

Before relying on recordings operationally, make one agreed, consented test call. Start/pause/resume/stop the recording, verify both speakers in playback and a download, test deletion on that disposable test recording, and confirm the deployed retention job runs. No live calls were placed or participant audio recorded during implementation.
