# Callback reminders

Schedule a callback from a call's **Outcome & follow-up** section. Reminders are available from the bell in every workspace page.

- The Follow-ups sidebar badge counts open callbacks scheduled before the end of today, including overdue callbacks. Today follows the browser's named timezone, with daylight-saving boundaries handled in Postgres.
- Due, undismissed callbacks show an in-app notice. The reminder sheet shows up to 20 callbacks, with new due alerts first; counts cover the entire queue. View all follow-ups opens the full paginated queue.
- **Dismiss alert** saves acknowledgement for the callback's current revision. It keeps the callback open and persists across reloads, tabs, and devices. Changing only its note preserves dismissal; changing its schedule or reopening it permits a new alert.
- **Snooze 15 min** moves the callback to 15 minutes from the action. **Reschedule** accepts a future local date and time. **Complete** removes the callback from the open queue. These actions preserve notes, ratings, call outcomes, and recordings.
- **Open dialer** prefills the saved number. The operator must start the call; opening it does not complete the callback.
- Reminders refresh every minute while visible, on focus/return, and after follow-up actions. Other tabs receive a storage event containing a random change marker and no contact or call details.

In-app alerts check while the app is open or when you return. Optional [email callback reminders](callback-email-reminders.md) also work while the app is closed after an operator opts in. SMS, browser push, and automatic calls are not scheduled. In-app reminders still require no email-provider variables.

## Storage and access

Run `npm run db:migrate` before deploying. Migration `004_callback_reminders.sql` adds a callback revision and acknowledged revision to the existing follow-up table. It is additive and safe for the previous app version. The current app's follow-up saves increment the revision and preserve acknowledgement for note-only edits.

`GET /api/voice/reminders?timezone=Africa%2FKampala` returns one owner-scoped snapshot with counts and a bounded list. `POST /api/voice/reminders/[callSid]` requires an approved authenticated operator, same origin, and the revision shown in the UI. It performs an atomic ownership/version/open-state check. Stale, completed, or unavailable callbacks return 409 without changes. Invalid dates/actions return 400. Unexpected failures return sanitized 503 responses; the UI removes stale actions and requests a refresh before retrying.

The existing Clerk, `DATABASE_URL`, and direct migration connection remain in use. The in-app reminder flow does not need a cron or background worker; optional email reminders use a separate dispatcher.

## Verification

`npm test`, `npm run lint`, `npm run typecheck`, and `npm run build` cover the application checks. Set `REMINDER_TEST_HOST` to the direct hostname of an isolated Neon branch, then run `node scripts/check-reminder-storage.mjs`. It exercises idempotent migration, ownership, persisted dismissal, snooze, reschedule, completion/reopening, stale actions, notes/quality preservation, counts beyond the displayed list, and local midnight boundaries. Every fixture write and migration in that check is rolled back.
