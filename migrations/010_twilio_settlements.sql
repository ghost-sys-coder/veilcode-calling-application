-- Only explicitly bound LIVE reservations enter this queue. Existing owner calls
-- and deterministic prepaid test runs are never backfilled or charged.
CREATE TABLE IF NOT EXISTS veilcall_twilio_settlements (
  reservation_id uuid PRIMARY KEY REFERENCES veilcall_call_reservations(id),
  account_sid text NOT NULL CHECK(account_sid ~ '^AC[0-9a-f]{32}$' AND account_sid <> 'AC00000000000000000000000000000000'),
  parent_sid text NOT NULL UNIQUE CHECK(parent_sid ~ '^CA[0-9a-f]{32}$'),
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','review','done')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  reason text CHECK(reason IN ('provider-unavailable','provider-pending','provider-mismatch','duration-invalid','attempts-exhausted')),
  next_attempt_at timestamptz NOT NULL,
  lease_token uuid,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS veilcall_twilio_settlements_due
  ON veilcall_twilio_settlements(next_attempt_at) WHERE state='pending';
