-- A reminder is acknowledged for one callback revision only. Rescheduling or
-- reopening a callback makes it eligible for a new notification.
ALTER TABLE veilcall_call_followups
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS reminder_ack_revision integer;
