ALTER TABLE templates ALTER COLUMN background_path DROP NOT NULL;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS background_x NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS background_y NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS background_width NUMERIC NOT NULL DEFAULT 1800;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS background_height NUMERIC NOT NULL DEFAULT 1200;
CREATE UNIQUE INDEX IF NOT EXISTS templates_name_unique ON templates (name);

CREATE TABLE IF NOT EXISTS template_placements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  capture_index INT NOT NULL CHECK (capture_index > 0),
  x NUMERIC NOT NULL,
  y NUMERIC NOT NULL,
  width NUMERIC NOT NULL CHECK (width > 0),
  height NUMERIC NOT NULL CHECK (height > 0),
  rotation NUMERIC NOT NULL DEFAULT 0,
  border_radius NUMERIC NOT NULL DEFAULT 0 CHECK (border_radius >= 0),
  z_index INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS template_overlays (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  label VARCHAR(255) NOT NULL,
  asset_path TEXT,
  x NUMERIC NOT NULL,
  y NUMERIC NOT NULL,
  width NUMERIC NOT NULL CHECK (width > 0),
  height NUMERIC NOT NULL CHECK (height > 0),
  rotation NUMERIC NOT NULL DEFAULT 0,
  z_index INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_template_placements_template_id ON template_placements(template_id);
CREATE INDEX IF NOT EXISTS idx_template_overlays_template_id ON template_overlays(template_id);
