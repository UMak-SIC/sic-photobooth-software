-- Removes the legacy test template and its cascade-owned placements and overlays.
DELETE FROM templates
WHERE id = '00000000-0000-0000-0000-000000000001'
   OR name = 'Classic Portrait Strip';
