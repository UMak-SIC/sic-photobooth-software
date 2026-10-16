/**
 * Creates a WAL-safe, checksummed SQLite backup with SQLite's online backup API.
 *
 * Usage: pnpm --filter @photobooth/backend db:backup -- --dest <dir> [--source <db>] [--keep <n>]
 *          [--allow-database-directory]
 * The source defaults to SQLITE_DATABASE_PATH. Prints a JSON summary on stdout and
 * exits non-zero on failure. Retention pruning runs only after the new backup verifies.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  BACKUP_FILE_PATTERN,
  CHECKSUM_SUFFIX,
  PRIVATE_DIRECTORY_MODE,
  PRIVATE_FILE_MODE,
  UsageError,
  backupFileName,
  checksumLine,
  errorMessage,
  fsyncPath,
  isDirectRun,
  parseArgs,
  sha256File,
} from './backup-shared.js';
import { verifySqliteBackup, type VerifySummary } from './verify-sqlite-backup.js';

export interface BackupOptions {
  source: string;
  destinationDir: string;
  /** Keep only the newest n backups created by this tool in the destination. */
  keep?: number;
  /** Permits a destination inside the live database's directory (not recommended). */
  allowDatabaseDirectory?: boolean;
  now?: Date;
  /** Parent directory for the verification restore drill. */
  scratchDir?: string;
}

export interface BackupSummary {
  ok: boolean;
  source: string;
  backup: string | null;
  checksumFile: string | null;
  sha256: string | null;
  bytes: number | null;
  verification: VerifySummary | null;
  pruned: string[];
  errors: string[];
}

/** Resolves symlinks for the longest existing prefix so containment checks cannot be bypassed. */
function realpathAllowingMissing(target: string): string {
  const resolved = path.resolve(target);
  const missing: string[] = [];
  let current = resolved;
  while (!fs.existsSync(current)) {
    missing.unshift(path.basename(current));
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.join(fs.realpathSync(current), ...missing);
}

function isSameOrInside(candidate: string, directory: string): boolean {
  const relative = path.relative(directory, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function prepareDestination(options: BackupOptions, sourceReal: string): string {
  const destination = realpathAllowingMissing(options.destinationDir);
  if (!options.allowDatabaseDirectory && isSameOrInside(destination, path.dirname(sourceReal))) {
    throw new Error(
      'Destination is inside the live database directory; use a separate protected location or pass --allow-database-directory.',
    );
  }
  if (fs.existsSync(destination)) {
    const stat = fs.statSync(destination);
    if (!stat.isDirectory()) throw new Error('Destination exists and is not a directory.');
    if ((stat.mode & 0o077) !== 0) {
      throw new Error(
        'Destination directory is accessible by group/other; restrict it to mode 0700 first.',
      );
    }
  } else {
    fs.mkdirSync(destination, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
    fs.chmodSync(destination, PRIVATE_DIRECTORY_MODE);
  }
  return destination;
}

function assertFreeSpace(destination: string, sourceReal: string): void {
  const walPath = `${sourceReal}-wal`;
  const needed =
    fs.statSync(sourceReal).size + (fs.existsSync(walPath) ? fs.statSync(walPath).size : 0);
  const stats = fs.statfsSync(destination);
  // Require headroom for the copy plus the transient journal-mode rewrite.
  if (stats.bavail * stats.bsize < needed * 2) {
    throw new Error(`Insufficient free space in destination: need at least ${needed * 2} bytes.`);
  }
}

/** Removes the oldest tool-created backups beyond `keep`; never touches other files. */
export function pruneBackups(destinationDir: string, keep: number): string[] {
  const backups = fs
    .readdirSync(destinationDir)
    .filter((name) => BACKUP_FILE_PATTERN.test(name))
    .filter((name) => fs.lstatSync(path.join(destinationDir, name)).isFile())
    .sort()
    .reverse();
  const removed: string[] = [];
  for (const name of backups.slice(keep)) {
    const file = path.join(destinationDir, name);
    fs.rmSync(`${file}${CHECKSUM_SUFFIX}`, { force: true });
    fs.rmSync(file);
    removed.push(file);
  }
  return removed;
}

async function writeBackup(
  sourceReal: string,
  destination: string,
  now: Date,
): Promise<{ file: string; sha256: string }> {
  const finalPath = path.join(destination, backupFileName(now));
  const checksumPath = `${finalPath}${CHECKSUM_SUFFIX}`;
  if (fs.existsSync(finalPath) || fs.existsSync(checksumPath)) {
    throw new Error(`Refusing to overwrite existing backup ${path.basename(finalPath)}.`);
  }
  const partialPath = path.join(destination, `.partial-${crypto.randomUUID()}.sqlite`);
  let linked = false;
  let completed = false;

  try {
    // A read-only connection takes a consistent snapshot even while the backend writes in WAL mode.
    const source = new Database(sourceReal, { readonly: true, fileMustExist: true });
    try {
      source.pragma('busy_timeout = 5000');
      await source.backup(partialPath);
    } finally {
      source.close();
    }

    // Store a self-contained rollback-journal file so verification never needs -wal/-shm sidecars.
    const copy = new Database(partialPath, { fileMustExist: true });
    try {
      copy.pragma('journal_mode = DELETE');
    } finally {
      copy.close();
    }
    fs.chmodSync(partialPath, PRIVATE_FILE_MODE);
    fsyncPath(partialPath);

    // link() fails if the name exists, so a concurrent run can never overwrite a backup.
    fs.linkSync(partialPath, finalPath);
    linked = true;
    const sha256 = sha256File(finalPath);
    fs.writeFileSync(checksumPath, checksumLine(sha256, finalPath), {
      flag: 'wx',
      mode: PRIVATE_FILE_MODE,
    });
    fsyncPath(checksumPath);
    fsyncPath(destination);
    completed = true;
    return { file: finalPath, sha256 };
  } finally {
    // Never leave a backup without its checksum: it would count toward retention unverified.
    if (linked && !completed) {
      fs.rmSync(finalPath, { force: true });
      fs.rmSync(checksumPath, { force: true });
    }
    fs.rmSync(partialPath, { force: true });
    fs.rmSync(`${partialPath}-journal`, { force: true });
  }
}

export async function backupSqlite(options: BackupOptions): Promise<BackupSummary> {
  const summary: BackupSummary = {
    ok: false,
    source: path.resolve(options.source),
    backup: null,
    checksumFile: null,
    sha256: null,
    bytes: null,
    verification: null,
    pruned: [],
    errors: [],
  };

  try {
    if (options.keep !== undefined && (!Number.isInteger(options.keep) || options.keep < 1)) {
      throw new UsageError('--keep must be a positive integer.');
    }
    if (!fs.existsSync(summary.source) || !fs.statSync(summary.source).isFile()) {
      throw new Error('Source database file does not exist.');
    }
    const sourceReal = fs.realpathSync(summary.source);
    const destination = prepareDestination(options, sourceReal);
    assertFreeSpace(destination, sourceReal);

    const written = await writeBackup(sourceReal, destination, options.now ?? new Date());
    summary.backup = written.file;
    summary.checksumFile = `${written.file}${CHECKSUM_SUFFIX}`;
    summary.sha256 = written.sha256;
    summary.bytes = fs.statSync(written.file).size;

    summary.verification = await verifySqliteBackup(written.file, {
      scratchDir: options.scratchDir,
    });
    if (!summary.verification.ok)
      throw new Error('New backup failed verification; retention pruning skipped.');
    if (options.keep !== undefined) summary.pruned = pruneBackups(destination, options.keep);
  } catch (error) {
    summary.errors.push(errorMessage(error));
  }

  summary.ok = summary.errors.length === 0;
  return summary;
}

async function main(): Promise<number> {
  try {
    const args = parseArgs(
      process.argv.slice(2),
      ['source', 'dest', 'keep', 'scratch-dir'],
      ['allow-database-directory'],
    );
    if (args.positionals.length > 0)
      throw new UsageError(`Unexpected argument: ${args.positionals[0]}`);
    const destinationDir = args.values.get('dest') ?? process.env.SQLITE_BACKUP_DIR;
    if (!destinationDir)
      throw new UsageError('A destination is required: --dest <dir> or SQLITE_BACKUP_DIR.');
    const keepValue = args.values.get('keep');
    if (keepValue !== undefined && !/^\d+$/.test(keepValue))
      throw new UsageError('--keep must be a positive integer.');

    // Loaded lazily so --source works without the backend environment.
    const source =
      args.values.get('source') ?? (await import('../../src/config.js')).config.sqliteDatabasePath;
    const summary = await backupSqlite({
      source,
      destinationDir,
      keep: keepValue === undefined ? undefined : Number(keepValue),
      allowDatabaseDirectory: args.flags.has('allow-database-directory'),
      scratchDir: args.values.get('scratch-dir'),
    });
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
