ALTER TABLE veilcall_twilio_settlements ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1 CHECK(revision>0);
CREATE TABLE IF NOT EXISTS veilcall_settlement_audit (
  id uuid PRIMARY KEY,
  reservation_id uuid NOT NULL REFERENCES veilcall_call_reservations(id),
  actor_id text NOT NULL,
  action text NOT NULL CHECK(action='recheck'),
  note text NOT NULL CHECK(length(note) BETWEEN 10 AND 500),
  previous_reason text,
  previous_attempts integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS veilcall_settlement_audit_call ON veilcall_settlement_audit(reservation_id,created_at DESC);
CREATE TABLE IF NOT EXISTS veilcall_settlement_worker (
  name text PRIMARY KEY CHECK(name='twilio'),
  last_success_at timestamptz,
  last_failure_at timestamptz
);
