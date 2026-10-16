import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SqliteDatabase } from '../../../src/db/sqlite/connection.js';
import {
  computeSqliteMigrationChecksum,
  findSqliteMigrationsDir,
} from '../../../src/db/sqlite/migrations.js';
import {
  LEGACY_LEDGER_TABLE,
  LEGACY_TABLES,
  POSTGRES_DATA_TYPES,
  quoteIdent,
} from './import-schema.js';
import type { CatalogColumn, MigrationLedgerRow } from './import-source.js';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));

/** The repository's PostgreSQL migrations, relative to this script (not the process cwd). */
export function legacyMigrationsDirectory(): string {
  return path.resolve(moduleDirectory, '../../../src/db/migrations');
}

function readMigrationLedger(directory: string): MigrationLedgerRow[] {
  return fs
    .readdirSync(directory)
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    .map((file) => ({
      id: file,
      // The PostgreSQL and SQLite runners use the same normalized SHA-256 checksum.
      checksum: computeSqliteMigrationChecksum(fs.readFileSync(path.join(directory, file), 'utf8')),
    }));
}

export function expectedLegacyLedger(
  directory = legacyMigrationsDirectory(),
): MigrationLedgerRow[] {
  return readMigrationLedger(directory);
}

export function expectedSqliteLedger(): MigrationLedgerRow[] {
  return readMigrationLedger(findSqliteMigrationsDir());
}

/** The source must have applied exactly the repository migrations 001-010, unmodified. */
export function verifyMigrationLedger(
  found: readonly MigrationLedgerRow[],
  expected: readonly MigrationLedgerRow[],
): string[] {
  const problems: string[] = [];
  const foundById = new Map(found.map((row) => [row.id, row.checksum]));
  for (const migration of expected) {
    const checksum = foundById.get(migration.id);
    if (checksum === undefined)
      problems.push(`Migration ${migration.id} is not recorded in the source ledger.`);
    else if (checksum !== migration.checksum)
      problems.push(`Migration ${migration.id} checksum differs from the repository file.`);
  }
  const expectedIds = new Set(expected.map((row) => row.id));
  for (const row of found) {
    if (!expectedIds.has(row.id))
      problems.push(`Source ledger contains unknown migration ${row.id}.`);
  }
  return problems;
}

/** Compares the source catalog with the migration-derived specs so no column can be dropped. */
export function verifySourceCatalog(columns: readonly CatalogColumn[]): string[] {
  const problems: string[] = [];
  const byTable = new Map<string, CatalogColumn[]>();
  for (const column of columns) {
    byTable.set(column.table, [...(byTable.get(column.table) ?? []), column]);
  }

  for (const table of LEGACY_TABLES) {
    const sourceColumns = byTable.get(table.name);
    if (!sourceColumns) {
      problems.push(`Source table ${table.name} is missing.`);
      continue;
    }
    const sourceByName = new Map(sourceColumns.map((column) => [column.column, column]));
    for (const column of table.columns) {
      const source = sourceByName.get(column.name);
      if (!source) {
        problems.push(`Source column ${table.name}.${column.name} is missing.`);
        continue;
      }
      if (!POSTGRES_DATA_TYPES[column.kind].includes(source.dataType)) {
        problems.push(
          `Source column ${table.name}.${column.name} has type ${source.dataType}, expected ${column.kind}.`,
        );
      }
      if (source.nullable !== column.nullable) {
        problems.push(
          `Source column ${table.name}.${column.name} nullability differs from migrations 001-010.`,
        );
      }
    }
    const known = new Set(table.columns.map((column) => column.name));
    for (const column of sourceColumns) {
      if (!known.has(column.column))
        problems.push(`Source column ${table.name}.${column.column} is not mapped to SQLite.`);
    }
  }

  const knownTables = new Set([...LEGACY_TABLES.map((table) => table.name), LEGACY_LEDGER_TABLE]);
  for (const table of byTable.keys()) {
    if (!knownTables.has(table)) problems.push(`Source table ${table} is not mapped to SQLite.`);
  }
  return problems;
}

/** Confirms the SQLite baseline exposes exactly the mapped columns with matching nullability. */
export function verifySqliteSchema(db: SqliteDatabase): string[] {
  const problems: string[] = [];
  for (const table of LEGACY_TABLES) {
    const info = db.prepare(`PRAGMA table_info(${quoteIdent(table.name)})`).all() as {
      name: string;
      notnull: number;
    }[];
    if (info.length === 0) {
      problems.push(`SQLite table ${table.name} is missing.`);
      continue;
    }
    const byName = new Map(info.map((column) => [column.name, column]));
    for (const column of table.columns) {
      const target = byName.get(column.name);
      if (!target) problems.push(`SQLite column ${table.name}.${column.name} is missing.`);
      else if ((target.notnull === 0) !== column.nullable) {
        problems.push(
          `SQLite column ${table.name}.${column.name} nullability differs from PostgreSQL.`,
        );
      }
    }
    const known = new Set(table.columns.map((column) => column.name));
    for (const column of info) {
      if (!known.has(column.name))
        problems.push(`SQLite column ${table.name}.${column.name} has no PostgreSQL source.`);
    }
  }
  const tables = db
    .prepare(`SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
    .all() as { name: string }[];
  const knownTables = new Set([...LEGACY_TABLES.map((table) => table.name), LEGACY_LEDGER_TABLE]);
  for (const { name } of tables) {
    if (!knownTables.has(name)) problems.push(`SQLite table ${name} has no PostgreSQL source.`);
  }
  return problems;
}
