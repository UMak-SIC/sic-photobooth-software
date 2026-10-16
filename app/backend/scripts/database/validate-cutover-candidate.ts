/**
 * Phase 5 cutover gate: validates a candidate SQLite file without modifying it.
 *
 * Usage:
 *   pnpm --filter @photobooth/backend db:validate-cutover --candidate <file.sqlite> [--parity-report <report.json>]
 *
 * Prints a redacted JSON result (no row data, credentials, or directory paths) and exits
 * 0 when every check passes, 1 when any check fails, and 2 on invalid arguments.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import {
  computeSqliteMigrationChecksum,
  findSqliteMigrationsDir,
  runSqliteMigrations,
} from '../../src/db/sqlite/migrations.js';
import { parseCutoverParityReport } from './cutover-parity-report.js';

export interface CutoverCheck {
  name: string;
  passed: boolean;
  details?: Record<string, unknown>;
}

export interface CutoverValidationResult {
  passed: boolean;
  validatedAt: string;
  candidate: {
    file: string;
    sizeBytes?: number;
    sha256?: string;
    /** False when a non-empty WAL sidecar exists, so the main-file checksum is incomplete. */
    checksumCoversAllData?: boolean;
    journalMode?: string;
  };
  checks: CutoverCheck[];
  rowCounts: Record<string, number>;
}

export interface CutoverValidationOptions {
  candidatePath: string;
  parityReportPath?: string;
  now?: () => Date;
}

interface SchemaObject {
  type: string;
  name: string;
  sql: string;
}

const SCHEMA_QUERY = `
  SELECT type, name, COALESCE(sql, '') AS sql FROM sqlite_master
  WHERE type IN ('table', 'index', 'trigger', 'view') AND name NOT LIKE 'sqlite_%'
  ORDER BY type, name`;

function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function sha256File(filename: string): string {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filename, 'r');
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    let bytesRead: number;
    while ((bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

/** Builds the schema the shipped migrations produce, so the check never drifts from them. */
function expectedSchema(): SchemaObject[] {
  const reference = new Database(':memory:');
  try {
    runSqliteMigrations(reference);
    return reference.prepare(SCHEMA_QUERY).all() as SchemaObject[];
  } finally {
    reference.close();
  }
}

function shippedMigrations(): Map<string, string> {
  const directory = findSqliteMigrationsDir();
  const files = fs.readdirSync(directory).filter((file) => file.endsWith('.sql')).sort();
  return new Map(
    files.map((file) => [
      file,
      computeSqliteMigrationChecksum(fs.readFileSync(path.join(directory, file), 'utf8')),
    ]),
  );
}

function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : 'UNKNOWN';
}

function checkIntegrity(db: Database.Database): CutoverCheck {
  const rows = db.prepare('PRAGMA integrity_check').all() as Array<{ integrity_check: string }>;
  const ok = rows.length === 1 && rows[0].integrity_check === 'ok';
  return { name: 'integrity_check', passed: ok, details: ok ? undefined : { problemCount: rows.length } };
}

function checkForeignKeys(db: Database.Database): CutoverCheck {
  const rows = db.prepare('PRAGMA foreign_key_check').all() as Array<{ table: string }>;
  const violationsByTable: Record<string, number> = {};
  for (const row of rows) violationsByTable[row.table] = (violationsByTable[row.table] ?? 0) + 1;
  return {
    name: 'foreign_key_check',
    passed: rows.length === 0,
    details: rows.length === 0 ? undefined : { violationsByTable },
  };
}

function checkMigrationLedger(db: Database.Database, tableNames: Set<string>): CutoverCheck {
  if (!tableNames.has('schema_migrations')) {
    return { name: 'migration_ledger', passed: false, details: { reason: 'schema_migrations table missing' } };
  }
  const shipped = shippedMigrations();
  const recorded = new Map(
    (db.prepare('SELECT id, checksum FROM schema_migrations').all() as Array<{ id: string; checksum: string }>).map(
      (row) => [row.id, row.checksum],
    ),
  );
  const missing = [...shipped.keys()].filter((id) => !recorded.has(id));
  const unexpected = [...recorded.keys()].filter((id) => !shipped.has(id));
  const checksumMismatch = [...shipped].filter(([id, sum]) => recorded.has(id) && recorded.get(id) !== sum).map(([id]) => id);
  const passed = missing.length === 0 && unexpected.length === 0 && checksumMismatch.length === 0;
  return {
    name: 'migration_ledger',
    passed,
    details: { shipped: shipped.size, recorded: recorded.size, ...(passed ? {} : { missing, unexpected, checksumMismatch }) },
  };
}

function checkSchema(actual: SchemaObject[]): CutoverCheck {
  const key = (object: SchemaObject) => `${object.type}:${object.name}`;
  const expected = expectedSchema();
  const actualByKey = new Map(actual.map((object) => [key(object), object]));
  const expectedKeys = new Set(expected.map(key));
  const missing = expected.filter((object) => !actualByKey.has(key(object))).map(key);
  const unexpected = actual.filter((object) => !expectedKeys.has(key(object))).map(key);
  const definitionMismatch = expected
    .filter((object) => {
      const found = actualByKey.get(key(object));
      return found !== undefined && normalizeSql(found.sql) !== normalizeSql(object.sql);
    })
    .map(key);
  const passed = missing.length === 0 && unexpected.length === 0 && definitionMismatch.length === 0;
  return {
    name: 'schema_objects',
    passed,
    details: { expected: expected.length, ...(passed ? {} : { missing, unexpected, definitionMismatch }) },
  };
}

/**
 * Binds the candidate to the `db:validate-parity` report: the report must pass,
 * cover every legacy table, match the candidate's row counts, and (when the
 * main-file checksum covers all data) name this exact file by SHA-256.
 */
function checkParity(
  parityReportPath: string,
  rowCounts: Record<string, number>,
  candidate: CutoverValidationResult['candidate'],
): CutoverCheck {
  let report: unknown;
  try {
    report = JSON.parse(fs.readFileSync(parityReportPath, 'utf8'));
  } catch (error) {
    return {
      name: 'parity_counts',
      passed: false,
      details: { reason: 'parity report unreadable', code: errorCode(error) },
    };
  }
  const { expectedCounts, reportRecordsFailure, candidateSha256, retiredSourceMigrations, problems } =
    parseCutoverParityReport(report);
  const mismatches: Record<string, { expected: number; actual: number | null }> = {};
  for (const [table, expected] of Object.entries(expectedCounts)) {
    const actual = rowCounts[table];
    if (actual !== expected) mismatches[table] = { expected, actual: actual ?? null };
  }
  // A non-empty WAL (backend running) means the main-file hash is incomplete.
  const checksumCompared = candidate.checksumCoversAllData === true && candidateSha256 !== undefined;
  const checksumMismatch = checksumCompared && candidate.sha256 !== candidateSha256;
  const passed =
    !reportRecordsFailure &&
    problems.length === 0 &&
    Object.keys(mismatches).length === 0 &&
    !checksumMismatch;
  return {
    name: 'parity_counts',
    passed,
    details: {
      tablesCompared: Object.keys(expectedCounts).length,
      candidateChecksumCompared: checksumCompared,
      ...(checksumMismatch ? { candidateChecksumMismatch: true } : {}),
      ...(retiredSourceMigrations.length > 0 ? { retiredSourceMigrations } : {}),
      ...(reportRecordsFailure ? { reportRecordsFailure } : {}),
      ...(problems.length > 0 ? { problems } : {}),
      ...(Object.keys(mismatches).length > 0 ? { mismatches } : {}),
    },
  };
}

export function validateCutoverCandidate(options: CutoverValidationOptions): CutoverValidationResult {
  const result: CutoverValidationResult = {
    passed: false,
    validatedAt: (options.now ?? (() => new Date()))().toISOString(),
    candidate: { file: path.basename(options.candidatePath) },
    checks: [],
    rowCounts: {},
  };

  const stat = fs.lstatSync(options.candidatePath, { throwIfNoEntry: false });
  if (!stat?.isFile()) {
    result.checks.push({ name: 'candidate_file', passed: false, details: { reason: 'not a regular file' } });
    return result;
  }
  const walPath = `${options.candidatePath}-wal`;
  const walBytes = fs.statSync(walPath, { throwIfNoEntry: false })?.size ?? 0;
  result.candidate.sizeBytes = stat.size;
  result.candidate.sha256 = sha256File(options.candidatePath);
  result.candidate.checksumCoversAllData = walBytes === 0;

  let db: Database.Database;
  try {
    db = new Database(options.candidatePath, { readonly: true, fileMustExist: true });
    db.pragma('query_only = ON');
  } catch (error) {
    result.checks.push({ name: 'open_read_only', passed: false, details: { code: errorCode(error) } });
    return result;
  }

  try {
    result.checks.push({ name: 'open_read_only', passed: true });
    result.candidate.journalMode = String(db.pragma('journal_mode', { simple: true }));
    result.checks.push(checkIntegrity(db));
    result.checks.push(checkForeignKeys(db));

    const schema = db.prepare(SCHEMA_QUERY).all() as SchemaObject[];
    const tableNames = new Set(schema.filter((object) => object.type === 'table').map((object) => object.name));
    result.checks.push(checkMigrationLedger(db, tableNames));
    result.checks.push(checkSchema(schema));

    for (const table of [...tableNames].sort()) {
      const row = db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`).get() as { count: number };
      result.rowCounts[table] = row.count;
    }
    if (options.parityReportPath) result.checks.push(checkParity(options.parityReportPath, result.rowCounts, result.candidate));
  } catch (error) {
    result.checks.push({ name: 'validation_completed', passed: false, details: { code: errorCode(error) } });
  } finally {
    db.close();
  }

  result.passed = result.checks.length > 0 && result.checks.every((check) => check.passed);
  return result;
}

export function parseCutoverArgs(argv: string[]): CutoverValidationOptions | null {
  const args = argv.filter((arg) => arg !== '--');
  let candidatePath: string | undefined;
  let parityReportPath: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index + 1];
    if (args[index] === '--candidate' && value) candidatePath = args[++index];
    else if (args[index] === '--parity-report' && value) parityReportPath = args[++index];
    else return null;
  }
  return candidatePath ? { candidatePath: path.resolve(candidatePath), parityReportPath: parityReportPath && path.resolve(parityReportPath) } : null;
}

function main(): void {
  const options = parseCutoverArgs(process.argv.slice(2));
  if (!options) {
    process.stderr.write(
      'Usage: db:validate-cutover --candidate <file.sqlite> [--parity-report <report.json>]\n',
    );
    process.exitCode = 2;
    return;
  }
  let result: CutoverValidationResult;
  try {
    result = validateCutoverCandidate(options);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ passed: false, error: 'VALIDATION_ABORTED', code: errorCode(error) }, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.passed ? 0 : 1;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main();
}
