import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { backupSqlite, pruneBackups } from '../scripts/database/backup-sqlite.js';
import { verifySqliteBackup } from '../scripts/database/verify-sqlite-backup.js';
import { backupFileName, checksumLine, sha256File } from '../scripts/database/backup-shared.js';
import {
  closeSqliteConnection,
  createSqliteConnection,
  type SqliteDatabase,
} from '../src/db/sqlite/connection.js';
import { runSqliteMigrations } from '../src/db/sqlite/migrations.js';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporaryDirectories: string[] = [];
const openConnections: SqliteDatabase[] = [];

function temporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'photobooth-backup-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

/** A migrated WAL database with an open writer whose rows are still only in the WAL. */
function liveDatabase(): { source: string; root: string; db: SqliteDatabase } {
  const root = temporaryDirectory();
  const source = path.join(root, 'database', 'photobooth.sqlite');
  const db = createSqliteConnection(source);
  openConnections.push(db);
  runSqliteMigrations(db);
  db.pragma('wal_autocheckpoint = 0');
  db.prepare(
    "INSERT INTO events (id, name, date, operator_name, created_at) VALUES ('event-1', 'Launch', '2026-10-16', 'Operator', '2026-10-16T00:00:00.000Z')",
  ).run();
  return { source, root, db };
}

function modeOf(target: string): number {
  return fs.statSync(target).mode & 0o777;
}

afterEach(() => {
  for (const db of openConnections.splice(0)) if (db.open) closeSqliteConnection(db);
  for (const directory of temporaryDirectories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

describe('SQLite backup', () => {
  it('captures WAL-resident rows into a private, checksummed, verified backup', async () => {
    const { source, root } = liveDatabase();
    expect(fs.statSync(`${source}-wal`).size).toBeGreaterThan(0);
    const destinationDir = path.join(root, 'backups');

    const summary = await backupSqlite({ source, destinationDir, scratchDir: root });

    expect(summary.errors).toEqual([]);
    expect(summary.ok).toBe(true);
    expect(summary.verification?.ok).toBe(true);
    const backup = summary.backup as string;
    expect(path.basename(backup)).toMatch(
      /^photobooth-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.sqlite$/,
    );
    expect(modeOf(destinationDir)).toBe(0o700);
    expect(modeOf(backup)).toBe(0o600);
    expect(modeOf(`${backup}.sha256`)).toBe(0o600);
    expect(fs.readFileSync(`${backup}.sha256`, 'utf8')).toBe(
      checksumLine(sha256File(backup), backup),
    );
    // Only the backup and its checksum remain: no partial files or WAL sidecars.
    expect(fs.readdirSync(destinationDir).sort()).toEqual([
      path.basename(backup),
      `${path.basename(backup)}.sha256`,
    ]);

    const copy = new Database(backup, { readonly: true });
    try {
      expect(copy.pragma('journal_mode', { simple: true })).toBe('delete');
      expect(copy.prepare('SELECT id FROM events').all()).toEqual([{ id: 'event-1' }]);
    } finally {
      copy.close();
    }
  });

  it('refuses a destination inside the live database directory unless allowed', async () => {
    const { source, root } = liveDatabase();
    const inside = path.join(path.dirname(source), 'backups');

    const refused = await backupSqlite({ source, destinationDir: inside, scratchDir: root });
    expect(refused.ok).toBe(false);
    expect(refused.errors[0]).toMatch(/inside the live database directory/);
    expect(fs.existsSync(inside)).toBe(false);

    const allowed = await backupSqlite({
      source,
      destinationDir: inside,
      allowDatabaseDirectory: true,
      scratchDir: root,
    });
    expect(allowed.ok).toBe(true);
  });

  it('backs up a stopped database whose WAL sidecars were removed on shutdown', async () => {
    const { source, root, db } = liveDatabase();
    closeSqliteConnection(db);
    expect(fs.existsSync(`${source}-shm`)).toBe(false);

    const summary = await backupSqlite({
      source,
      destinationDir: path.join(root, 'backups'),
      scratchDir: root,
    });

    expect(summary.errors).toEqual([]);
    expect(summary.ok).toBe(true);
  });

  it('refuses to overwrite an existing backup or use a group-readable directory', async () => {
    const { source, root } = liveDatabase();
    const destinationDir = path.join(root, 'backups');
    const now = new Date('2026-10-16T12:00:00.000Z');

    expect((await backupSqlite({ source, destinationDir, now, scratchDir: root })).ok).toBe(true);
    const before = sha256File(path.join(destinationDir, backupFileName(now)));
    const second = await backupSqlite({ source, destinationDir, now, scratchDir: root });
    expect(second.ok).toBe(false);
    expect(second.errors[0]).toMatch(/Refusing to overwrite/);
    expect(sha256File(path.join(destinationDir, backupFileName(now)))).toBe(before);

    const loose = path.join(root, 'loose');
    fs.mkdirSync(loose, { mode: 0o755 });
    fs.chmodSync(loose, 0o755);
    const looseResult = await backupSqlite({ source, destinationDir: loose, scratchDir: root });
    expect(looseResult.errors[0]).toMatch(/group\/other/);
  });

  it('prunes only its own oldest backups after a verified new backup', async () => {
    const { source, root } = liveDatabase();
    const destinationDir = path.join(root, 'backups');
    const times = ['2026-10-14', '2026-10-15', '2026-10-16'].map(
      (day) => new Date(`${day}T00:00:00.000Z`),
    );
    for (const now of times.slice(0, 2)) {
      expect((await backupSqlite({ source, destinationDir, now, scratchDir: root })).ok).toBe(true);
    }
    const unrelated = [
      'notes.txt',
      'photobooth-manual.sqlite',
      'photobooth-2026-10-01T00-00-00-000Z.sqlite.bak',
    ];
    for (const name of unrelated) fs.writeFileSync(path.join(destinationDir, name), 'keep me');

    const summary = await backupSqlite({
      source,
      destinationDir,
      now: times[2],
      keep: 2,
      scratchDir: root,
    });

    expect(summary.ok).toBe(true);
    expect(summary.pruned).toEqual([path.join(destinationDir, backupFileName(times[0]))]);
    const remaining = fs.readdirSync(destinationDir);
    expect(remaining).not.toContain(backupFileName(times[0]));
    expect(remaining).not.toContain(`${backupFileName(times[0])}.sha256`);
    for (const name of [...unrelated, backupFileName(times[1]), backupFileName(times[2])]) {
      expect(remaining).toContain(name);
    }
    expect(pruneBackups(destinationDir, 2)).toEqual([]);
  });

  it('rejects an invalid retention count without writing anything', async () => {
    const { source, root } = liveDatabase();
    const summary = await backupSqlite({
      source,
      destinationDir: path.join(root, 'backups'),
      keep: 0,
    });
    expect(summary.ok).toBe(false);
    expect(fs.existsSync(path.join(root, 'backups'))).toBe(false);
  });
});

describe('SQLite backup verification', () => {
  async function freshBackup(): Promise<{ backup: string; root: string }> {
    const { source, root } = liveDatabase();
    const summary = await backupSqlite({
      source,
      destinationDir: path.join(root, 'backups'),
      scratchDir: root,
    });
    expect(summary.ok).toBe(true);
    return { backup: summary.backup as string, root };
  }

  /** Writes an arbitrary database plus a matching checksum, bypassing the backup tool. */
  function handMadeBackup(root: string, build: (db: Database.Database) => void): string {
    const file = path.join(root, 'hand-made.sqlite');
    const db = new Database(file);
    build(db);
    db.close();
    fs.writeFileSync(`${file}.sha256`, checksumLine(sha256File(file), file));
    return file;
  }

  it('cleans up its disposable restore directory', async () => {
    const { backup, root } = await freshBackup();
    const scratch = path.join(root, 'scratch');
    fs.mkdirSync(scratch);

    const summary = await verifySqliteBackup(backup, { scratchDir: scratch });

    expect(summary.ok).toBe(true);
    expect(summary.migrations).toEqual(['001_current_schema.sql']);
    expect(fs.readdirSync(scratch)).toEqual([]);
  });

  it('fails a tampered backup on checksum', async () => {
    const { backup, root } = await freshBackup();
    fs.appendFileSync(backup, Buffer.from([0]));
    const summary = await verifySqliteBackup(backup, { scratchDir: root });
    expect(summary.ok).toBe(false);
    expect(summary.checks.checksum).toBe(false);
  });

  it('fails a backup with a missing checksum file', async () => {
    const { backup, root } = await freshBackup();
    fs.rmSync(`${backup}.sha256`);
    const summary = await verifySqliteBackup(backup, { scratchDir: root });
    expect(summary.ok).toBe(false);
  });

  it('fails a database without a migration ledger', async () => {
    const root = temporaryDirectory();
    const file = handMadeBackup(root, (db) =>
      db.exec('CREATE TABLE example (id INTEGER PRIMARY KEY)'),
    );
    const summary = await verifySqliteBackup(file, { scratchDir: root });
    expect(summary.ok).toBe(false);
    expect(summary.checks.integrity).toBe(true);
    expect(summary.checks.migrationLedger).toBe(false);
    expect(summary.errors[0]).toMatch(/schema_migrations/);
  });

  it('fails a database with foreign-key violations', async () => {
    const root = temporaryDirectory();
    const file = handMadeBackup(root, (db) => {
      db.exec(
        'CREATE TABLE parent (id INTEGER PRIMARY KEY); CREATE TABLE child (parent_id INTEGER REFERENCES parent(id))',
      );
      // better-sqlite3 enforces foreign keys by default; disable it to plant an orphan.
      db.pragma('foreign_keys = OFF');
      db.exec('INSERT INTO child (parent_id) VALUES (42)');
    });
    const summary = await verifySqliteBackup(file, { scratchDir: root });
    expect(summary.ok).toBe(false);
    expect(summary.checks.foreignKeys).toBe(false);
  });
});

describe('SQLite backup CLIs', () => {
  const tsx = path.join(backendRoot, 'node_modules', '.bin', 'tsx');
  function run(script: string, args: string[]) {
    const result = spawnSync(
      tsx,
      [path.join(backendRoot, 'scripts', 'database', script), ...args],
      {
        cwd: backendRoot,
        encoding: 'utf8',
        env: { ...process.env, SQLITE_BACKUP_DIR: '' },
      },
    );
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  }

  it('backs up, verifies, and reports failures through exit codes and JSON', () => {
    const { source, root } = liveDatabase();
    const destinationDir = path.join(root, 'backups');

    const backup = run('backup-sqlite.ts', [
      '--source',
      source,
      '--dest',
      destinationDir,
      '--scratch-dir',
      root,
    ]);
    expect(backup.status).toBe(0);
    const backupSummary = JSON.parse(backup.stdout) as { ok: boolean; backup: string };
    expect(backupSummary.ok).toBe(true);

    const verified = run('verify-sqlite-backup.ts', [backupSummary.backup, '--scratch-dir', root]);
    expect(verified.status).toBe(0);
    expect(JSON.parse(verified.stdout)).toMatchObject({ ok: true });

    fs.appendFileSync(backupSummary.backup, Buffer.from([0]));
    const tampered = run('verify-sqlite-backup.ts', [backupSummary.backup, '--scratch-dir', root]);
    expect(tampered.status).toBe(1);
    expect(JSON.parse(tampered.stdout)).toMatchObject({ ok: false, checks: { checksum: false } });

    expect(run('backup-sqlite.ts', ['--source', source]).status).toBe(2);
    expect(
      run('backup-sqlite.ts', ['--source', source, '--dest', destinationDir, '--keep', 'x']).status,
    ).toBe(2);
  }, 30_000);
});
