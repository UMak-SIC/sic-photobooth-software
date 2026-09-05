-- Photobooth Platform Core Schema
-- Authoritative Implementation Contract

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Events Table
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  date DATE NOT NULL,
  operator_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_events_name_date UNIQUE (name, date)
);

-- 2. Templates Table (Photo Strips)
CREATE TABLE IF NOT EXISTS templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  orientation VARCHAR(20) NOT NULL CHECK (orientation IN ('landscape', 'portrait')),
  output_width INT NOT NULL DEFAULT 1800,
  output_height INT NOT NULL DEFAULT 1200,
  background_path TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  required_capture_count INT NOT NULL DEFAULT 3,
  countdown_seconds INT NOT NULL DEFAULT 5 CHECK (countdown_seconds IN (3, 5, 10)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2a. Template Placements Table
CREATE TABLE IF NOT EXISTS template_placements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  capture_index INT NOT NULL CHECK (capture_index >= 1),
  x INT NOT NULL,
  y INT NOT NULL,
  width INT NOT NULL CHECK (width > 0),
  height INT NOT NULL CHECK (height > 0),
  rotation INT NOT NULL DEFAULT 0,
  border_radius INT NOT NULL DEFAULT 0 CHECK (border_radius >= 0),
  z_index INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_template_placements_template_id ON template_placements(template_id);

-- 2b. Template Overlays Table
CREATE TABLE IF NOT EXISTS template_overlays (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  label VARCHAR(255) NOT NULL,
  asset_path TEXT NOT NULL,
  x INT NOT NULL DEFAULT 0,
  y INT NOT NULL DEFAULT 0,
  width INT NOT NULL CHECK (width > 0),
  height INT NOT NULL CHECK (height > 0),
  rotation INT NOT NULL DEFAULT 0,
  z_index INT NOT NULL DEFAULT 2,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_template_overlays_template_id ON template_overlays(template_id);

-- 3. Frames Table (Flipbook Overlays)
CREATE TABLE IF NOT EXISTS frames (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  overlay_path TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Sessions Table
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token VARCHAR(64) NOT NULL,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('photo_strip', 'flipbook')),
  state VARCHAR(50) NOT NULL,
  template_id UUID REFERENCES templates(id) ON DELETE SET NULL,
  frame_id UUID REFERENCES frames(id) ON DELETE SET NULL,
  template_snapshot JSONB,
  retake_count INT NOT NULL DEFAULT 0,
  is_printed BOOLEAN NOT NULL DEFAULT false,
  copies_printed INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_at TIMESTAMPTZ
);

-- 5. Session Captures Table (Photos & Cover Photos)
CREATE TABLE IF NOT EXISTS session_captures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  capture_index INT NOT NULL,
  file_path TEXT NOT NULL,
  is_cover BOOLEAN NOT NULL DEFAULT false,
  is_selected BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 6. Session Videos Table (Flipbook recordings)
CREATE TABLE IF NOT EXISTS session_videos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  video_index INT NOT NULL,
  file_path TEXT NOT NULL,
  duration_seconds NUMERIC(5, 2) NOT NULL DEFAULT 6.00,
  is_selected BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 7. Generated Outputs Table (Local finalized PNG / GIF)
CREATE TABLE IF NOT EXISTS generated_outputs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  public_id VARCHAR(7) NOT NULL UNIQUE,
  media_type VARCHAR(50) NOT NULL CHECK (media_type IN ('image/png', 'image/gif')),
  file_path TEXT NOT NULL,
  width INT NOT NULL,
  height INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 8. Publication Records Table (Async Cloud Sync & Dead Letter Queue)
CREATE TABLE IF NOT EXISTS publication_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  output_id UUID NOT NULL REFERENCES generated_outputs(id) ON DELETE CASCADE,
  public_id VARCHAR(7) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'in_progress', 'uploaded', 'failed')),
  retry_count INT NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_error TEXT,
  cloudinary_url TEXT,
  cloudinary_public_id TEXT,
  cloud_finalized_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for rapid lookup
CREATE INDEX IF NOT EXISTS idx_sessions_event_id ON sessions(event_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_generated_outputs_public_id ON generated_outputs(public_id);
CREATE INDEX IF NOT EXISTS idx_publication_records_status ON publication_records(status);
CREATE INDEX IF NOT EXISTS idx_publication_records_public_id ON publication_records(public_id);
CREATE INDEX IF NOT EXISTS idx_publication_records_due ON publication_records(status, next_attempt_at) WHERE status = 'queued';
