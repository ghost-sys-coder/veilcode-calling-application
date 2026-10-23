CREATE TABLE IF NOT EXISTS veilcall_calls (
  call_sid text PRIMARY KEY CHECK (call_sid ~ '^CA[0-9a-fA-F]{32}$'),
  operator_id text NOT NULL,
  to_number text NOT NULL DEFAULT '',
  from_number text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT '',
  started_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'unknown',
  duration_seconds integer NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 10000),
  rating smallint CHECK (rating BETWEEN 1 AND 5),
  bookmarks jsonb NOT NULL DEFAULT '[]'::jsonb,
  consent_confirmed_at timestamptz,
  consent_version text,
  recording_token text,
  recording_lease_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS veilcall_calls_operator_date_idx
  ON veilcall_calls (operator_id, started_at DESC, call_sid DESC);

CREATE TABLE IF NOT EXISTS veilcall_recordings (
  recording_sid text PRIMARY KEY CHECK (recording_sid ~ '^RE[0-9a-fA-F]{32}$'),
  call_sid text NOT NULL REFERENCES veilcall_calls(call_sid),
  status text NOT NULL,
  duration_seconds integer NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  channels smallint NOT NULL DEFAULT 2 CHECK (channels IN (1, 2)),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consent_confirmed_at timestamptz NOT NULL,
  deleted_at timestamptz,
  deletion_pending boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS veilcall_recordings_call_idx ON veilcall_recordings (call_sid, created_at);
CREATE INDEX IF NOT EXISTS veilcall_recordings_retention_idx ON veilcall_recordings (expires_at)
  WHERE deleted_at IS NULL OR deletion_pending = true;
