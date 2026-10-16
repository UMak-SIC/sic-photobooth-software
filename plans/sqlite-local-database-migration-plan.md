## Goal

Replace the booth's local PostgreSQL database with a single durable SQLite database while preserving every event, template, session, capture/video reference, generated output, publication job, print job, and print attempt. PostgreSQL becomes a read-only legacy migration source: execution starts with a secured and restore-tested dump, proceeds through side-by-side SQLite implementation and repeatable parity checks, permits rollback only while the booth remains closed to writes, and becomes forward-recovery-only once SQLite begins accepting production work.

## Source Of Truth

- [PRD authoritative implementation contract](../docs/PRD.md#authoritative-implementation-contract)
- [PRD publishing and retrieval contract](../docs/PRD.md#publishing-and-retrieval-contract)
- [Offline/online retrieval architecture](../docs/system-architecture.md)
- [Backend component boundaries](../agents/component-breakdowns.md#backend)
- [Current PostgreSQL connection](../app/backend/src/db/pool.ts)
- [Current migration runner](../app/backend/src/db/migrations.ts)
- [Ordered PostgreSQL migrations](../app/backend/src/db/migrations/)
- [Current core repository](../app/backend/src/db/repository.ts)
- [Current template repository](../app/backend/src/templates/repository.ts)
- Restored production PostgreSQL catalog (`pg_catalog` and `information_schema`) and its checksum-tracked `schema_migrations` ledger

## Non-Goals

- Do not replace Supabase: it remains the public website's hosted metadata store, and Cloudinary remains the public media store.
- Do not move captured or generated media into SQLite; the database continues to store backend-controlled filesystem paths and metadata only.
- Do not change public IDs, session tokens, API response shapes, workflow rules, print semantics, publishing retry limits, or local/public retrieval behavior.
- Do not dual-write PostgreSQL and SQLite. A temporary database-engine selector may support one engine at a time during development and rehearsal, but production has exactly one write authority.
- Do not keep the in-memory repository fallback as a production recovery mechanism. Database failure must be visible and must not create a second source of truth.
- Do not promise PostgreSQL rollback after SQLite accepts production writes. Before write enable, rollback uses the untouched PostgreSQL system; after write enable, recovery is forward-only unless a separately approved reverse migrator is added.
- Do not delete the PostgreSQL database, verified dump, legacy deployment artifact, or rollback instructions as part of this migration.
- Do not treat `app/backend/src/db/schema.sql` as schema authority; it is a stale snapshot and may be retained only as non-executable legacy evidence until removal is verified safe.
- Do not copy a live SQLite database file for backup while WAL is active; use SQLite's backup API or `VACUUM INTO`.

## Execution Order

## PR Stacking Strategy

Use six stacked PRs. Each PR must build and pass its focused tests on its own; PostgreSQL remains the default engine until the cutover PR so the foundation and repository-port PRs are reviewable without making an empty SQLite database authoritative.

```text
main
└── database/postgres-backup-decision
    └── database/sqlite-foundation
        └── database/sqlite-repositories
            └── database/postgres-import-parity
                └── database/sqlite-cutover
                    └── database/sqlite-operations-cleanup
```

Merge in the order shown. With vanilla Git, branch each PR from the preceding branch and target that parent; use Graphite only if it is already configured. Tag the last known PostgreSQL-capable production commit as `legacy-postgres-cutover` before the final deployment, retain its built artifact, and do not deploy intermediate branches to the booth unless their engine remains explicitly set to PostgreSQL.

## Linear Sub-Issue Tracking

Create sub-issues from this plan when ready; no Linear parent issue was provided.

### 1. Secure And Prove A Restorable PostgreSQL Backup

- Before changing code or stopping PostgreSQL, resolve the active `DATABASE_URL` and the exact production backend launch command/environment owner without printing credentials; record both in `docs/runbooks/postgres-to-sqlite-cutover.md`. Record PostgreSQL server/client versions, migration versions, storage root, and free space; do not schedule cutover until the process manager, environment file/secret source, service owner, stop/start commands, and log location are known.
- Create `/var/backups/sic-photobooth/postgresql/<UTC-timestamp>/` with mode `0700` and `photobooth.dump`, `photobooth.dump.sha256`, `pg_restore.list`, `database-inventory.txt`, `storage-manifest.sha256`, and `restore-drill.txt` with mode `0600`. Run `pg_dump --format=custom --no-owner --no-privileges --dbname="$DATABASE_URL"`, checksum it, require `pg_restore --list` to succeed, generate a manifest of backend-controlled media paths/sizes/checksums, and copy the completed backup set to a protected second disk or encrypted operator-approved destination; fail closed on a missing, empty, mismatched, or single-copy artifact.
- Restore that exact dump into an explicitly named disposable PostgreSQL database, compare migration rows/checksums, per-table counts, key sets, orphan checks, publication/print states, representative public IDs, and the media manifest with the source, then record the evidence before dropping only the validated disposable target. Verify every `schema_migrations` entry against its repository file and do not proceed until the checksum, second copy, restore drill, and inventory comparison pass.
- Add `docs/decisions/local-sqlite-migration.md`, `docs/runbooks/database-backup-and-restore.md`, and `docs/runbooks/postgres-to-sqlite-cutover.md`; touch `docs/PRD.md` and `docs/traceability-matrix.md` only to record an approved, pending migration whose current runtime remains PostgreSQL. Do not update `agents/memory.md` or describe SQLite as the current source of truth until cutover is verified.

### 2. Add A Side-By-Side SQLite Foundation Without Switching Runtime

- Touch `app/backend/package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.gitignore`, `app/backend/src/config.ts`, and add `app/backend/.env.example`, `app/backend/src/db/sqlite/connection.ts`, `app/backend/src/db/sqlite/migrations.ts`, and `app/backend/src/db/sqlite/migrations/001_current_schema.sql`. Keep `app/backend/src/db/pool.ts`, the PostgreSQL migration runner, repositories, startup path, and `DATABASE_URL` operational; add `SQLITE_DATABASE_PATH` and a `LOCAL_DATABASE_ENGINE=postgres|sqlite` selector whose default remains `postgres` until Phase 5.
- Use `better-sqlite3` with its required types/build approval, update the backend build script to copy `src/db/sqlite/migrations` into `dist`, and verify a clean production-mode install/build/start against the supported Linux and Node ABI. Add scoped ignores for the configured development database directory plus SQLite `-wal`/`-shm` sidecars so database artifacts cannot be committed.
- Provide an injectable connection factory for tests and one process-owned production handle. On every connection require `foreign_keys=ON`, `journal_mode=WAL`, `synchronous=FULL`, bounded `busy_timeout`, and the JSON functions used by constraints; close and checkpoint on graceful shutdown, while each test suite receives a unique temporary database and guaranteed cleanup.
- Store UUIDs and dates as constrained `TEXT`, booleans as `INTEGER` constrained to `0/1`, and geometry/durations as `REAL`. Generate all timestamps in application code as canonical UTC `YYYY-MM-DDTHH:mm:ss.sssZ` strings—never mix SQLite `CURRENT_TIMESTAMP` with ISO strings—and centralize parameter serialization plus row hydration for dates, booleans, and JSON.
- Establish the effective PostgreSQL schema by replaying checksum-verified migrations `001`–`010` into clean disposable PostgreSQL and comparing tables, columns, defaults, constraints, foreign keys, and indexes with the restored production catalog. Resolve drift before translating that verified catalog into the fresh checksum-protected SQLite baseline; do not derive it from `app/backend/src/db/schema.sql`, and do not move or disable the active PostgreSQL migrations in this phase.

### 3. Port Repositories Behind A Single-Engine Boundary

- Add `app/backend/src/db/contracts.ts`, `app/backend/src/db/provider.ts`, `app/backend/src/db/sqlite/repository.ts`, and `app/backend/src/templates/sqlite-repository.ts`; retain the existing PostgreSQL repositories as the legacy implementation until cleanup. Route application consumers through one selected provider without dual writes, keep `postgres` as the default, and preserve the repositories' existing asynchronous public interfaces so HTTP routes and services do not learn database-specific details.
- Port `$n` parameters, casts/types, `ILIKE`, `ANY(uuid[])`, `NULLS LAST`, JSONB, result objects, date handling, and UUID defaults into explicit SQLite statements and shared mappers. Define and test equivalent case-insensitive search/collation behavior, deterministic null ordering, canonical timestamp comparisons, JSON normalization, and application-generated identifiers.
- Replace `FOR UPDATE SKIP LOCKED` publication/print claims with short SQLite `BEGIN IMMEDIATE` transactions that select eligible IDs, conditionally update only rows still in the expected state, and return the claimed records before commit. Keep Cloudinary, Supabase, CUPS, filesystem, and media operations outside transactions while preserving idempotent output creation, print completion accounting, retry/dead-letter behavior, stale-job recovery, template snapshotting, and session transitions.
- Touch `app/backend/src/server.ts`, `app/backend/src/routes/health.ts`, `app/backend/src/db/migrate-cli.ts`, `app/backend/src/services/publishing-worker.ts`, and `app/backend/src/services/print-worker.ts` so health, migration, worker startup, and shutdown use the selected engine. Remove the in-memory fallback from both implementations, propagate database failures, and add `app/backend/test/sqlite-repository.test.ts`, `app/backend/test/sqlite-concurrency.test.ts`, and engine-contract tests covering rollback-on-error, constraints, simultaneous readers, serialized writers, atomic claims, restart persistence, timestamp ordering, search semantics, and WAL lifecycle.

### 4. Build A Packaged Legacy Import And Data-Parity Gate

- Add `app/backend/scripts/database/import-legacy-postgres.ts`, `app/backend/scripts/database/validate-postgres-sqlite-parity.ts`, `app/backend/scripts/database/README.md`, tests under `app/backend/scripts/database/test/`, and explicit backend package commands. Keeping the tooling inside `@photobooth/backend` gives it declared access to both `pg` and `better-sqlite3`; the importer reads a restored legacy database, refuses a non-empty destination, and writes a fresh non-production SQLite file in dependency order inside one transaction.
- Preserve every identifier, canonical timestamp, path, status, JSON value, retry field, and accounting field. Validate per-table counts and key sets, foreign-key orphans, normalized JSON, constraints, event/template/session/output relationships, public-ID mappings, queue states, print ownership/copy totals, analytics aggregates, and the media manifest; finish with `PRAGMA integrity_check`, `PRAGMA foreign_key_check`, a reopen test, and an application smoke test.
- Emit a redacted machine-readable report beside the secured backup, block cutover on any mismatch, and test complete rollback of a failed import. Run at least one rehearsal beginning from `photobooth.dump`: restore it, verify its migration ledger/catalog against clean `001`–`010`, import it, validate parity, start Fastify with `LOCAL_DATABASE_ENGINE=sqlite` against the shadow file, and exercise event/template reads, session continuation, local retrieval, publication recovery, and print reconciliation.

### 5. Freeze, Validate, Cut Over, And Close The Rollback Window

- Use the exact production service and environment locations recorded in Phase 1. Schedule maintenance, close the booth, stop Fastify and both workers, prove no application connections remain, take and secure a new final PostgreSQL dump plus media manifest, leave PostgreSQL untouched, import into a new versioned SQLite file, and rerun the complete parity gate before changing configuration.
- Add a cutover validation mode or equivalent command that opens the production SQLite candidate, runs migrations/health/read-only API checks, and prevents mutation routes plus publishing/print workers from starting. While this hold is active, verify integrity, foreign keys, expected counts/states, local QR retrieval, and packaged application startup; any failure rolls back by restoring the PostgreSQL engine configuration and retained legacy artifact while the booth is still closed.
- Make `LOCAL_DATABASE_ENGINE=sqlite` and `SQLITE_DATABASE_PATH=<validated-versioned-file>` active atomically, then explicitly remove the hold and reopen writes. This is the rollback boundary: once mutation endpoints or workers accept work, PostgreSQL is stale and automatic rollback is prohibited; subsequent incidents close the booth and use SQLite restore/repair-forward procedures unless a separately approved reverse migration exists.
- Start exactly one Fastify process, monitor busy/locked errors, health, queue states, disk space, and backup completion through the first event, and never switch database files while the application or either worker is active. Record cutover timestamps, checksums, validation results, rollback-window closure, and operator sign-off in `docs/runbooks/postgres-to-sqlite-cutover.md`.

### 6. Remove PostgreSQL Runtime Support And Operationalize SQLite

- After the observation period and operator sign-off, remove the engine selector and legacy runtime implementation; touch `app/backend/package.json`, `pnpm-lock.yaml`, `app/backend/src/config.ts`, `app/backend/src/db/`, `app/backend/src/templates/`, tests, environment examples, and build scripts. Remove `pg`, `@types/pg`, `DATABASE_URL`, pool mocks, PostgreSQL startup paths, and live-import commands; move migrations `001`–`010` plus the stale schema snapshot under `app/backend/src/db/legacy-postgres/` as non-executable evidence, retaining the dump, cutover tag/artifact, parity report, and restore runbooks per the approved retention policy.
- Add `app/backend/scripts/database/backup-sqlite.ts`, `app/backend/scripts/database/verify-sqlite-backup.ts`, package commands, and `docs/runbooks/sqlite-backup-and-restore.md`. Use the online backup API or `VACUUM INTO`, write with restrictive permissions to a separate protected destination, checksum and reopen the copy read-only, run integrity/foreign-key checks, test restore to a disposable path, and define scheduling, retention, encryption/transport, free-space alerts, and recovery ownership.
- Update `AGENTS.md`, `README.md`, `docs/PRD.md`, `docs/system-architecture.md`, `docs/traceability-matrix.md`, `agents/coding-preferences.md`, `agents/component-breakdowns.md`, `agents/recovery.md`, `agents/unit-tests.md`, `agents/e2e-tests.md`, `agents/regressions.md`, and finally `agents/memory.md` to describe the verified current runtime. Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build`, then perform offline capture/finalization/retrieval, queued publication/restart/retry, template editing, analytics, print reconciliation, SQLite backup, and disposable restore smoke tests.

## Acceptance Criteria

- Before implementation, a mode-`0600`, checksummed custom-format PostgreSQL dump and media manifest exist in two protected failure domains; `pg_restore --list` and a disposable restore match the recorded source inventory.
- The exact production process manager, service command, environment/secret source, owner, logs, and stop/start procedure are recorded before cutover work is scheduled.
- The restored `schema_migrations` ledger matches repository migrations `001`–`010` by filename/checksum, and a clean replay produces a PostgreSQL catalog equivalent to production or all drift is explicitly resolved before SQLite DDL is written.
- The SQLite foundation PR builds independently while PostgreSQL remains operational and default; no phase removes `pool.ts` or active PostgreSQL migrations before all consumers can use the SQLite provider.
- Production packaging installs the native SQLite module on the supported Linux/Node ABI and includes SQLite migration files in `dist`; database files and WAL sidecars are ignored by Git.
- SQLite enables foreign keys, WAL, full synchronous durability, bounded busy handling, JSON support, isolated test connections, and canonical application-generated UTC timestamps.
- The importer rebuilds a fresh SQLite database from PostgreSQL restored from the verified dump, preserves identifiers and operational state, refuses dirty destinations, and rolls back completely on failure.
- Automated parity reports show matching rows, relationships, JSON, queue/accounting state, analytics totals, and media manifests; SQLite integrity and foreign-key checks pass.
- Publication and print claims remain atomic under concurrency, retries remain idempotent, stale jobs recover correctly, and print completion increments session accounting exactly once.
- A rehearsal proves pre-write rollback. Production rollback closes explicitly when SQLite mutation endpoints/workers are enabled; after that point the documented policy is repair-forward, not reconnection to stale PostgreSQL.
- Local capture, confirmation, printing, captive retrieval, restart recovery, and asynchronous publication work without internet or PostgreSQL.
- Current-state PRD and agent-memory claims switch to SQLite only after verified cutover; pending-decision documentation before cutover continues to identify PostgreSQL as the active runtime.
- After acceptance, production code and manifests contain no `pg`, `@types/pg`, `DATABASE_URL`, PostgreSQL service requirement, engine selector, dual implementation, or PostgreSQL runtime startup path.
- Scheduled SQLite backups are WAL-safe, protected, checksummed, integrity-tested, and restorable to a disposable path through the documented runbook.
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build` pass, followed by the documented offline workflow, queue recovery, backup, and restore smoke tests.
