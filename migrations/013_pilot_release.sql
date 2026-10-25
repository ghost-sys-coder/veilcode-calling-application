-- Immutable commercial offers. Saving a draft never enables billing.
CREATE TABLE IF NOT EXISTS veilcall_pilot_offers (
  id uuid PRIMARY KEY,
  actor_id text NOT NULL,
  provider_account_sid text NOT NULL CHECK(provider_account_sid ~ '^AC[0-9a-fA-F]{32}$'),
  config jsonb NOT NULL CHECK(jsonb_typeof(config)='object'),
  policy_snapshot jsonb NOT NULL CHECK(jsonb_typeof(policy_snapshot)='object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS veilcall_pilot_control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
  draft_id uuid REFERENCES veilcall_pilot_offers(id),
  active_id uuid REFERENCES veilcall_pilot_offers(id),
  paused boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO veilcall_pilot_control(singleton) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS veilcall_pilot_audit (
  id uuid PRIMARY KEY, actor_id text NOT NULL, action text NOT NULL,
  offer_id uuid REFERENCES veilcall_pilot_offers(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS veilcall_policy_acceptances (
  operator_id text NOT NULL, offer_id uuid NOT NULL REFERENCES veilcall_pilot_offers(id),
  accepted_at timestamptz NOT NULL DEFAULT now(), immediate_service_requested boolean NOT NULL DEFAULT false,
  PRIMARY KEY(operator_id,offer_id)
);
ALTER TABLE veilcall_billing_orders ADD COLUMN IF NOT EXISTS offer_id uuid REFERENCES veilcall_pilot_offers(id);
ALTER TABLE veilcall_prepaid_quotes ADD COLUMN IF NOT EXISTS offer_id uuid REFERENCES veilcall_pilot_offers(id);
