CREATE TABLE IF NOT EXISTS veilcall_contacts (
  id uuid PRIMARY KEY,
  operator_id text NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  company text NOT NULL DEFAULT '' CHECK (char_length(company)<=160),
  phone_number text NOT NULL CHECK (phone_number ~ '^\+[1-9][0-9]{7,14}$'),
  country text NOT NULL CHECK (country IN ('US','CA','GB','AU')),
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes)<=5000),
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  UNIQUE(operator_id,phone_number)
);
CREATE INDEX IF NOT EXISTS veilcall_contacts_operator_updated_idx ON veilcall_contacts (operator_id,updated_at DESC,id DESC);
