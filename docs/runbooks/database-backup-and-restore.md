# PostgreSQL Backup And Restore Runbook

> Legacy. The backend no longer runs on PostgreSQL. Use this runbook only to restore the retained pre-cutover dump for evidence or a re-import rehearsal. Current backups follow `docs/runbooks/sqlite-backup-and-restore.md`.

## Scope and safety

Use this runbook only while PostgreSQL is the production local database. Run it from the recorded service-owner account. Do not print `DATABASE_URL`, passwords, or dump contents in a terminal transcript.

The backup set is incomplete unless it contains a non-empty custom dump, SHA-256 checksum, `pg_restore --list` output, database inventory, storage manifest, restore-drill evidence, and a verified protected second copy.

## Preflight

Record the following in the cutover runbook without secrets:

- active backend launch command, process manager, service owner, environment/secret source, stop/start procedure, and log location;
- PostgreSQL server and client versions;
- applied `schema_migrations` IDs and checksums;
- backend-controlled storage root and available disk space.

Confirm the booth is closed to writes for the final backup. Earlier rehearsal backups may be taken only with the operational owner’s approval.

## Create a backup set

Use a UTC timestamp and create `/var/backups/sic-photobooth/postgresql/<UTC-timestamp>/` with mode `0700`. Files inside must use mode `0600`.

1. Run `pg_dump --format=custom --no-owner --no-privileges --dbname="$DATABASE_URL"` to `photobooth.dump`.
2. Reject a missing or empty dump; create `photobooth.dump.sha256` and verify it immediately.
3. Run `pg_restore --list photobooth.dump` and save the result as `pg_restore.list`.
4. Save a redacted database inventory with table counts, schema-migration ledger, key sets, queue/print state counts, and representative public IDs.
5. Create `storage-manifest.sha256` over backend-controlled media paths, sizes, and checksums. Do not include arbitrary user-controlled paths.
6. Copy the completed set to a protected second disk or encrypted operator-approved destination. Verify its checksums there. A single copy blocks migration progress.

## Restore drill

Restore only into a newly created, explicitly named disposable PostgreSQL database. Compare it to the source inventory before dropping that disposable target:

- migration IDs and checksums against the repository migrations and source ledger;
- table counts, key sets, relationships, orphan checks, publication state, print state, and representative public IDs;
- storage manifest;
- effective catalog: tables, columns, defaults, constraints, foreign keys, and indexes.

Record commands (with credentials redacted), checksums, timestamps, comparison results, and operator identity in `restore-drill.txt`. Drop only the validated disposable restore database after evidence is recorded.

## Failure handling

Stop the procedure on a missing, empty, mismatched, or single-copy artifact; a failed `pg_restore --list`; any restore mismatch; or any unknown migration-ledger entry. Keep PostgreSQL running and report the failed gate to the operator. Do not begin import or alter runtime configuration.
