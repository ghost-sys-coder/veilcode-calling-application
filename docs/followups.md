# Call outcomes and follow-ups

In **Call history**, select a call and use **Outcome & follow-up** to save Interested, Not interested, No answer, or Callback needed. Twilio's telephone status remains separate. Each call has one current outcome and callback; rescheduling updates that callback.

Callback needed requires a date and time. Input uses the operator's browser timezone, storage uses UTC, and display returns to local time. Past dates are allowed so overdue work can be recorded. Notes are limited to 5,000 characters. Save outcome separately from the quality rating, review notes, and recording bookmarks. Switching calls warns when either form has unsaved changes.

**Follow-ups** in the sidebar shows open callbacks in due-date order, with Overdue, Upcoming, and Completed filters and pages of 50. Contact names and company are matched against the same operator's address book by normalized phone number. Manage a callback to reschedule, complete, reopen, change the outcome, or update its note. Changing a callback's date reopens it. Choosing another outcome removes it from the callback queue while retaining the outcome note.

**Dial** reads the original call under the authenticated operator, validates its country and number, and prefills the dialer. It never places a call or marks a follow-up complete. These are reminders inside VeilCall; no email, SMS, push notifications, or automatic calling are configured.

Migration `003_call_followups.sql` adds one table and index. It does not change call status, quality reviews, recordings, or contacts. No new environment variables are needed. APIs enforce the existing Clerk allowlist, ownership, same-origin mutation rules, bounded input, and no-store responses.

Run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`. `node scripts/check-followup-storage.mjs` tests the real schema, ownership, filter logic, completion/reopening, quality preservation, and pagination in a transaction that rolls back. Set `FOLLOWUP_TEST_HOST` to an isolated Neon branch hostname to test a branch using existing local credentials. Never log connection URLs.
