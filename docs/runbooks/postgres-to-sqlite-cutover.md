# PostgreSQL To SQLite Cutover Runbook

## Status

Pending. PostgreSQL remains the active production runtime until every pre-write gate below is recorded as passed.

## Required local deployment facts

Populate this section before scheduling a cutover. Do not put credentials in this file.

| Item | Recorded value |
| --- | --- |
| Process manager and service name | TBD |
| Service owner | TBD |
| Backend launch command | TBD |
| Environment or secret source | TBD |
| Backend log location | TBD |
| Stop command | TBD |
| Start command | TBD |
| PostgreSQL server/client versions | TBD |
| PostgreSQL migration ledger verified | TBD |
| Storage root and free space | TBD |

## Pre-write rollback window

1. Schedule maintenance and close the booth to all writes.
2. Stop Fastify and both workers using the recorded commands. Prove no application database connections remain.
3. Create and protect a final PostgreSQL dump and storage manifest using the backup-and-restore runbook. PostgreSQL remains untouched.
4. Restore/revalidate the dump, import it into a new versioned non-production SQLite candidate, and run the full parity report.
5. Run SQLite migrations, integrity checks, foreign-key checks, health checks, read-only API checks, local QR retrieval, and packaged-app startup with mutation routes and workers held disabled.
6. Record candidate file checksum, parity-report location, validation results, and operator sign-off.

Any failure during these steps restores the retained PostgreSQL engine configuration and artifact while the booth is still closed.

## Cutover and rollback closure

Atomically configure `LOCAL_DATABASE_ENGINE=sqlite` and `SQLITE_DATABASE_PATH` to the validated versioned candidate. Keep the write hold enabled until the backend is healthy and all read-only checks pass. Remove the hold only by explicit operator action.

The moment mutation routes or either worker accepts SQLite-backed production work, record the timestamp here and mark the PostgreSQL rollback window closed. Do not reconnect the booth to stale PostgreSQL after this point; close the booth and use SQLite restore or repair-forward procedures.

## First-event monitoring

Start exactly one Fastify process. Monitor health, SQLite busy/locked errors, queue states, print reconciliation, available disk space, and backup completion. Never replace the database file while Fastify or a worker is active.

| Evidence | Value |
| --- | --- |
| Final PostgreSQL backup checksum | TBD |
| SQLite candidate checksum | TBD |
| Parity report | TBD |
| Validation hold release time (UTC) | TBD |
| Rollback-window closure time (UTC) | TBD |
| Operator sign-off | TBD |
