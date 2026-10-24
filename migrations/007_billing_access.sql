CREATE TABLE IF NOT EXISTS veilcall_operator_access (
  operator_id text PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('pending','approved','rejected','suspended')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  review_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS veilcall_access_audit (
  id uuid PRIMARY KEY, operator_id text NOT NULL, actor_id text NOT NULL,
  action text NOT NULL, note text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS veilcall_billing_accounts (
  id uuid PRIMARY KEY, operator_id text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('test','live')),
  stripe_customer_id text, subscription_id text,
  subscription_status text NOT NULL DEFAULT 'none', paid_until timestamptz,
  balance_micro bigint NOT NULL DEFAULT 0,
  held_micro bigint NOT NULL DEFAULT 0 CHECK (held_micro >= 0),
  blocked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operator_id,mode), UNIQUE (mode,stripe_customer_id), UNIQUE (mode,subscription_id)
);
CREATE TABLE IF NOT EXISTS veilcall_billing_orders (
  id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES veilcall_billing_accounts(id),
  kind text NOT NULL CHECK (kind IN ('subscription','topup')),
  amount_cents integer NOT NULL CHECK (amount_cents > 0), price_id text,
  status text NOT NULL DEFAULT 'creating' CHECK (status IN ('creating','open','paid','failed','expired')),
  checkout_id text UNIQUE, checkout_url text, checkout_params jsonb, payment_intent_id text UNIQUE, subscription_id text,
  refunded_cents integer NOT NULL DEFAULT 0 CHECK (refunded_cents >= 0),
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS veilcall_billing_orders_account ON veilcall_billing_orders(account_id,created_at DESC);
CREATE TABLE IF NOT EXISTS veilcall_billing_events (
  mode text NOT NULL CHECK (mode IN ('test','live')), event_id text NOT NULL,
  event_type text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(mode,event_id)
);
CREATE TABLE IF NOT EXISTS veilcall_billing_ledger (
  id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES veilcall_billing_accounts(id),
  reference text NOT NULL, kind text NOT NULL CHECK (kind IN ('topup','usage','refund')),
  amount_micro bigint NOT NULL, description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(account_id,reference)
);
CREATE INDEX IF NOT EXISTS veilcall_billing_ledger_account ON veilcall_billing_ledger(account_id,created_at DESC);
CREATE TABLE IF NOT EXISTS veilcall_call_reservations (
  id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES veilcall_billing_accounts(id),
  to_number text NOT NULL, from_number text NOT NULL, route text NOT NULL,
  rate_micro integer NOT NULL CHECK (rate_micro > 0), fee_micro integer NOT NULL CHECK (fee_micro >= 0),
  held_micro integer NOT NULL CHECK (held_micro > 0), max_seconds integer NOT NULL CHECK(max_seconds BETWEEN 60 AND 3600),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','active','settled','released')),
  call_sid text UNIQUE, child_sid text, duration_seconds integer,
  charge_micro integer, provider_cost jsonb,
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), settled_at timestamptz
);
CREATE INDEX IF NOT EXISTS veilcall_call_reservations_account ON veilcall_call_reservations(account_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS veilcall_call_reservations_one_active
  ON veilcall_call_reservations(account_id) WHERE status IN ('reserved','active');
