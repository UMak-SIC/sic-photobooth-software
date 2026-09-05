# Regression Log

## === What's Here ===

Confirmed regressions and the test or check that prevents recurrence. Keep this empty until a real regression is fixed.

## Template

```md
### YYYY-MM-DD: Short Title

- Symptom: ...
- Root cause: ...
- Prevention: `path/to/test` or manual verification
- Related change: commit, PR, or issue
```

## Entries

### 2026-09-06: Legacy Classic Template Appears in Admin Library

- Symptom: `Classic Portrait Strip` appeared in the template library and requested a missing seeded background asset.
- Root cause: Legacy migration and in-memory fallback both created the test template.
- Prevention: `007_remove_classic_portrait_seed.sql` removes existing rows; browser verification confirms it is absent.

### 2026-09-06: Publication Job Never Leaves In Progress

- Symptom: Cloudinary contained the image, while the local publication queue stayed `in_progress`.
- Root cause: A stalled Cloudinary or Supabase request could hold a claimed job indefinitely, so the worker never recorded either success or a retry.
- Prevention: `app/backend/test/publishing-worker.test.ts`

### 2026-09-05: Saved Template Cannot Be Re-edited

- Symptom: Re-saving a loaded template rejected placement geometry as strings and placement IDs as unknown fields.
- Root cause: PostgreSQL numeric values were returned unnormalized, and frontend drafts retained server-only placement IDs.
- Prevention: `app/backend/test/templates.test.ts` and `app/photobooth-software/src/admin/templates/template-store.test.ts`

### 2026-09-05: Template Asset Replacement Rejects Seeded Paths

- Symptom: Uploading a replacement background returned HTTP 500 while removing the seeded asset path.
- Root cause: Seeded database asset paths are relative, but template storage validated them as process-relative filesystem paths.
- Prevention: `app/backend/test/templates.test.ts`
