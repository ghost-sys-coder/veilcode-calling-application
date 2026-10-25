CREATE TABLE IF NOT EXISTS veilcall_call_costs (
  call_sid text PRIMARY KEY REFERENCES veilcall_calls(call_sid),
  provider_account_sid text,
  route_label text NOT NULL DEFAULT '',
  resources jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(resources)='array'),
  discovery_complete boolean NOT NULL DEFAULT false,
  checked_at timestamptz,
  last_attempt_at timestamptz,
  sync_failed boolean NOT NULL DEFAULT false,
  lease_token uuid,
  lease_until timestamptz
);
CREATE INDEX IF NOT EXISTS veilcall_call_costs_refresh ON veilcall_call_costs(last_attempt_at);

CREATE TABLE IF NOT EXISTS veilcall_storage_costs (
  provider_account_sid text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL CHECK (end_date >= start_date),
  amount_micro bigint CHECK (amount_micro >= 0),
  currency text CHECK (currency ~ '^[A-Z]{3}$'),
  as_of timestamptz,
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(provider_account_sid,start_date,end_date),
  CHECK ((amount_micro IS NULL) = (currency IS NULL))
);
