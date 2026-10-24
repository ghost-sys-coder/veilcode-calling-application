CREATE TABLE IF NOT EXISTS veilcall_business_profiles (
  operator_id text PRIMARY KEY,
  business_name text NOT NULL CHECK (char_length(business_name) BETWEEN 1 AND 160),
  contact_name text NOT NULL CHECK (char_length(contact_name) BETWEEN 1 AND 120),
  business_country text NOT NULL CHECK (business_country ~ '^[A-Z]{2}$'),
  website text NOT NULL DEFAULT '' CHECK (char_length(website)<=300),
  purpose text NOT NULL CHECK (char_length(purpose) BETWEEN 10 AND 1200),
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS veilcall_number_requests (
  id uuid PRIMARY KEY,
  operator_id text NOT NULL REFERENCES veilcall_business_profiles(operator_id),
  kind text NOT NULL CHECK (kind IN ('existing','new')),
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 60),
  phone_number text CHECK (phone_number ~ '^\+[1-9][0-9]{7,14}$'),
  number_country text NOT NULL CHECK (number_country ~ '^[A-Z]{2}$'),
  details text NOT NULL DEFAULT '' CHECK (char_length(details)<=1000),
  business_snapshot jsonb NOT NULL CHECK (jsonb_typeof(business_snapshot)='object'),
  ownership_confirmed_at timestamptz(3),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','verifying','verified','fulfilled','failed','rejected','revoked')),
  review_note text NOT NULL DEFAULT '' CHECK (char_length(review_note)<=1000),
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  CHECK ((kind='existing' AND phone_number IS NOT NULL AND ownership_confirmed_at IS NOT NULL)
    OR kind='new')
);
CREATE INDEX IF NOT EXISTS veilcall_number_requests_operator_idx ON veilcall_number_requests(operator_id,created_at DESC);
CREATE INDEX IF NOT EXISTS veilcall_number_requests_queue_idx ON veilcall_number_requests(status,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS veilcall_number_requests_claim_idx ON veilcall_number_requests(phone_number)
  WHERE phone_number IS NOT NULL AND status IN ('approved','verifying','verified','fulfilled','failed');

CREATE TABLE IF NOT EXISTS veilcall_caller_identities (
  phone_number text PRIMARY KEY CHECK (phone_number ~ '^\+[1-9][0-9]{7,14}$'),
  operator_id text NOT NULL REFERENCES veilcall_business_profiles(operator_id),
  request_id uuid NOT NULL UNIQUE REFERENCES veilcall_number_requests(id),
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 60),
  source text NOT NULL CHECK (source IN ('verified','provisioned')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  provider_sid text NOT NULL CHECK (provider_sid ~ '^PN[0-9a-fA-F]{32}$'),
  account_sid text NOT NULL CHECK (account_sid ~ '^AC[0-9a-fA-F]{32}$'),
  verified_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS veilcall_caller_identities_operator_idx ON veilcall_caller_identities(operator_id,account_sid,status);

CREATE TABLE IF NOT EXISTS veilcall_number_verifications (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES veilcall_number_requests(id),
  operator_id text NOT NULL,
  phone_number text NOT NULL,
  account_sid text NOT NULL,
  call_sid text CHECK (call_sid ~ '^CA[0-9a-fA-F]{32}$'),
  validation_code text CHECK (validation_code ~ '^[0-9]{6}$'),
  status text NOT NULL DEFAULT 'preparing' CHECK (status IN ('preparing','calling','success','failed')),
  consent_at timestamptz(3) NOT NULL DEFAULT now(),
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  expires_at timestamptz(3) NOT NULL DEFAULT now()+interval '10 minutes'
);
CREATE INDEX IF NOT EXISTS veilcall_number_verifications_request_idx ON veilcall_number_verifications(request_id,created_at DESC);
CREATE INDEX IF NOT EXISTS veilcall_number_verifications_created_idx ON veilcall_number_verifications(created_at DESC);

CREATE TABLE IF NOT EXISTS veilcall_number_audit (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES veilcall_number_requests(id),
  actor_id text NOT NULL,
  action text NOT NULL,
  note text NOT NULL DEFAULT '' CHECK (char_length(note)<=1000),
  created_at timestamptz(3) NOT NULL DEFAULT now()
);
