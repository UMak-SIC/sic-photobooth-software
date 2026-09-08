ALTER TABLE publication_records
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_publication_records_due
  ON publication_records (status, next_attempt_at)
  WHERE status = 'queued';
