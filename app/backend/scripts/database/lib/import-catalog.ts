import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SqliteDatabase } from '../../../src/db/sqlite/connection.js';
import {
  computeSqliteMigrationChecksum,
  findSqliteMigrationsDir,
} from '../../../src/db/sqlite/migrations.js';
import {
  derivedColumn,
  isDroppedColumn,
  LEGACY_LEDGER_TABLE,
  LEGACY_TABLES,
  POSTGRES_DATA_TYPES,
  quoteIdent,
} from './import-schema.js';
import type { CatalogColumn, MigrationLedgerRow } from './import-source.js';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));

/**
 * The PostgreSQL migrations as applied in production, kept as non-executable evidence
 * under src/db/legacy-postgres/. Resolved relative to this script (not the process cwd).
 */
export function legacyMigrationsDirectory(): string {
  return path.resolve(moduleDirectory, '../../../src/db/legacy-postgres/migrations');
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

/**
 * Migrations that ran in production but were later deleted from the repository.
 * Each is accepted in the legacy ledger only with this exact checksum.
 *
 * 011_storage_relative_paths.sql (added in efe6753, removed in 88644d7) only
 * rewrote stored absolute file paths to storage-relative ones with a regex
 * (data, not schema), so the migration-derived catalog is unchanged. Its job
 * is now done by normalizeStoredPaths() in src/db/normalize-storage-paths.ts.
 */
export const RETIRED_LEGACY_MIGRATIONS: readonly MigrationLedgerRow[] = [
  // Four-digit predecessors renamed by 0c94d09; checksums match the files in git
  // history except 0004_frame_cover_paths, which was never committed (it only added
  // frames.cover_path, see LEGACY_DROPPED_COLUMNS).
  {
    id: '0002_templates.sql',
    checksum: 'e0b0940903b26a0c0bf629c84828bd742ac37592a26fb302e2ffc0386ca06c62',
  },
  {
    id: '0003_template_sort_order.sql',
    checksum: 'a6522ca77b34c9ca3fbb5eb062e9f237a99d5849903149ce9789ee2cf747f4c3',
  },
  {
    id: '0004_frame_cover_paths.sql',
    checksum: '52daf39dce3c04e42da1f03448e5d70beca41ecfc7f92b9493d374f222838192',
  },
  {
    id: '0004_template_types.sql',
    checksum: 'b5af23eed4bccb16c0066444580bd8556723aa2b875af0329a6a51d16670cf87',
  },
  {
    id: '0005_publication_retry_schedule.sql',
    checksum: '63a03b01333dcb3441129cda594d71d84e010890acc61a73d8eb0538eb2704a4',
  },
  {
    id: '011_storage_relative_paths.sql',
    checksum: '7f5da758ca231f1c4a53f4b94a1e49901366bd82a16631dd582a7b89caaaff96',
  },
];

/** Retired migrations recorded in a ledger with their exact allowlisted checksum. */
export function retiredMigrationsIn(
  found: readonly MigrationLedgerRow[],
  retired: readonly MigrationLedgerRow[] = RETIRED_LEGACY_MIGRATIONS,
): string[] {
  return found
    .filter((row) => retired.some((r) => r.id === row.id && r.checksum === row.checksum))
    .map((row) => row.id);
}

/**
 * The source must have applied exactly the repository migrations 001-010,
 * unmodified, plus optionally an allowlisted retired migration with its exact checksum.
 */
export function verifyMigrationLedger(
  found: readonly MigrationLedgerRow[],
  expected: readonly MigrationLedgerRow[],
  retired: readonly MigrationLedgerRow[] = [],
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
  const retiredById = new Map(retired.map((row) => [row.id, row.checksum]));
  for (const row of found) {
    if (expectedIds.has(row.id)) continue;
    const retiredChecksum = retiredById.get(row.id);
    if (retiredChecksum === undefined)
      problems.push(`Source ledger contains unknown migration ${row.id}.`);
    else if (row.checksum !== retiredChecksum)
      problems.push(`Retired migration ${row.id} checksum differs from the allowlisted value.`);
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
        if (!derivedColumn(table.name, column.name))
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
      if (!known.has(column.column) && !isDroppedColumn(table.name, column.column))
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
