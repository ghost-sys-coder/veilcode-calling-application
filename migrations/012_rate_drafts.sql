-- Draft planning only. No published prices or billing account linkage.
CREATE TABLE IF NOT EXISTS veilcall_rate_drafts (
  owner_id text NOT NULL,
  provider_account_sid text NOT NULL CHECK(provider_account_sid ~ '^AC[0-9a-fA-F]{32}$'),
  from_number text NOT NULL CHECK(from_number ~ '^\+[1-9][0-9]{7,14}$'),
  revision integer NOT NULL CHECK(revision>0),
  rates jsonb NOT NULL CHECK(jsonb_typeof(rates)='object'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_id,provider_account_sid,from_number)
);
