-- 002_normalize_template_schema.sql
-- Normalizes template placements and overlays into relational child tables
-- and enhances templates for the template editor
-- Authoritative Implementation Contract: Template Editor (EPIC-09 / EPIC-05)

-- 1. Modify templates table for template editor capabilities
ALTER TABLE templates ALTER COLUMN background_path DROP NOT NULL;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS background_x NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS background_y NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS background_width NUMERIC NOT NULL DEFAULT 1800;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS background_height NUMERIC NOT NULL DEFAULT 1200;
CREATE UNIQUE INDEX IF NOT EXISTS templates_name_unique ON templates (name);

-- 2. Create template_placements table
CREATE TABLE IF NOT EXISTS template_placements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  capture_index INT NOT NULL CHECK (capture_index >= 1),
  x NUMERIC NOT NULL,
  y NUMERIC NOT NULL,
  width NUMERIC NOT NULL CHECK (width > 0),
  height NUMERIC NOT NULL CHECK (height > 0),
  rotation NUMERIC NOT NULL DEFAULT 0,
  border_radius NUMERIC NOT NULL DEFAULT 0 CHECK (border_radius >= 0),
  z_index INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_template_placements_template_id ON template_placements(template_id);

-- 3. Create template_overlays table
CREATE TABLE IF NOT EXISTS template_overlays (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  label VARCHAR(255) NOT NULL,
  asset_path TEXT,
  x NUMERIC NOT NULL DEFAULT 0,
  y NUMERIC NOT NULL DEFAULT 0,
  width NUMERIC NOT NULL CHECK (width > 0),
  height NUMERIC NOT NULL CHECK (height > 0),
  rotation NUMERIC NOT NULL DEFAULT 0,
  z_index INT NOT NULL DEFAULT 2,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_template_overlays_template_id ON template_overlays(template_id);

-- 4. Data Migration: migrate legacy templates.placements JSONB rows into template_placements
DO $$
DECLARE
  t_row RECORD;
  p_elem JSONB;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'templates' AND column_name = 'placements'
  ) THEN
    FOR t_row IN SELECT id, placements FROM templates WHERE jsonb_typeof(placements) = 'array' AND jsonb_array_length(placements) > 0 LOOP
      FOR p_elem IN SELECT * FROM jsonb_array_elements(t_row.placements) LOOP
        INSERT INTO template_placements (
          template_id, capture_index, x, y, width, height, rotation, border_radius, z_index
        ) VALUES (
          t_row.id,
          COALESCE((p_elem->>'captureIndex')::INT, 1),
          COALESCE((p_elem->>'x')::NUMERIC, 0),
          COALESCE((p_elem->>'y')::NUMERIC, 0),
          COALESCE((p_elem->>'width')::NUMERIC, 100),
          COALESCE((p_elem->>'height')::NUMERIC, 100),
          COALESCE((p_elem->>'rotation')::NUMERIC, 0),
          COALESCE((p_elem->>'borderRadius')::NUMERIC, 0),
          COALESCE((p_elem->>'zIndex')::INT, 1)
        );
      END LOOP;
    END LOOP;

    -- Drop the JSONB column to eliminate duplicate sources of truth
    ALTER TABLE templates DROP COLUMN IF EXISTS placements;
  END IF;
END $$;

-- 5. Seed Canonical Default Templates and Placements if none exist
DO $$
DECLARE
  classic_id UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM templates WHERE id = classic_id) THEN
    INSERT INTO templates (
      id, name, orientation, output_width, output_height,
      background_path, background_x, background_y, background_width, background_height,
      is_active, required_capture_count, countdown_seconds
    ) VALUES (
      classic_id,
      'Classic Portrait Strip',
      'portrait',
      1200,
      1800,
      'templates/classic-portrait.png',
      0,
      0,
      1200,
      1800,
      true,
      3,
      5
    );

    INSERT INTO template_placements (
      template_id, capture_index, x, y, width, height, rotation, border_radius, z_index
    ) VALUES
      (classic_id, 1, 100, 120, 1000, 440, 0, 8, 1),
      (classic_id, 2, 100, 600, 1000, 440, 0, 8, 1),
      (classic_id, 3, 100, 1080, 1000, 440, 0, 8, 1);
  END IF;
END $$;
