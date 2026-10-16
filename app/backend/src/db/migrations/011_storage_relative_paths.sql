-- Persist file paths relative to the storage directory so moving the checkout
-- or changing STORAGE_DIR does not orphan existing rows. The greedy match keeps
-- everything after the last `/storage/` segment, mirroring resolveStoredPath().
UPDATE session_captures SET file_path = regexp_replace(file_path, '^.*/storage/', '')
  WHERE file_path LIKE '/%/storage/%';
UPDATE session_videos SET file_path = regexp_replace(file_path, '^.*/storage/', '')
  WHERE file_path LIKE '/%/storage/%';
UPDATE generated_outputs SET file_path = regexp_replace(file_path, '^.*/storage/', '')
  WHERE file_path LIKE '/%/storage/%';
UPDATE print_jobs SET artifact_path = regexp_replace(artifact_path, '^.*/storage/', '')
  WHERE artifact_path LIKE '/%/storage/%';
UPDATE templates SET background_path = regexp_replace(background_path, '^.*/storage/', '')
  WHERE background_path LIKE '/%/storage/%';
UPDATE templates SET cover_path = regexp_replace(cover_path, '^.*/storage/', '')
  WHERE cover_path LIKE '/%/storage/%';
UPDATE template_overlays SET asset_path = regexp_replace(asset_path, '^.*/storage/', '')
  WHERE asset_path LIKE '/%/storage/%';
