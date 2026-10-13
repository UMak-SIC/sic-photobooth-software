ALTER TABLE print_job_attempts
  ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ;

UPDATE print_job_attempts older
SET is_current = false,
    superseded_at = COALESCE(older.superseded_at, CURRENT_TIMESTAMP)
FROM print_job_attempts newer
WHERE older.print_job_id = newer.print_job_id
  AND older.attempt_number < newer.attempt_number
  AND older.is_current = true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_print_job_attempts_one_current
  ON print_job_attempts(print_job_id)
  WHERE is_current;

CREATE INDEX IF NOT EXISTS idx_print_job_attempts_superseded_reconciliation
  ON print_job_attempts(is_current, state)
  WHERE cups_job_id IS NOT NULL;
