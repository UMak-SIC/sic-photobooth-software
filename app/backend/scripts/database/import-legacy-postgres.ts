/**
 * Rebuilds a fresh SQLite database from a restored legacy PostgreSQL database.
 *
 *   pnpm --filter @photobooth/backend db:import-legacy -- \
 *     --source-url "$LEGACY_DATABASE_URL" --destination /path/to/candidate.sqlite
 *
 * See scripts/database/README.md for the full procedure and safety rules.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  closeSqliteConnection,
  createSqliteConnection,
  type SqliteDatabase,
} from '../../src/db/sqlite/connection.js';
import { runSqliteMigrations } from '../../src/db/sqlite/migrations.js';
import {
  expectedLegacyLedger,
  RETIRED_LEGACY_MIGRATIONS,
  retiredMigrationsIn,
  verifyMigrationLedger,
  verifySourceCatalog,
  verifySqliteSchema,
} from './lib/import-catalog.js';
import {
  cliArguments,
  isMainModule,
  removeSqliteFiles,
  sha256File,
  SQLITE_SIDECAR_SUFFIXES,
  writeJsonExclusive,
} from './lib/import-files.js';
import { LEGACY_TABLES, quoteIdent, type TableSpec } from './lib/import-schema.js';
import {
  openLegacySource,
  redactTarget,
  resolveSourceTarget,
  scrubSecrets,
  type LegacyReader,
  type LegacySourceTarget,
} from './lib/import-source.js';
import { convertSourceRow, type SqliteRow } from './lib/import-values.js';

export class ImportRefusedError extends Error {}

export interface ImportOptions {
  reader: LegacyReader;
  destinationPath: string;
  env?: NodeJS.ProcessEnv;
  /** Test seam: runs inside the write transaction immediately before COMMIT. */
  beforeCommit?: (db: SqliteDatabase) => void;
}

export interface ImportSummary {
  destinationPath: string;
  sha256: string;
  importedAt: string;
  tables: Record<string, number>;
  sqliteMigrations: string[];
  /** Source timestamps with microseconds; the canonical format keeps milliseconds. */
  subMillisecondTimestampsTruncated: number;
  /** Allowlisted retired migrations found in the source ledger (see RETIRED_LEGACY_MIGRATIONS). */
  retiredSourceMigrations: string[];
}

type ConvertedTables = Map<string, SqliteRow[]>;

/** Refuses anything but a brand-new path that is not the configured application database. */
export function assertFreshDestination(destinationPath: string, env: NodeJS.ProcessEnv): string {
  const resolved = path.resolve(destinationPath);
  for (const suffix of ['', ...SQLITE_SIDECAR_SUFFIXES]) {
    if (fs.existsSync(`${resolved}${suffix}`)) {
      throw new ImportRefusedError(
        `Destination ${resolved}${suffix} already exists. The importer only writes a brand-new SQLite file.`,
      );
    }
  }
  if (env.SQLITE_DATABASE_PATH && path.resolve(env.SQLITE_DATABASE_PATH) === resolved) {
    throw new ImportRefusedError(
      'Destination is the configured SQLITE_DATABASE_PATH. Import into a new versioned candidate file instead.',
    );
  }
  return resolved;
}

/** The SQLite baseline enforces CHECK (length(public_id) = 7). */
const PUBLIC_ID_LENGTH = 7;

/**
 * Names rows whose public ID the SQLite CHECK constraint would reject, so the
 * operator sees which rows to investigate instead of a bare constraint error.
 * Reports table and row ID only; public ID values are never printed.
 */
export function invalidPublicIdProblems(tables: ReadonlyMap<string, SqliteRow[]>): string[] {
  const problems: string[] = [];
  for (const table of LEGACY_TABLES) {
    if (!table.columns.some((column) => column.name === 'public_id')) continue;
    const invalid = (tables.get(table.name) ?? []).filter(
      (row) => typeof row.public_id !== 'string' || row.public_id.length !== PUBLIC_ID_LENGTH,
    );
    if (invalid.length > 0) {
      const ids = invalid.slice(0, 10).map((row) => String(row.id));
      problems.push(
        `${table.name} has ${invalid.length} row(s) whose public_id is not ${PUBLIC_ID_LENGTH} characters: ${ids.join(', ')}${invalid.length > ids.length ? ', ...' : ''}.`,
      );
    }
  }
  return problems;
}

/** Orders rows so a self-referenced parent is always inserted before its child. */
export function orderSelfReferences(rows: SqliteRow[], column: string): SqliteRow[] {
  const byId = new Map(rows.map((row) => [row.id as string, row]));
  const ordered: SqliteRow[] = [];
  const visited = new Set<string>();
  const visit = (row: SqliteRow): void => {
    const id = row.id as string;
    if (visited.has(id)) return;
    visited.add(id);
    const parent = typeof row[column] === 'string' ? byId.get(row[column] as string) : undefined;
    if (parent) visit(parent);
    ordered.push(row);
  };
  rows.forEach(visit);
  return ordered;
}

async function readSource(reader: LegacyReader): Promise<{
  tables: ConvertedTables;
  subMillisecond: number;
  retired: string[];
}> {
  await reader.begin();
  try {
    const ledger = await reader.migrationLedger();
    const problems = [
      ...verifyMigrationLedger(ledger, expectedLegacyLedger(), RETIRED_LEGACY_MIGRATIONS),
      ...verifySourceCatalog(await reader.catalogColumns()),
    ];
    if (problems.length > 0) {
      throw new ImportRefusedError(`Legacy source failed preflight:\n- ${problems.join('\n- ')}`);
    }
    const tables: ConvertedTables = new Map();
    for (const table of LEGACY_TABLES) {
      const rows = (await reader.readTable(table)).map((row) => convertSourceRow(table, row));
      tables.set(table.name, rows);
    }
    const publicIdProblems = invalidPublicIdProblems(tables);
    if (publicIdProblems.length > 0) {
      throw new ImportRefusedError(
        `Legacy source has public IDs SQLite would reject:\n- ${publicIdProblems.join('\n- ')}`,
      );
    }
    const subMillisecond = await reader.subMillisecondTimestampCount(LEGACY_TABLES);
    return { tables, subMillisecond, retired: retiredMigrationsIn(ledger) };
  } finally {
    await reader.end();
  }
}

function insertTable(db: SqliteDatabase, table: TableSpec, rows: SqliteRow[]): void {
  const columns = table.columns.map((column) => column.name);
  const statement = db.prepare(
    `INSERT INTO ${quoteIdent(table.name)} (${columns.map(quoteIdent).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
  );
  const ordered = table.foreignKeys.some((fk) => fk.references === table.name)
    ? orderSelfReferences(
        rows,
        table.foreignKeys.find((fk) => fk.references === table.name)!.column,
      )
    : rows;
  for (const row of ordered) statement.run(columns.map((column) => row[column]));
}

function writeDatabase(
  filePath: string,
  tables: ConvertedTables,
  beforeCommit?: (db: SqliteDatabase) => void,
): string[] {
  const db = createSqliteConnection(filePath);
  let closed = false;
  try {
    const migrations = runSqliteMigrations(db).applied;
    const schemaProblems = verifySqliteSchema(db);
    if (schemaProblems.length > 0) {
      throw new ImportRefusedError(
        `SQLite baseline does not match the legacy schema:\n- ${schemaProblems.join('\n- ')}`,
      );
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      // Constraints are still enforced; deferral only lets a single COMMIT
      // judge the complete graph, including self-references.
      db.pragma('defer_foreign_keys = ON');
      for (const table of LEGACY_TABLES) insertTable(db, table, tables.get(table.name) ?? []);
      beforeCommit?.(db);
      db.exec('COMMIT');
    } catch (error) {
      if (db.inTransaction) db.exec('ROLLBACK');
      throw error;
    }

    const violations = db.pragma('foreign_key_check') as unknown[];
    if (violations.length > 0)
      throw new Error(`SQLite foreign_key_check reported ${violations.length} violation(s).`);
    const integrity = db.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') throw new Error('SQLite integrity_check failed after import.');
    for (const table of LEGACY_TABLES) {
      const { count } = db
        .prepare(`SELECT count(*) AS count FROM ${quoteIdent(table.name)}`)
        .get() as { count: number };
      const expected = tables.get(table.name)?.length ?? 0;
      if (count !== expected)
        throw new Error(`${table.name} has ${count} rows after import; expected ${expected}.`);
    }

    closeSqliteConnection(db);
    closed = true;
    return migrations;
  } finally {
    if (!closed) db.close();
  }
}

/** Publishes the finished temporary file without ever overwriting an existing path. */
function publishFile(temporaryPath: string, destinationPath: string): void {
  for (const suffix of SQLITE_SIDECAR_SUFFIXES) {
    const sidecar = `${temporaryPath}${suffix}`;
    if (fs.existsSync(sidecar)) {
      if (fs.statSync(sidecar).size > 0)
        throw new Error(`Unexpected non-empty SQLite sidecar ${sidecar}.`);
      fs.rmSync(sidecar);
    }
  }
  fs.linkSync(temporaryPath, destinationPath);
  fs.rmSync(temporaryPath);
  const directory = fs.openSync(path.dirname(destinationPath), 'r');
  try {
    fs.fsyncSync(directory);
  } finally {
    fs.closeSync(directory);
  }
}

/**
 * Imports every legacy row into a new SQLite file in one transaction. Any
 * failure rolls back, removes the partial file, and leaves the destination absent.
 */
export async function importLegacyPostgres(options: ImportOptions): Promise<ImportSummary> {
  const env = options.env ?? process.env;
  const destinationPath = assertFreshDestination(options.destinationPath, env);
  const { tables, subMillisecond, retired } = await readSource(options.reader);

  fs.mkdirSync(path.dirname(destinationPath), { recursive: true, mode: 0o700 });
  // Build beside the destination so publishing is a same-filesystem link.
  const temporaryPath = `${destinationPath}.importing-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  fs.closeSync(fs.openSync(temporaryPath, 'wx', 0o600));
  let migrations: string[];
  try {
    migrations = writeDatabase(temporaryPath, tables, options.beforeCommit);
    assertFreshDestination(destinationPath, env);
    publishFile(temporaryPath, destinationPath);
  } catch (error) {
    removeSqliteFiles(temporaryPath);
    throw error;
  }

  return {
    destinationPath,
    sha256: sha256File(destinationPath),
    importedAt: new Date().toISOString(),
    tables: Object.fromEntries(
      LEGACY_TABLES.map((table) => [table.name, tables.get(table.name)?.length ?? 0]),
    ),
    sqliteMigrations: migrations,
    subMillisecondTimestampsTruncated: subMillisecond,
    retiredSourceMigrations: retired,
  };
}

const USAGE = `Usage: db:import-legacy --source-url <postgres-url> --destination <new.sqlite> [--summary <file.json>] [--allow-live-source]

  --source-url         Restored legacy database (or set LEGACY_DATABASE_URL). DATABASE_URL is never used.
  --destination        Path for a brand-new SQLite file; existing files are refused.
  --summary            Optional JSON summary written with mode 0600 (never overwritten).
  --allow-live-source  Permit reading a database named "photobooth" during an approved, write-frozen cutover.`;

async function main(): Promise<number> {
  let values;
  try {
    ({ values } = parseArgs({
      args: cliArguments(),
      options: {
        'source-url': { type: 'string' },
        destination: { type: 'string' },
        summary: { type: 'string' },
        'allow-live-source': { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
      },
    }));
  } catch (error) {
    console.error(
      `${error instanceof Error ? scrubSecrets(error.message) : 'Invalid arguments.'}\n\n${USAGE}`,
    );
    return 2;
  }
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  if (!values.destination) {
    console.error(`--destination is required.\n\n${USAGE}`);
    return 2;
  }
  if (values.summary && fs.existsSync(values.summary)) {
    console.error(`Summary file ${values.summary} already exists; choose a new path.`);
    return 2;
  }

  let target: LegacySourceTarget | undefined;
  try {
    target = resolveSourceTarget({
      sourceUrl: values['source-url'],
      allowLiveSource: values['allow-live-source'],
    });
    const source = await openLegacySource(target, values['allow-live-source']);
    try {
      const summary = await importLegacyPostgres({
        reader: source.reader,
        destinationPath: values.destination,
      });
      const output = {
        tool: 'import-legacy-postgres',
        status: 'imported',
        source: { ...redactTarget(target), serverVersion: source.serverVersion },
        ...summary,
      };
      if (values.summary) writeJsonExclusive(values.summary, output);
      console.log(JSON.stringify(output, null, 2));
      return 0;
    } finally {
      await source.close();
    }
  } catch (error) {
    console.error(
      `Import failed: ${scrubSecrets(error instanceof Error ? error.message : String(error), target)}`,
    );
    return 1;
  }
}

if (isMainModule(import.meta.url)) {
  main().then((code) => {
    process.exitCode = code;
  });
}
