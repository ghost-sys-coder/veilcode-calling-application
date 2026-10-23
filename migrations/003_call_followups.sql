CREATE TABLE IF NOT EXISTS veilcall_call_followups (
  call_sid text PRIMARY KEY REFERENCES veilcall_calls(call_sid),
  outcome text NOT NULL CHECK (outcome IN ('not_set','interested','not_interested','no_answer','callback_needed')),
  callback_at timestamptz(3),
  note text NOT NULL DEFAULT '' CHECK (length(note)<=5000),
  completed_at timestamptz(3),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  CHECK ((outcome='callback_needed' AND callback_at IS NOT NULL) OR
    (outcome<>'callback_needed' AND callback_at IS NULL AND completed_at IS NULL))
);
CREATE INDEX IF NOT EXISTS veilcall_followups_due_idx ON veilcall_call_followups(callback_at,call_sid)
  WHERE callback_at IS NOT NULL;
