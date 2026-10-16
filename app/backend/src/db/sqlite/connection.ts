import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export type SqliteDatabase = Database.Database;

export interface SqliteConnectionOptions {
  /** A finite wait prevents a locked database from silently stalling the booth. */
  busyTimeoutMs?: number;
  /** Injected by tests; production should use the configured file path. */
  databaseFactory?: (filename: string) => SqliteDatabase;
}

const DEFAULT_BUSY_TIMEOUT_MS = 5_000;
let productionConnection: SqliteDatabase | undefined;

function ensureParentDirectory(filename: string): void {
  if (filename === ':memory:' || filename.startsWith('file:')) return;
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
}

/**
 * Opens one process-owned SQLite connection with the durability guarantees the
 * local booth requires. Callers own the returned handle and must close it.
 */
export function createSqliteConnection(
  filename: string,
  options: SqliteConnectionOptions = {},
): SqliteDatabase {
  ensureParentDirectory(filename);
  const db = (options.databaseFactory ?? ((name) => new Database(name)))(filename);

  try {
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = FULL');
    db.pragma(`busy_timeout = ${options.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS}`);
    // Fail early on unsupported SQLite builds; migration constraints depend on JSON functions.
    const jsonSupport = db.prepare("SELECT json_valid('[]') AS valid").get() as { valid: number };
    if (jsonSupport.valid !== 1) throw new Error('SQLite JSON functions are unavailable.');
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export function closeSqliteConnection(db: SqliteDatabase): void {
  // Truncate is safe while this process owns the only connection and avoids
  // leaving WAL sidecars behind after a graceful shutdown.
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.close();
}

/** Returns the one SQLite handle owned by the backend process. */
export function getProductionSqliteConnection(filename: string): SqliteDatabase {
  if (!productionConnection) productionConnection = createSqliteConnection(filename);
  return productionConnection;
}

export function closeProductionSqliteConnection(): void {
  if (!productionConnection) return;
  closeSqliteConnection(productionConnection);
  productionConnection = undefined;
}
