# PostgreSQL To SQLite Cutover Runbook

## Status

Pending. PostgreSQL remains the active production runtime until every pre-write gate below is recorded as passed.

This runbook is the operator procedure for Phase 5 of `plans/sqlite-local-database-migration-plan.md`. A human operator performs every step. No step may be automated against production without the operator present.

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
| Deployed backend commit (must include the cutover hold and worker gating) | TBD |
| `legacy-postgres-cutover` tag commit and retained artifact location | TBD |
| SQLite database directory (`<SQLITE_DIR>`) | TBD |

The commands below use these placeholders. Replace each with the recorded value; never paste credentials into a transcript or this file.

| Placeholder | Meaning |
| --- | --- |
| `<STOP_CMD>` / `<START_CMD>` | Recorded stop/start commands for Fastify and both workers |
| `<ENV_FILE>` | Recorded environment or secret source for the backend |
| `<BACKUP_DIR>` | `/var/backups/sic-photobooth/postgresql/<UTC-timestamp>/` created for the final dump |
| `<SQLITE_DIR>` | Directory that holds versioned SQLite files |
| `<CANDIDATE>` | `<SQLITE_DIR>/photobooth-<UTC-timestamp>.sqlite`, a new file that never existed before |
| `<BACKEND_URL>` | Local backend base URL, for example `http://127.0.0.1:<PORT>` |

## Cutover hold

The backend supports a validation hold controlled by `DATABASE_CUTOVER_HOLD` (accepted values `1`, `true`, `0`, `false`; any other value refuses to start).

While `DATABASE_CUTOVER_HOLD=1`:

- every non-`GET`/`HEAD`/`OPTIONS` request returns `503` with error code `MAINTENANCE_HOLD`;
- `/health` and read-only routes keep working;
- the publishing and print workers must not start. Confirm this in the backend log before trusting the hold; if the deployed build does not log that the workers were skipped, stop and treat the hold as unavailable.

Known caveat: `GET /api/frames` seeds default frames when the database has no flipbook templates and no frames. Do not call it during validation unless the candidate already contains templates or frames.

## Pre-write rollback window

Every step in this section is reversible: PostgreSQL is untouched and remains the write authority. Any failure stops the procedure and goes to [Pre-write rollback](#pre-write-rollback).

### 1. Maintenance window and booth closure

1. Schedule the window with the service owner. Record the start time (UTC) in the sign-off table.
2. Close the booth to guests and operators. Confirm no capture, print, or publication is in progress.
3. Confirm the free space on the storage volume is at least three times the current PostgreSQL database size plus the media manifest size.

### 2. Stop Fastify and both workers

1. Run `<STOP_CMD>`. The publishing and print workers run inside the Fastify process, so stopping the service stops both.
2. Confirm no backend process remains (for example, the process manager reports the unit stopped and no `node dist/server.js` process is running for the service owner).

### 3. Prove no application database connections remain

Run as the service owner without printing the connection string:

```sh
psql "$DATABASE_URL" -X -A -c "
  SELECT pid, usename, application_name, client_addr, state, backend_start
  FROM pg_stat_activity
  WHERE datname = current_database()
    AND backend_type = 'client backend'
    AND pid <> pg_backend_pid();"
```

The result must contain zero rows. Any remaining application connection blocks the cutover; find and stop its owner, then repeat. Do not terminate sessions you cannot attribute.

### 4. Final PostgreSQL dump and manifest

Follow `docs/runbooks/database-backup-and-restore.md` in full to create `<BACKUP_DIR>`: the custom-format dump, checksum, `pg_restore --list`, inventory, storage manifest, restore drill, and verified second copy. PostgreSQL stays running and untouched; do not drop, rename, or alter it.

Record the dump checksum and backup location in the sign-off table.

### 5. Import into a new versioned SQLite file

1. Choose `<CANDIDATE>` with a fresh UTC timestamp. It must not already exist, and it must not be the path currently set in `SQLITE_DATABASE_PATH`.
2. Run the importer from the repository root against the PostgreSQL database restored from the final dump in step 4:

   ```sh
   umask 077
   pnpm --filter @photobooth/backend db:import-legacy <importer arguments per app/backend/scripts/database/README.md>
   ```

3. Run the parity gate and save its report beside the backup set:

   ```sh
   pnpm --filter @photobooth/backend db:validate-parity <parity arguments per app/backend/scripts/database/README.md> \
     > <BACKUP_DIR>/sqlite-parity-report.json
   ```

4. Any importer error or parity mismatch stops the cutover. Do not edit the candidate by hand; delete it and start again from a new versioned file.

### 6. Validate the candidate offline

With the backend still stopped:

```sh
umask 077
pnpm --silent --filter @photobooth/backend db:validate-cutover -- \
  --candidate <CANDIDATE> \
  --parity-report <BACKUP_DIR>/sqlite-parity-report.json \
  > <BACKUP_DIR>/cutover-validation-offline.json
echo "exit=$?"
```

The exit code must be `0` and `"passed": true`. The validator opens the file read-only and checks `PRAGMA integrity_check`, `PRAGMA foreign_key_check`, the `schema_migrations` ledger against the shipped SQLite migration checksums, the expected tables and indexes, and the per-table counts in the parity report. It may leave empty `-wal`/`-shm` sidecars beside the file; that is expected.

Record `candidate.sha256` from the output as the SQLite candidate checksum. Then run `sha256sum <CANDIDATE>` and confirm it matches.

### 7. Start the backend on the candidate with the hold active

1. Back up `<ENV_FILE>` to `<ENV_FILE>.pre-sqlite-<UTC-timestamp>` with the same ownership and mode.
2. Write the new configuration to a temporary file in the same directory, then rename it over `<ENV_FILE>` so the switch is atomic:

   ```text
   LOCAL_DATABASE_ENGINE=sqlite
   SQLITE_DATABASE_PATH=<CANDIDATE>
   DATABASE_CUTOVER_HOLD=1
   ```

   Keep every other existing setting unchanged.
3. Run `<START_CMD>`. Start exactly one Fastify process.
4. In the backend log, confirm the cutover hold warning, that the SQLite migrations applied without error, and that the publishing and print workers did not start.

### 8. Read-only verification with the hold active

1. `curl -fsS <BACKEND_URL>/health` returns `200` with the database reported as connected.
2. A mutation is rejected: `curl -s -o /dev/null -w '%{http_code}\n' -X POST <BACKEND_URL>/api/events` prints `503`.
3. Read-only checks match the parity report: `GET /api/events`, `GET /templates`, `GET /api/publications`, `GET /api/print-jobs`, and `GET /api/admin/analytics` return the expected data.
4. Local QR retrieval: for at least three representative public IDs from the inventory, `GET /photos/<id>/info` and `GET /photos/<id>` succeed from the captive website.
5. The packaged booth app starts and renders against the backend.
6. Rerun the validator against the live candidate (read-only, safe beside the running backend) and save the result as `<BACKUP_DIR>/cutover-validation-held.json`. It must pass. Its `checksumCoversAllData` may be `false` while the backend holds the file open; that is expected.

Record the parity-report location, both validator results, and operator sign-off in the sign-off table before continuing.

### Pre-write rollback

Allowed only while the hold is still active and no mutation route or worker has accepted SQLite work.

1. Run `<STOP_CMD>`.
2. Restore `<ENV_FILE>` from `<ENV_FILE>.pre-sqlite-<UTC-timestamp>` (PostgreSQL engine, no hold). If the failure was in the deployed build, redeploy the retained `legacy-postgres-cutover` artifact.
3. Run `<START_CMD>`, confirm `/health` reports PostgreSQL connected, and reopen the booth.
4. Keep the failed candidate and its reports for diagnosis; never reuse it for a later attempt.
5. Record the rollback time, reason, and operator in the sign-off table.

## Cutover and rollback closure

### 9. Remove the hold (rollback boundary)

This step closes the PostgreSQL rollback window. Perform it only after every check above is recorded as passed and the operator explicitly approves.

1. Write a temporary env file identical to the current one except `DATABASE_CUTOVER_HOLD=0` (or the line removed), then rename it over `<ENV_FILE>`. `LOCAL_DATABASE_ENGINE` and `SQLITE_DATABASE_PATH` must not change.
2. Run `<STOP_CMD>`, then `<START_CMD>`. Confirm exactly one Fastify process is running.
3. Confirm in the log that the hold warning is absent and both workers started.
4. Record the hold release time (UTC) and the rollback-window closure time (UTC) in the sign-off table. They are the moment mutation routes or either worker can accept SQLite-backed production work.
5. Reopen the booth.

After this point PostgreSQL is stale. Do not reconnect the booth to PostgreSQL. Any incident closes the booth and uses SQLite restore or repair-forward procedures. A reverse migration requires separate approval.

## First-event monitoring

Through the first event after cutover:

- Run exactly one Fastify process; never start a second backend against the same file.
- Watch `/health`, SQLite `SQLITE_BUSY`/`database is locked` errors in the backend log, publication and print queue states, print reconciliation, available disk space on the storage volume, and backup completion.
- Never replace, move, or copy the live database file while Fastify or a worker is running. Use the SQLite backup procedure (online backup API or `VACUUM INTO`) only.
- Record any incident, its time, and the response in the sign-off table notes.

## Sign-off record

| Evidence | Value |
| --- | --- |
| Maintenance window start (UTC) | TBD |
| Backend and workers stopped (UTC) | TBD |
| `pg_stat_activity` zero-connection check (UTC) | TBD |
| Final PostgreSQL backup location | TBD |
| Final PostgreSQL backup checksum | TBD |
| Second-copy verification | TBD |
| SQLite candidate file name | TBD |
| SQLite candidate checksum | TBD |
| Parity report | TBD |
| Offline validator result | TBD |
| Held validator result and read-only checks | TBD |
| Pre-write rollback performed (time, reason) | TBD |
| Validation hold release time (UTC) | TBD |
| Rollback-window closure time (UTC) | TBD |
| First-event monitoring outcome | TBD |
| Operator sign-off | TBD |
| Service owner sign-off | TBD |
