# SQLite Backup And Restore Runbook

## Scope and safety

Use this runbook once SQLite is the production local database (after the Phase 5 cutover in `docs/runbooks/postgres-to-sqlite-cutover.md`). Until then, `docs/runbooks/database-backup-and-restore.md` governs the PostgreSQL backup.

- Never copy the live database file with `cp`, `rsync`, or a filesystem snapshot tool while the backend runs. The database uses WAL mode; recent commits may live only in `photobooth.sqlite-wal`. Use `db:backup`, which uses SQLite's online backup API.
- Never swap, move, or delete database files while the backend or either worker (publishing, print) is running.
- Run every command as the backend service-owner account recorded in the cutover runbook, so the backup can read the database and its `-shm` file and the files it writes are owned correctly.
- Do not paste database contents into tickets or chat. The JSON summaries contain paths, checksums, migration IDs, and counts only.

Values in `<angle brackets>` are placeholders. Replace them with the recorded production facts; do not guess.

| Placeholder         | Meaning                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| `<service-user>`    | Account that runs the backend                                                                       |
| `<repo>`            | Deployed repository checkout, e.g. the directory containing `app/backend`                           |
| `<db-path>`         | Value of `SQLITE_DATABASE_PATH`                                                                     |
| `<backup-dir>`      | Primary backup directory, on a different directory from `<db-path>` and preferably a different disk |
| `<second-copy>`     | Second failure domain: protected second disk or encrypted operator-approved destination             |
| `<backend-service>` | Process-manager unit or command that runs Fastify and its workers                                   |

## Tools

Both commands run from `<repo>` and print a JSON summary on stdout. Exit code `0` means success, `1` means a failed backup or check, `2` means invalid usage. Pass absolute paths: `pnpm --filter` runs scripts with `app/backend` as the working directory.

```sh
# Create a backup (source defaults to SQLITE_DATABASE_PATH from the backend environment).
pnpm --filter @photobooth/backend db:backup -- --dest <backup-dir> [--source <db-path>] [--keep <n>]

# Verify an existing backup.
pnpm --filter @photobooth/backend db:verify-backup -- <backup-dir>/photobooth-<timestamp>.sqlite
```

`--dest` may instead come from `SQLITE_BACKUP_DIR`. Optional flags: `--scratch-dir <dir>` chooses where the disposable restore drill runs (default: the OS temp directory); `--allow-database-directory` permits a destination inside the database's own directory and should not be used in production.

### What `db:backup` guarantees

1. Opens the source read-only and copies it with the online backup API, producing a consistent snapshot even while the backend writes.
2. Refuses a destination inside the live database's directory (unless explicitly allowed), refuses a destination directory that is group/other-accessible, and creates a missing destination with mode `0700`.
3. Checks the destination has at least twice the database-plus-WAL size free.
4. Converts the copy to a self-contained rollback-journal file (no `-wal`/`-shm` needed), sets mode `0600`, fsyncs it, and publishes it as `photobooth-<UTC timestamp>.sqlite` without ever overwriting an existing file. It writes `photobooth-<UTC timestamp>.sqlite.sha256` (mode `0600`, `sha256sum --check` format).
5. Runs the full verification below on the new backup. With `--keep <n>`, and only if verification passed, deletes the oldest backups beyond `n` and their `.sha256` files. Pruning only touches files matching `photobooth-YYYY-MM-DDTHH-MM-SS-mmmZ.sqlite`; anything else in the directory is left alone.

### What `db:verify-backup` checks

1. The file is a non-empty regular file and its SHA-256 matches the `.sha256` file beside it.
2. Opens it read-only: `PRAGMA integrity_check` returns `ok` and `PRAGMA foreign_key_check` returns no rows.
3. The `schema_migrations` ledger exists, is non-empty, and every entry matches a repository migration by filename and checksum. Repository migrations missing from the ledger are reported as `pendingMigrations` (the backend applies them on start) and do not fail verification.
4. Restores the backup to a disposable temporary directory, reopens it with the backend's production pragmas (WAL, foreign keys, full sync), compares per-table row counts, and deletes the temporary directory.
5. Confirms the backup file was not modified by verification.

## Scheduling

The schedule below is an example only. The operations owner chooses the interval, which is the maximum data-loss window: anything written after the last good backup is lost on restore. Install it only through the approved change process; this repository does not install timers.

Example systemd units (`/etc/systemd/system/photobooth-sqlite-backup.service` and `.timer`):

```ini
[Unit]
Description=SIC photobooth SQLite backup

[Service]
Type=oneshot
User=<service-user>
WorkingDirectory=<repo>
EnvironmentFile=<backend-environment-file>
UMask=0077
ExecStart=/usr/bin/env pnpm --filter @photobooth/backend db:backup -- --dest <backup-dir> --keep <n>
```

```ini
[Unit]
Description=Run the SIC photobooth SQLite backup <interval>

[Timer]
OnCalendar=<calendar-expression>
Persistent=true

[Install]
WantedBy=timers.target
```

Equivalent cron entry for `<service-user>` (`crontab -e`), if the host does not use systemd:

```cron
<cron-schedule> cd <repo> && umask 077 && pnpm --filter @photobooth/backend db:backup -- --dest <backup-dir> --keep <n> >> <log-file> 2>&1
```

Alert on a non-zero exit (systemd `OnFailure=` unit or cron mail to `<alert-recipient>`) and on a missing backup: if the newest file in `<backup-dir>` is older than `<max-backup-age>`, page the backup owner. A failed run never prunes older backups.

The scripts run through `tsx`, a backend dev dependency. If production installs omit dev dependencies, record the supported invocation here before scheduling: `<production-invocation>`.

## Retention

- Local: `--keep <n>` keeps the newest `<n>` verified backups in `<backup-dir>`. Choose `<n>` from the interval and the event calendar so at least one backup from before the most recent event survives: `<local-retention-policy>`.
- Second copy: retain `<offsite-retention-policy>` in `<second-copy>`.
- Event archives: before deleting an event's media, keep at least one verified backup that contains it until `<event-archive-retention>`.
- Never prune by hand with a wildcard that could match other files. Delete a backup and its `.sha256` together.

## Second copy, encryption, and transport

A single local copy is not a backup. After each successful run (or at least `<copy-interval>`):

1. Copy the newest backup and its `.sha256` file together to `<second-copy>`, preserving mode `0600` and a `0700` parent directory.
2. If `<second-copy>` is not a protected disk under the operator's physical control, encrypt before transport with the operator-approved tool (`<encryption-tool-and-key-owner>`). Store keys separately from the backups; a backup whose key is lost is lost.
3. At the destination, verify with `sha256sum --check photobooth-<timestamp>.sqlite.sha256` (after decrypting, if encrypted). Periodically run `db:verify-backup` against the second copy as well (`<offsite-drill-interval>`).
4. Record the copy time and verification result in `<backup-log-location>`.

## Free-space monitoring

Alert `<alert-recipient>` when any of these fall below their thresholds:

- the filesystem holding `<db-path>`: `<db-free-threshold>` (SQLite needs free space for WAL growth and checkpoints; a full disk stops booth writes);
- the filesystem holding `<backup-dir>`: `<backup-free-threshold>`, and always more than twice the current database size (the backup script refuses to start otherwise);
- `<second-copy>`: `<second-copy-free-threshold>`.

Check with `df -h <db-path> <backup-dir>` and `du -h <db-path>*`. An unusually large `-wal` file while the backend runs means checkpoints are not completing; investigate before it fills the disk.

## Restore procedure

Restore is repair-forward. After SQLite accepted production writes, do not reconnect the backend to the legacy PostgreSQL database; it is stale.

1. **Close the booth.** Tell operators to stop guest sessions.
2. **Stop the backend.** Stop `<backend-service>`, including Fastify and the publishing and print workers. Confirm nothing holds the database open: `fuser -v <db-path> <db-path>-wal <db-path>-shm` (or `lsof`) must report no process. Do not continue while any process holds these files.
3. **Choose and verify a backup.** Pick the newest backup that passes `db:verify-backup` and record its JSON summary. If the local copy fails, fetch from `<second-copy>`, verify its checksum, then run `db:verify-backup` on it.
4. **Preserve the current state.** Create `<incident-dir>` (mode `0700`) and move the current database together with its `-wal` and `-shm` files into it. Move all three as a set; never delete a `-wal` file on its own. A leftover `-wal` or `-shm` beside a restored database can be replayed into the wrong file and corrupt it.
5. **Place the restored file.** Copy the verified backup to `<db-path>` (or to a new versioned filename and update `SQLITE_DATABASE_PATH` to it), owned by `<service-user>` with mode `0600`. Confirm no `<db-path>-wal`, `<db-path>-shm`, or `<db-path>-journal` exists. Confirm the placed file's SHA-256 equals the value in the backup's `.sha256` file.
6. **Start once and check.** Start exactly one backend process. Pending migrations, if any, apply on start. Check the health endpoint, then read-only checks: events and templates list, a recent session continues, and local QR retrieval resolves a known output.
7. **Reconcile the loss window.** Anything recorded after the backup timestamp is gone from the database, but captured and generated media written to storage after that time may still exist on disk. Record the window and the affected events. Do not delete orphaned media; preserve it for the recovery owner. Check publication and print queues for jobs that had completed after the backup and may now be retried or appear unprinted; reconcile print counts with the operator before reopening.
8. **Reopen and record.** Reopen the booth only after the recovery owner signs off. Record the incident, chosen backup, checksum, verification output, loss window, and reconciliation in `<incident-log-location>`.

If no backup verifies, keep the backend stopped, keep the preserved files untouched, and escalate to the recovery owner. Do not run repair tools against the only copy; work on a copy inside `<incident-dir>`.

## Ownership

| Responsibility                                                              | Owner                 |
| --------------------------------------------------------------------------- | --------------------- |
| Backup schedule and alerts                                                  | `<backup-owner>`      |
| Second copy and encryption keys                                             | `<second-copy-owner>` |
| Restore decision and sign-off                                               | `<recovery-owner>`    |
| Booth closure and operator communication                                    | `<operations-owner>`  |
| Restore drill (verify a backup on a spare machine) every `<drill-interval>` | `<drill-owner>`       |
