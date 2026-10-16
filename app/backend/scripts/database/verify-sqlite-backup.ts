/**
 * Verifies a SQLite backup produced by backup-sqlite.ts without modifying it.
 *
 * Usage: pnpm --filter @photobooth/backend db:verify-backup -- <backup-file> [--scratch-dir <dir>]
 * Prints a JSON summary on stdout and exits non-zero when any check fails.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { closeSqliteConnection, createSqliteConnection } from '../../src/db/sqlite/connection.js';
import {
  computeSqliteMigrationChecksum,
  findSqliteMigrationsDir,
} from '../../src/db/sqlite/migrations.js';
import {
  CHECKSUM_SUFFIX,
  UsageError,
  errorMessage,
  isDirectRun,
  parseArgs,
  parseChecksumLine,
  sha256File,
} from './backup-shared.js';

export type CheckName =
  'checksum' | 'integrity' | 'foreignKeys' | 'migrationLedger' | 'restoreDrill';

export interface VerifySummary {
  ok: boolean;
  file: string;
  sha256: string | null;
  checks: Record<CheckName, boolean>;
  migrations: string[];
  pendingMigrations: string[];
  tableCount: number | null;
  errors: string[];
}

export interface VerifyOptions {
  /** Parent directory for the disposable restore copy; defaults to the OS temp directory. */
  scratchDir?: string;
}

interface LedgerRow {
  id: string;
  checksum: string;
}

function userTableNames(db: Database.Database): string[] {
  const rows = db
    .prepare(
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all() as { name: string }[];
  return rows.map((row) => row.name);
}

function rowCounts(db: Database.Database, tables: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const table of tables) {
    // Table names come from sqlite_schema of the backup itself, quoted as identifiers.
    const row = db
      .prepare(`SELECT count(*) AS count FROM "${table.replace(/"/g, '""')}"`)
      .get() as { count: number };
    counts[table] = row.count;
  }
  return counts;
}

function verifyChecksum(file: string, summary: VerifySummary): void {
  const stat = fs.lstatSync(file);
  if (!stat.isFile()) throw new Error('Backup path is not a regular file.');
  if (stat.size === 0) throw new Error('Backup file is empty.');
  const expected = parseChecksumLine(fs.readFileSync(`${file}${CHECKSUM_SUFFIX}`, 'utf8'));
  if (expected.fileName !== path.basename(file)) {
    throw new Error('Checksum file names a different backup file.');
  }
  summary.sha256 = sha256File(file);
  if (summary.sha256 !== expected.sha256)
    throw new Error('Backup checksum does not match its .sha256 file.');
  summary.checks.checksum = true;
}

function verifyLedger(db: Database.Database, summary: VerifySummary): void {
  const hasLedger = db
    .prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'schema_migrations'")
    .get();
  if (!hasLedger) throw new Error('Migration ledger (schema_migrations) is missing.');
  const ledger = db
    .prepare('SELECT id, checksum FROM schema_migrations ORDER BY id')
    .all() as LedgerRow[];
  if (ledger.length === 0) throw new Error('Migration ledger is empty.');
  summary.migrations = ledger.map((row) => row.id);

  const directory = findSqliteMigrationsDir();
  const known = new Map(
    fs
      .readdirSync(directory)
      .filter((file) => file.endsWith('.sql'))
      .map((file) => [
        file,
        computeSqliteMigrationChecksum(fs.readFileSync(path.join(directory, file), 'utf8')),
      ]),
  );
  for (const row of ledger) {
    const checksum = known.get(row.id);
    if (checksum === undefined)
      throw new Error(`Migration ledger contains unknown migration "${row.id}".`);
    if (checksum !== row.checksum)
      throw new Error(`Migration ledger checksum mismatch for "${row.id}".`);
  }
  summary.pendingMigrations = [...known.keys()]
    .filter((id) => !summary.migrations.includes(id))
    .sort();
  summary.checks.migrationLedger = true;
}

async function verifyRestore(
  source: Database.Database,
  expectedCounts: Record<string, number>,
  options: VerifyOptions,
  summary: VerifySummary,
): Promise<void> {
  const scratch = fs.mkdtempSync(
    path.join(options.scratchDir ?? os.tmpdir(), 'photobooth-restore-drill-'),
  );
  try {
    const restored = path.join(scratch, 'restored.sqlite');
    await source.backup(restored);
    // Reopen exactly as the backend would, including WAL and foreign-key enforcement.
    const db = createSqliteConnection(restored);
    try {
      const integrity = db.pragma('quick_check', { simple: true });
      if (integrity !== 'ok') throw new Error('Restored copy failed quick_check.');
      const actualCounts = rowCounts(db, userTableNames(db));
      if (JSON.stringify(actualCounts) !== JSON.stringify(expectedCounts)) {
        throw new Error('Restored copy row counts differ from the backup.');
      }
    } finally {
      closeSqliteConnection(db);
    }
    summary.checks.restoreDrill = true;
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

export async function verifySqliteBackup(
  file: string,
  options: VerifyOptions = {},
): Promise<VerifySummary> {
  const summary: VerifySummary = {
    ok: false,
    file: path.resolve(file),
    sha256: null,
    checks: {
      checksum: false,
      integrity: false,
      foreignKeys: false,
      migrationLedger: false,
      restoreDrill: false,
    },
    migrations: [],
    pendingMigrations: [],
    tableCount: null,
    errors: [],
  };

  try {
    verifyChecksum(summary.file, summary);
    const db = new Database(summary.file, { readonly: true, fileMustExist: true });
    try {
      const integrity = db.pragma('integrity_check') as { integrity_check: string }[];
      if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') {
        throw new Error(`integrity_check reported ${integrity.length} problem row(s).`);
      }
      summary.checks.integrity = true;

      const violations = db.pragma('foreign_key_check') as unknown[];
      if (violations.length > 0)
        throw new Error(`foreign_key_check reported ${violations.length} violation(s).`);
      summary.checks.foreignKeys = true;

      verifyLedger(db, summary);
      const tables = userTableNames(db);
      summary.tableCount = tables.length;
      await verifyRestore(db, rowCounts(db, tables), options, summary);
    } finally {
      db.close();
    }
    // A read-only verification must leave the artifact byte-for-byte unchanged.
    if (sha256File(summary.file) !== summary.sha256)
      throw new Error('Backup changed during verification.');
  } catch (error) {
    summary.errors.push(errorMessage(error));
  }

  summary.ok = summary.errors.length === 0 && Object.values(summary.checks).every(Boolean);
  return summary;
}

async function main(): Promise<number> {
  try {
    const args = parseArgs(process.argv.slice(2), ['file', 'scratch-dir'], []);
    const file = args.values.get('file') ?? args.positionals[0];
    if (!file || args.positionals.length > (args.values.has('file') ? 0 : 1)) {
      throw new UsageError('Usage: verify-sqlite-backup.ts <backup-file> [--scratch-dir <dir>]');
    }
    const summary = await verifySqliteBackup(file, { scratchDir: args.values.get('scratch-dir') });
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return summary.ok ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${errorMessage(error)}\n`);
    return error instanceof UsageError ? 2 : 1;
  }
}

if (isDirectRun(import.meta.url)) {
  process.exitCode = await main();
}
