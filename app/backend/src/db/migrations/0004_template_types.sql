ALTER TABLE templates ADD COLUMN IF NOT EXISTS type VARCHAR(20) NOT NULL DEFAULT 'photo_strip' CHECK (type IN ('photo_strip', 'flipbook'));
ALTER TABLE templates ADD COLUMN IF NOT EXISTS cover_path TEXT;
