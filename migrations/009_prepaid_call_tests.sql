CREATE TABLE IF NOT EXISTS veilcall_prepaid_quotes (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES veilcall_billing_accounts(id),
  to_number text NOT NULL,
  from_number text NOT NULL,
  route text NOT NULL,
  rate_micro integer NOT NULL CHECK(rate_micro>0),
  fee_micro integer NOT NULL CHECK(fee_micro>=0),
  max_seconds integer NOT NULL CHECK(max_seconds BETWEEN 0 AND 300),
  held_micro integer NOT NULL CHECK(held_micro>=0),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS veilcall_prepaid_quotes_account ON veilcall_prepaid_quotes(account_id,created_at DESC);

ALTER TABLE veilcall_call_reservations ADD COLUMN IF NOT EXISTS quote_id uuid REFERENCES veilcall_prepaid_quotes(id);
ALTER TABLE veilcall_call_reservations ADD COLUMN IF NOT EXISTS rate_accepted_at timestamptz;
ALTER TABLE veilcall_call_reservations ADD COLUMN IF NOT EXISTS rate_acceptance_version text;
CREATE UNIQUE INDEX IF NOT EXISTS veilcall_call_reservations_quote ON veilcall_call_reservations(quote_id) WHERE quote_id IS NOT NULL;

-- These runs are a deterministic provider fixture. They never represent real
-- Twilio calls and must not enter call history, recordings, or supplier costs.
CREATE TABLE IF NOT EXISTS veilcall_prepaid_test_runs (
  reservation_id uuid PRIMARY KEY REFERENCES veilcall_call_reservations(id),
  parent_sid text NOT NULL UNIQUE CHECK(parent_sid ~ '^CA[0-9a-f]{32}$'),
  child_sid text NOT NULL UNIQUE CHECK(child_sid ~ '^CA[0-9a-f]{32}$'),
  scenario text NOT NULL CHECK(scenario IN ('completed','busy','no-answer','failed','canceled')),
  requested_seconds integer NOT NULL CHECK(requested_seconds BETWEEN 0 AND 3600),
  connected_seconds integer NOT NULL CHECK(connected_seconds BETWEEN 0 AND 300),
  duration_limit integer NOT NULL CHECK(duration_limit BETWEEN 60 AND 300),
  twiml text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finishes_at timestamptz NOT NULL,
  completed_at timestamptz
);
