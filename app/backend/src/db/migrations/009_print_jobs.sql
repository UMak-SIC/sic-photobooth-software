CREATE TABLE print_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  output_id UUID REFERENCES generated_outputs(id) ON DELETE SET NULL,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  request_key UUID NOT NULL UNIQUE,
  artifact_path TEXT NOT NULL,
  artifact_type VARCHAR(50) NOT NULL CHECK (artifact_type IN ('image/png', 'application/pdf')),
  public_id VARCHAR(7) NOT NULL,
  output_type VARCHAR(20) NOT NULL CHECK (output_type IN ('photo_strip', 'flipbook')),
  printer_name TEXT NOT NULL,
  media_size TEXT NOT NULL,
  copies_requested INT NOT NULL CHECK (copies_requested BETWEEN 1 AND 10),
  copies_completed INT NOT NULL DEFAULT 0 CHECK (copies_completed >= 0),
  submission_mode VARCHAR(12) NOT NULL CHECK (submission_mode IN ('cups', 'simulation')),
  status VARCHAR(20) NOT NULL CHECK (status IN ('queued', 'submitting', 'pending', 'processing', 'stopped', 'completed', 'failed', 'canceled', 'needs_attention')),
  last_error TEXT,
  last_reconciled_at TIMESTAMPTZ,
  reprint_of_id UUID REFERENCES print_jobs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE print_job_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  print_job_id UUID NOT NULL REFERENCES print_jobs(id) ON DELETE CASCADE,
  attempt_number INT NOT NULL,
  title TEXT NOT NULL UNIQUE,
  cups_job_id TEXT,
  state VARCHAR(20) NOT NULL DEFAULT 'submitting',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ,
  UNIQUE (print_job_id, attempt_number)
);

CREATE INDEX idx_print_jobs_status_created ON print_jobs(status, created_at DESC);
CREATE INDEX idx_print_jobs_output_active ON print_jobs(output_id) WHERE status IN ('queued', 'submitting', 'pending', 'processing', 'stopped');
