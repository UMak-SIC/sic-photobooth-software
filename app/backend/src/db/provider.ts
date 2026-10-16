/**
 * Owns the process's single SQLite database. Routes, workers, health,
 * migrations, and shutdown all go through this module.
 */
import { config } from '../config.js';
import { SqliteTemplateRepository } from '../templates/sqlite-repository.js';
import type {
  CoreRepository,
  DatabaseHealth,
  DatabaseProvider,
  TemplateStore,
} from './contracts.js';
import {
  closeSqliteConnection,
  createSqliteConnection,
  type SqliteConnectionOptions,
} from './sqlite/connection.js';
import { runSqliteMigrations } from './sqlite/migrations.js';
import { SqliteDatabaseRepository } from './sqlite/repository.js';

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function createSqliteProvider(
  filename: string = config.sqliteDatabasePath,
  options: SqliteConnectionOptions = {},
): DatabaseProvider {
  const db = createSqliteConnection(filename, options);
  return {
    engine: 'sqlite',
    repository: new SqliteDatabaseRepository(db),
    templates: new SqliteTemplateRepository(db),
    async checkHealth(): Promise<DatabaseHealth> {
      try {
        db.prepare('SELECT 1').get();
        return { ok: true };
      } catch (error) {
        return { ok: false, error: errorMessage(error) };
      }
    },
    async migrate() {
      return runSqliteMigrations(db);
    },
    async close() {
      if (db.open) closeSqliteConnection(db);
    },
  };
}

let activeProvider: DatabaseProvider | undefined;

/** The process-wide provider, opened on first use. */
export function getDatabaseProvider(): DatabaseProvider {
  activeProvider ??= createSqliteProvider();
  return activeProvider;
}

/** Closes the database (checkpointing its WAL) and forgets it. */
export async function closeDatabaseProvider(): Promise<void> {
  const provider = activeProvider;
  activeProvider = undefined;
  await provider?.close();
}

/** Test seam: installs a provider (or clears it so the next use reopens from config). */
export function setDatabaseProvider(provider: DatabaseProvider | undefined): void {
  activeProvider = provider;
}

export async function checkDatabaseHealth(): Promise<DatabaseHealth> {
  try {
    return await getDatabaseProvider().checkHealth();
  } catch (error) {
    // Opening the database itself failed (e.g. unreadable SQLite file).
    return { ok: false, error: errorMessage(error) };
  }
}

export function runDatabaseMigrations() {
  return getDatabaseProvider().migrate();
}

/** Forwards every call to the active provider's implementation at call time. */
function delegate<T extends object>(resolve: () => T): T {
  return new Proxy({} as T, {
    get(_target, property) {
      const target = resolve();
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

export const dbRepository: CoreRepository = delegate(() => getDatabaseProvider().repository);
export const templateRepository: TemplateStore = delegate(() => getDatabaseProvider().templates);
