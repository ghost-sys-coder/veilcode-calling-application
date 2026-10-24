ALTER TABLE veilcall_call_followups
  ADD COLUMN IF NOT EXISTS email_schedule_version integer NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS veilcall_email_preferences (
  operator_id text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  timezone text NOT NULL DEFAULT 'UTC',
  enabled_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS veilcall_callback_emails (
  call_sid text NOT NULL REFERENCES veilcall_calls(call_sid),
  schedule_version integer NOT NULL,
  operator_id text NOT NULL,
  callback_at timestamptz(3) NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed','canceled')),
  attempts integer NOT NULL DEFAULT 0,
  lease_token uuid,
  lease_until timestamptz,
  first_attempt_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb,
  provider_id text,
  error_code text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(call_sid,schedule_version)
);
CREATE INDEX IF NOT EXISTS veilcall_callback_emails_pending_idx
  ON veilcall_callback_emails(next_attempt_at,callback_at) WHERE status='pending';
CREATE INDEX IF NOT EXISTS veilcall_callback_emails_operator_idx
  ON veilcall_callback_emails(operator_id,created_at DESC);
