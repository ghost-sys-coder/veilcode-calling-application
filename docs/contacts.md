# Contacts

Open **Contacts** in the console sidebar to save a person's name, company, phone number, country, and private notes. Contacts support the same US, Canadian, UK, and Australian numbering rules as the dialer. Numbers are normalized to E.164; an operator cannot save duplicate phone numbers.

Search by name, company, or number. Results load in pages of 50, newest edits first. Edit a contact to update their details. Leaving a changed form asks before discarding unsaved edits. Deleting a contact requires confirmation and removes only their contact record and contact notes; existing call history and quality reviews remain.

[CSV import](contact-import.md) supports column mapping, validation, duplicate detection, preview-before-save, and rejected-row downloads. Import up to 500 contacts at a time; existing contacts remain as saved.

**Dial** opens the dialer with the selected contact's country and number filled in. It never starts a call. The operator still chooses an approved caller ID and presses **Place call**. Existing server-side destination restrictions, caller-ID approval, signed permits, and recording consent checks continue to apply.

Contacts are private to the Clerk operator who created them. Every list, detail, mutation, and dialer prefill is scoped to that operator, with the existing operator allowlist and same-origin mutation checks.

## Setup

No new environment variables or providers are required. The feature uses the existing `DATABASE_URL` and `DIRECT_DATABASE_URL`. Run `npm run db:migrate` before deploying; migration `002_contacts.sql` adds the contacts table and index without changing call reviews. The migration runner applies all numbered, idempotent SQL files in a transaction.

`npm test` covers validation and API boundaries. `node scripts/check-contact-storage.mjs` verifies the actual schema, ownership, duplicate protection, search, updates, deletion, and pagination inside a transaction that is rolled back. Contact timestamps use millisecond precision so cursor paging does not skip records that share a timestamp.

## UI tokens

The sidebar divider uses `border-sidebar-border` rather than the inherited foreground color. Shared shadcn border defaults use `--border` in the base CSS layer so dialogs and tables also use the muted palette.
