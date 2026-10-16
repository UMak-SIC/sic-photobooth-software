# Legacy PostgreSQL import and parity gate

Phase 4 of `plans/sqlite-local-database-migration-plan.md`. These commands build a SQLite candidate from a **restored copy** of the legacy PostgreSQL database and prove the two match. They are rehearsal and cutover tools only. They do not change the runtime engine, and they never write to PostgreSQL.

| Command | Script |
| --- | --- |
| `pnpm --filter @photobooth/backend db:import-legacy` | `import-legacy-postgres.ts` |
| `pnpm --filter @photobooth/backend db:validate-parity` | `validate-postgres-sqlite-parity.ts` |
| `pnpm --filter @photobooth/backend typecheck:scripts` | type-checks these scripts and their tests (`tsconfig.scripts.json`) |

Both commands run through `tsx` from the backend package, so they have declared access to `pg` and `better-sqlite3`.

## Safety rules

- The source is read only from `--source-url` or `LEGACY_DATABASE_URL`. The app's `DATABASE_URL` and its config default are **never** used as a fallback. A source URL identical to `DATABASE_URL` is refused.
- A source database named exactly `photobooth` (the live booth database) is refused. The check runs on the URL and again on `current_database()` after connecting. Pass `--allow-live-source` only during an approved cutover with writes frozen (Phase 5).
- The source is read inside one `REPEATABLE READ READ ONLY` transaction, so every table comes from a single consistent snapshot.
- Connection strings and passwords are never printed. Errors and reports record only host, port, and database name.
- The importer refuses a destination that already exists, including an empty file or a leftover `-wal`, `-shm`, or `-journal` sidecar. It also refuses the configured `SQLITE_DATABASE_PATH`. Always import into a new, versioned candidate file.

## Import

```sh
pnpm --filter @photobooth/backend db:import-legacy -- \
  --source-url 'postgresql://USER@localhost:5432/photobooth_restore_<UTC>' \
  --destination /path/to/photobooth-<UTC>.sqlite \
  [--summary /var/backups/sic-photobooth/postgresql/<UTC>/import-summary.json]
```

What it does:

1. **Preflight, before any file is created.**
   - The source `schema_migrations` ledger must contain exactly the repository migrations `001`–`010`, with matching checksums.
   - The source catalog (tables, columns, types, nullability) must match the column map in `lib/import-schema.ts`, which is written from those migrations and not from `schema.sql`. An unknown table or column fails the import, so no data can be silently dropped.
2. **Read every table** and convert the values:
   - Timestamps become canonical UTC `YYYY-MM-DDTHH:mm:ss.sssZ`, extracted in SQL with `AT TIME ZONE 'UTC'`, so the database's `TimeZone` setting does not matter.
   - `DATE` becomes `YYYY-MM-DD` and booleans become `0`/`1`.
   - `NUMERIC` becomes `REAL`. Any value a double cannot hold exactly is refused.
   - `JSONB` is stored as compact JSON text.
   - IDs, paths, statuses, and retry and accounting fields are copied unchanged. Stored paths are not rewritten.
3. **Create the file.** It is created with mode `0600` beside the destination, under a temporary name. The checksum-protected SQLite migrations run on it, and the SQLite schema is checked against the same column map.
4. **Insert all rows in one transaction**, in foreign-key dependency order. Reprints are ordered after their original print job. Foreign keys stay enforced and are checked at `COMMIT`.
5. **Check the result.** It runs `PRAGMA foreign_key_check` and `PRAGMA integrity_check` and compares row counts.
6. **Publish.** It checkpoints and closes the database, then hard-links the file to the destination. The link never overwrites an existing file.

On any failure the transaction rolls back, and the temporary file and its sidecars are deleted. The destination never exists in a partial state.

Sub-millisecond precision in PostgreSQL timestamps is truncated to milliseconds, as the canonical format requires. The count of affected values is reported.

## Parity validation

```sh
pnpm --filter @photobooth/backend db:validate-parity -- \
  --source-url 'postgresql://USER@localhost:5432/photobooth_restore_<UTC>' \
  --sqlite /path/to/photobooth-<UTC>.sqlite \
  --report /var/backups/sic-photobooth/postgresql/<UTC>/parity-report.json \
  [--media-manifest /var/backups/.../storage-manifest.sha256 --storage-root /path/to/storage [--verify-media-files]]
```

The command exits `0` only when the report's `status` is `pass`. It exits `1` on any mismatch or abort, and `2` on usage errors.

The report is JSON, written with mode `0600`. It is never overwritten, so choose a new path for each run. It contains no credentials, no session tokens, and no column values. Differences are reported only as row IDs and column names.

The checks:

- **Ledgers and catalog.**
  - The source migration ledger must match `001`–`010`.
  - The source catalog and the SQLite schema must both match the column map.
  - The SQLite `schema_migrations` must match the current SQLite migration files.
- **Rows.** For every table, the validator compares counts, key sets (missing and extra IDs), and each column of every row, and records a SHA-256 digest of each side.
  - JSON is compared after key sorting.
  - Timestamps are checked two ways: by text, and against an epoch read independently from PostgreSQL (`extract(epoch …)`). A bug in the timezone conversion therefore cannot validate itself.
- **Semantic aggregates.** The source side is computed from the PostgreSQL rows and the SQLite side by native SQLite SQL, then the two are compared.
  - Foreign-key orphans for every relationship.
  - Publication and print queue states, retry totals, and current and superseded attempts.
  - Print ownership and copy totals per session.
  - Event, template, session, and output relationship counts.
  - Public-ID-to-output mappings, and consistency of the public ID and session between publications and print jobs.
  - Analytics groups (event, type, template label, UTC day) over confirmed and printed sessions.
- **Stored constraints.** Every timestamp, date, UUID, JSON, and boolean value must be in canonical form. Public IDs that are not seven base-62 characters are reported as warnings.
- **Media (optional).** Every stored path in the database must appear in the manifest. With `--verify-media-files`, each referenced file is re-hashed under `--storage-root`. The manifest may be `sha256sum` output (`<sha256>  <path>`) or `<sha256>\t<size>\t<path>`. Absolute paths inside the storage root are matched by their storage-relative form.
- **Finish.**
  - `PRAGMA integrity_check` and `PRAGMA foreign_key_check`.
  - A reopen test on a fresh connection: `quick_check`, row counts, and the migration ledger.
  - A SHA-256 of the candidate before and after validation, to prove the validator did not modify it.

## Rehearsal outline (Phase 4 gate)

1. Restore the verified `photobooth.dump` into a newly created disposable database, for example `photobooth_restore_<UTC>`, following `docs/runbooks/database-backup-and-restore.md`.
2. Run `db:import-legacy` into a new versioned file.
3. Run `db:validate-parity` with the backup set's media manifest. Store the report beside the secured backup.
4. Any mismatch blocks cutover.
5. Start Fastify with `LOCAL_DATABASE_ENGINE=sqlite` against the shadow file and smoke-test it. This needs the Phase 3 SQLite provider.

## Tests

The plan names `scripts/database/test/`. The tests live in `app/backend/test/` instead (`legacy-import*.test.ts`, `parity*.test.ts`, and the shared fixture `legacy-import-fixture.ts`), because the backend Vitest project only collects `test/**/*.test.ts`.

The tests use an in-memory fake reader with the same output contract as the PostgreSQL reader. They never connect to PostgreSQL.
