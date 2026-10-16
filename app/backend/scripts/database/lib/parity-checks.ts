import crypto from 'node:crypto';
import type { SqliteDatabase } from '../../../src/db/sqlite/connection.js';
import { LEGACY_TABLES, quoteIdent, type TableSpec } from './import-schema.js';
import {
  canonicalJson,
  comparableValue,
  convertSourceRow,
  isCanonicalTimestamp,
  type SourceRow,
  type SqliteRow,
} from './import-values.js';

/** Lists in the report are capped so it stays readable and never dumps whole tables. */
export const MAX_LISTED = 20;

export type CountMap = Record<string, number>;

export interface TableParity {
  ok: boolean;
  sourceCount: number;
  sqliteCount: number;
  sourceDigest: string;
  sqliteDigest: string;
  missingInSqlite: string[];
  missingInSqliteCount: number;
  extraInSqlite: string[];
  extraInSqliteCount: number;
  /** Row ids and the column names that differ; values are never reported. */
  mismatchedRows: { id: string; columns: string[] }[];
  mismatchedRowCount: number;
}

function digestRows(table: TableSpec, rows: SqliteRow[]): string {
  const hash = crypto.createHash('sha256');
  const sorted = [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  for (const row of sorted) {
    hash.update(
      canonicalJson(table.columns.map((column) => comparableValue(column, row[column.name]))),
    );
    hash.update('\n');
  }
  return hash.digest('hex');
}

function timestampMatches(
  sourceRaw: SourceRow,
  column: string,
  sourceValue: unknown,
  sqliteValue: unknown,
): boolean {
  if (sourceValue === null || sqliteValue === null) return sourceValue === sqliteValue;
  if (typeof sqliteValue !== 'string' || !isCanonicalTimestamp(sqliteValue)) return false;
  const epoch = sourceRaw[`${column}__epoch_ms`];
  // The epoch comes from PostgreSQL independently of the text conversion the
  // importer used, so a timezone or formatting bug cannot hide behind itself.
  if (epoch !== undefined && epoch !== null && Date.parse(sqliteValue) !== Number(epoch))
    return false;
  return sourceValue === sqliteValue;
}

/** Compares one table row-for-row by primary key. Source rows are raw legacy reads. */
export function compareTableRows(
  table: TableSpec,
  sourceRaw: SourceRow[],
  sqliteRows: SqliteRow[],
): { parity: TableParity; converted: SqliteRow[] } {
  const converted = sourceRaw.map((row) => convertSourceRow(table, row));
  const sourceById = new Map(
    converted.map((row, index) => [row.id as string, { row, raw: sourceRaw[index] }]),
  );
  const sqliteById = new Map(sqliteRows.map((row) => [String(row.id), row]));

  const missing = [...sourceById.keys()].filter((id) => !sqliteById.has(id));
  const extra = [...sqliteById.keys()].filter((id) => !sourceById.has(id));
  const mismatched: { id: string; columns: string[] }[] = [];
  for (const [id, { row, raw }] of sourceById) {
    const target = sqliteById.get(id);
    if (!target) continue;
    const columns = table.columns
      .filter((column) => {
        const sourceValue = row[column.name];
        const sqliteValue = target[column.name] ?? null;
        if (column.kind === 'timestamp')
          return !timestampMatches(raw, column.name, sourceValue, sqliteValue);
        return comparableValue(column, sourceValue) !== comparableValue(column, sqliteValue);
      })
      .map((column) => column.name);
    if (columns.length > 0) mismatched.push({ id, columns });
  }

  const parity: TableParity = {
    ok: missing.length === 0 && extra.length === 0 && mismatched.length === 0,
    sourceCount: converted.length,
    sqliteCount: sqliteRows.length,
    sourceDigest: digestRows(table, converted),
    sqliteDigest: digestRows(table, sqliteRows),
    missingInSqlite: missing.slice(0, MAX_LISTED),
    missingInSqliteCount: missing.length,
    extraInSqlite: extra.slice(0, MAX_LISTED),
    extraInSqliteCount: extra.length,
    mismatchedRows: mismatched.slice(0, MAX_LISTED),
    mismatchedRowCount: mismatched.length,
  };
  return { parity, converted };
}

export function readSqliteTable(db: SqliteDatabase, table: TableSpec): SqliteRow[] {
  const columns = table.columns.map((column) => quoteIdent(column.name)).join(', ');
  return db
    .prepare(`SELECT ${columns} FROM ${quoteIdent(table.name)} ORDER BY "id"`)
    .all() as SqliteRow[];
}

// ---------------------------------------------------------------------------
// Orphans: computed from source rows in JS and natively in SQLite.

function foreignKeyLabel(table: TableSpec, column: string, references: string): string {
  return `${table.name}.${column}->${references}`;
}

export function sourceOrphans(tables: Map<string, SqliteRow[]>): CountMap {
  const result: CountMap = {};
  for (const table of LEGACY_TABLES) {
    for (const fk of table.foreignKeys) {
      const parents = new Set((tables.get(fk.references) ?? []).map((row) => row.id));
      result[foreignKeyLabel(table, fk.column, fk.references)] = (
        tables.get(table.name) ?? []
      ).filter((row) => row[fk.column] !== null && !parents.has(row[fk.column])).length;
    }
  }
  return result;
}

export function sqliteOrphans(db: SqliteDatabase): CountMap {
  const result: CountMap = {};
  for (const table of LEGACY_TABLES) {
    for (const fk of table.foreignKeys) {
      const { count } = db
        .prepare(
          `SELECT count(*) AS count FROM ${quoteIdent(table.name)} AS child
            WHERE child.${quoteIdent(fk.column)} IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM ${quoteIdent(fk.references)} AS parent WHERE parent."id" = child.${quoteIdent(fk.column)})`,
        )
        .get() as { count: number };
      result[foreignKeyLabel(table, fk.column, fk.references)] = count;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Semantic aggregates. The source side is computed in JS from the rows read
// out of PostgreSQL; the SQLite side runs native SQL, so the two are derived
// independently and a stored-type or JSON-function problem shows up as a diff.

export interface ParityAggregates {
  queues: {
    publicationByStatus: CountMap;
    publicationRetryTotal: number;
    publicationWithError: number;
    publicationScheduled: number;
    publicationFinalized: number;
    printJobsByStatus: CountMap;
    printAttemptsByState: CountMap;
    printAttemptsCurrent: number;
    printAttemptsSuperseded: number;
  };
  printAccounting: {
    copiesRequested: number;
    copiesCompleted: number;
    sessionCopiesPrinted: number;
    printedSessions: number;
    reprintJobs: number;
    completedCopiesBySession: CountMap;
    printJobsBySession: CountMap;
  };
  relationships: {
    sessionsByEvent: CountMap;
    sessionsByState: CountMap;
    sessionsByTemplate: CountMap;
    sessionsByFrame: CountMap;
    outputsBySession: CountMap;
    placementsByTemplate: CountMap;
    overlaysByTemplate: CountMap;
    publicationPublicIdMismatches: number;
    printJobPublicIdMismatches: number;
    printJobSessionMismatches: number;
  };
  publicIds: {
    outputs: Record<string, string>;
    publications: Record<string, string>;
  };
  analytics: Record<
    string,
    { sessions: number; prints: number; printedSessions: number; reprintSessions: number }
  >;
}

function countBy(rows: SqliteRow[], key: (row: SqliteRow) => unknown): CountMap {
  const result: CountMap = {};
  for (const row of rows) {
    const value = key(row);
    if (value === null || value === undefined) continue;
    result[String(value)] = (result[String(value)] ?? 0) + 1;
  }
  return result;
}

function sumBy(
  rows: SqliteRow[],
  key: (row: SqliteRow) => SqliteRow[string],
  groupBy: string,
): CountMap {
  const result: CountMap = {};
  for (const row of rows) {
    const group = String(row[groupBy]);
    result[group] = (result[group] ?? 0) + Number(key(row));
  }
  return result;
}

const sum = (rows: SqliteRow[], column: string): number =>
  rows.reduce((total, row) => total + Number(row[column] ?? 0), 0);

/** Mirrors the SQLite expression for the analytics template label. */
function snapshotName(snapshot: SqliteRow[string]): string | null {
  if (typeof snapshot !== 'string') return null;
  const value = (JSON.parse(snapshot) as { name?: unknown } | null)?.name;
  if (value === undefined || value === null) return null;
  return typeof value === 'string' ? value : '<non-text>';
}

export function sourceAggregates(tables: Map<string, SqliteRow[]>): ParityAggregates {
  const rows = (name: string): SqliteRow[] => tables.get(name) ?? [];
  const publications = rows('publication_records');
  const printJobs = rows('print_jobs');
  const attempts = rows('print_job_attempts');
  const sessions = rows('sessions');
  const outputs = rows('generated_outputs');
  const outputById = new Map(outputs.map((row) => [row.id, row]));
  const templateById = new Map(rows('templates').map((row) => [row.id, row]));

  const analytics: ParityAggregates['analytics'] = {};
  for (const session of sessions) {
    if (session.state !== 'booth_confirmed' && session.state !== 'printed') continue;
    const name =
      (templateById.get(session.template_id)?.name as string | undefined) ??
      snapshotName(session.template_snapshot) ??
      '';
    const key = [
      session.event_id,
      session.type,
      name,
      String(session.created_at).slice(0, 10),
    ].join('|');
    const bucket = (analytics[key] ??= {
      sessions: 0,
      prints: 0,
      printedSessions: 0,
      reprintSessions: 0,
    });
    bucket.sessions += 1;
    bucket.prints += Number(session.copies_printed);
    bucket.printedSessions += Number(session.is_printed);
    bucket.reprintSessions += Number(session.copies_printed) > 1 ? 1 : 0;
  }

  return {
    queues: {
      publicationByStatus: countBy(publications, (row) => row.status),
      publicationRetryTotal: sum(publications, 'retry_count'),
      publicationWithError: publications.filter((row) => row.last_error !== null).length,
      publicationScheduled: publications.filter((row) => row.next_attempt_at !== null).length,
      publicationFinalized: publications.filter((row) => row.cloud_finalized_at !== null).length,
      printJobsByStatus: countBy(printJobs, (row) => row.status),
      printAttemptsByState: countBy(attempts, (row) => row.state),
      printAttemptsCurrent: attempts.filter((row) => row.is_current === 1).length,
      printAttemptsSuperseded: attempts.filter((row) => row.superseded_at !== null).length,
    },
    printAccounting: {
      copiesRequested: sum(printJobs, 'copies_requested'),
      copiesCompleted: sum(printJobs, 'copies_completed'),
      sessionCopiesPrinted: sum(sessions, 'copies_printed'),
      printedSessions: sessions.filter((row) => row.is_printed === 1).length,
      reprintJobs: printJobs.filter((row) => row.reprint_of_id !== null).length,
      completedCopiesBySession: sumBy(printJobs, (row) => row.copies_completed, 'session_id'),
      printJobsBySession: countBy(printJobs, (row) => row.session_id),
    },
    relationships: {
      sessionsByEvent: countBy(sessions, (row) => row.event_id),
      sessionsByState: countBy(sessions, (row) => row.state),
      sessionsByTemplate: countBy(sessions, (row) => row.template_id),
      sessionsByFrame: countBy(sessions, (row) => row.frame_id),
      outputsBySession: countBy(outputs, (row) => row.session_id),
      placementsByTemplate: countBy(rows('template_placements'), (row) => row.template_id),
      overlaysByTemplate: countBy(rows('template_overlays'), (row) => row.template_id),
      publicationPublicIdMismatches: publications.filter(
        (row) => outputById.get(row.output_id)?.public_id !== row.public_id,
      ).length,
      printJobPublicIdMismatches: printJobs.filter(
        (row) =>
          row.output_id !== null && outputById.get(row.output_id)?.public_id !== row.public_id,
      ).length,
      printJobSessionMismatches: printJobs.filter(
        (row) =>
          row.output_id !== null && outputById.get(row.output_id)?.session_id !== row.session_id,
      ).length,
    },
    publicIds: {
      outputs: Object.fromEntries(outputs.map((row) => [row.public_id, row.id])),
      publications: Object.fromEntries(publications.map((row) => [row.public_id, row.output_id])),
    },
    analytics,
  };
}

function sqlCountMap(db: SqliteDatabase, sql: string): CountMap {
  const result: CountMap = {};
  for (const row of db.prepare(sql).all() as { k: string | null; n: number }[]) {
    if (row.k !== null) result[row.k] = row.n;
  }
  return result;
}

function sqlNumber(db: SqliteDatabase, sql: string): number {
  return Number((db.prepare(sql).get() as { n: number | null }).n ?? 0);
}

// A searched CASE: `CASE x WHEN NULL` never matches, which would mislabel absent names.
const SNAPSHOT_NAME_SQL = `CASE
  WHEN json_type(s.template_snapshot, '$.name') IS NULL THEN NULL
  WHEN json_type(s.template_snapshot, '$.name') = 'null' THEN NULL
  WHEN json_type(s.template_snapshot, '$.name') = 'text' THEN json_extract(s.template_snapshot, '$.name')
  ELSE '<non-text>' END`;

export function sqliteAggregates(db: SqliteDatabase): ParityAggregates {
  const analytics: ParityAggregates['analytics'] = {};
  const analyticsRows = db
    .prepare(
      `SELECT s.event_id || '|' || s.type || '|' || COALESCE(t.name, ${SNAPSHOT_NAME_SQL}, '') || '|' || substr(s.created_at, 1, 10) AS k,
              count(*) AS sessions, total(s.copies_printed) AS prints, total(s.is_printed) AS printed,
              total(s.copies_printed > 1) AS reprints
         FROM sessions AS s LEFT JOIN templates AS t ON t.id = s.template_id
        WHERE s.state IN ('booth_confirmed', 'printed')
        GROUP BY k`,
    )
    .all() as { k: string; sessions: number; prints: number; printed: number; reprints: number }[];
  for (const row of analyticsRows) {
    analytics[row.k] = {
      sessions: row.sessions,
      prints: row.prints,
      printedSessions: row.printed,
      reprintSessions: row.reprints,
    };
  }

  const pairs = (sql: string): Record<string, string> =>
    Object.fromEntries(
      (db.prepare(sql).all() as { k: string; v: string }[]).map((row) => [row.k, row.v]),
    );

  return {
    queues: {
      publicationByStatus: sqlCountMap(
        db,
        'SELECT status AS k, count(*) AS n FROM publication_records GROUP BY status',
      ),
      publicationRetryTotal: sqlNumber(
        db,
        'SELECT total(retry_count) AS n FROM publication_records',
      ),
      publicationWithError: sqlNumber(
        db,
        'SELECT count(*) AS n FROM publication_records WHERE last_error IS NOT NULL',
      ),
      publicationScheduled: sqlNumber(
        db,
        'SELECT count(*) AS n FROM publication_records WHERE next_attempt_at IS NOT NULL',
      ),
      publicationFinalized: sqlNumber(
        db,
        'SELECT count(*) AS n FROM publication_records WHERE cloud_finalized_at IS NOT NULL',
      ),
      printJobsByStatus: sqlCountMap(
        db,
        'SELECT status AS k, count(*) AS n FROM print_jobs GROUP BY status',
      ),
      printAttemptsByState: sqlCountMap(
        db,
        'SELECT state AS k, count(*) AS n FROM print_job_attempts GROUP BY state',
      ),
      printAttemptsCurrent: sqlNumber(
        db,
        'SELECT count(*) AS n FROM print_job_attempts WHERE is_current = 1',
      ),
      printAttemptsSuperseded: sqlNumber(
        db,
        'SELECT count(*) AS n FROM print_job_attempts WHERE superseded_at IS NOT NULL',
      ),
    },
    printAccounting: {
      copiesRequested: sqlNumber(db, 'SELECT total(copies_requested) AS n FROM print_jobs'),
      copiesCompleted: sqlNumber(db, 'SELECT total(copies_completed) AS n FROM print_jobs'),
      sessionCopiesPrinted: sqlNumber(db, 'SELECT total(copies_printed) AS n FROM sessions'),
      printedSessions: sqlNumber(db, 'SELECT count(*) AS n FROM sessions WHERE is_printed = 1'),
      reprintJobs: sqlNumber(
        db,
        'SELECT count(*) AS n FROM print_jobs WHERE reprint_of_id IS NOT NULL',
      ),
      completedCopiesBySession: sqlCountMap(
        db,
        'SELECT session_id AS k, total(copies_completed) AS n FROM print_jobs GROUP BY session_id',
      ),
      printJobsBySession: sqlCountMap(
        db,
        'SELECT session_id AS k, count(*) AS n FROM print_jobs GROUP BY session_id',
      ),
    },
    relationships: {
      sessionsByEvent: sqlCountMap(
        db,
        'SELECT event_id AS k, count(*) AS n FROM sessions GROUP BY event_id',
      ),
      sessionsByState: sqlCountMap(
        db,
        'SELECT state AS k, count(*) AS n FROM sessions GROUP BY state',
      ),
      sessionsByTemplate: sqlCountMap(
        db,
        'SELECT template_id AS k, count(*) AS n FROM sessions GROUP BY template_id',
      ),
      sessionsByFrame: sqlCountMap(
        db,
        'SELECT frame_id AS k, count(*) AS n FROM sessions GROUP BY frame_id',
      ),
      outputsBySession: sqlCountMap(
        db,
        'SELECT session_id AS k, count(*) AS n FROM generated_outputs GROUP BY session_id',
      ),
      placementsByTemplate: sqlCountMap(
        db,
        'SELECT template_id AS k, count(*) AS n FROM template_placements GROUP BY template_id',
      ),
      overlaysByTemplate: sqlCountMap(
        db,
        'SELECT template_id AS k, count(*) AS n FROM template_overlays GROUP BY template_id',
      ),
      publicationPublicIdMismatches: sqlNumber(
        db,
        `SELECT count(*) AS n FROM publication_records AS p LEFT JOIN generated_outputs AS o ON o.id = p.output_id
          WHERE o.public_id IS NOT p.public_id`,
      ),
      printJobPublicIdMismatches: sqlNumber(
        db,
        `SELECT count(*) AS n FROM print_jobs AS j LEFT JOIN generated_outputs AS o ON o.id = j.output_id
          WHERE j.output_id IS NOT NULL AND o.public_id IS NOT j.public_id`,
      ),
      printJobSessionMismatches: sqlNumber(
        db,
        `SELECT count(*) AS n FROM print_jobs AS j LEFT JOIN generated_outputs AS o ON o.id = j.output_id
          WHERE j.output_id IS NOT NULL AND o.session_id IS NOT j.session_id`,
      ),
    },
    publicIds: {
      outputs: pairs('SELECT public_id AS k, id AS v FROM generated_outputs'),
      publications: pairs('SELECT public_id AS k, output_id AS v FROM publication_records'),
    },
    analytics,
  };
}

export interface SectionComparison {
  ok: boolean;
  /** Dotted paths (e.g. `queues.printJobsByStatus.failed`) whose values differ. */
  differences: string[];
  differenceCount: number;
}

function collectDifferences(source: unknown, sqlite: unknown, prefix: string, out: string[]): void {
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
  if (isRecord(source) && isRecord(sqlite)) {
    for (const key of [...new Set([...Object.keys(source), ...Object.keys(sqlite)])].sort()) {
      collectDifferences(source[key], sqlite[key], prefix ? `${prefix}.${key}` : key, out);
    }
    return;
  }
  if (canonicalJson(source) !== canonicalJson(sqlite)) out.push(prefix);
}

export function compareSections(source: unknown, sqlite: unknown): SectionComparison {
  const differences: string[] = [];
  collectDifferences(source, sqlite, '', differences);
  return {
    ok: differences.length === 0,
    differences: differences.slice(0, MAX_LISTED),
    differenceCount: differences.length,
  };
}

// ---------------------------------------------------------------------------
// Stored-value constraints the import must uphold beyond the DDL itself.

const HEX = '[0-9a-f]';
const UUID_GLOB = [8, 4, 4, 4, 12].map((length) => HEX.repeat(length)).join('-');
const DIGITS = (count: number): string => '[0-9]'.repeat(count);
const TIMESTAMP_GLOB = `${DIGITS(4)}-${DIGITS(2)}-${DIGITS(2)}T${DIGITS(2)}:${DIGITS(2)}:${DIGITS(2)}.${DIGITS(3)}Z`;
const DATE_GLOB = `${DIGITS(4)}-${DIGITS(2)}-${DIGITS(2)}`;
const PUBLIC_ID_GLOB = '[0-9A-Za-z]'.repeat(7);

export interface ConstraintReport {
  ok: boolean;
  /** `table.column` -> rows violating the canonical stored form; must all be zero. */
  violations: CountMap;
  /** Public IDs that are not seven base-62 characters; legacy data is reported, not rejected. */
  nonBase62PublicIds: CountMap;
}

export function sqliteConstraints(db: SqliteDatabase): ConstraintReport {
  const violations: CountMap = {};
  const count = (table: string, where: string): number =>
    (
      db.prepare(`SELECT count(*) AS n FROM ${quoteIdent(table)} WHERE ${where}`).get() as {
        n: number;
      }
    ).n;

  for (const table of LEGACY_TABLES) {
    for (const column of table.columns) {
      const name = quoteIdent(column.name);
      let where: string | undefined;
      if (column.kind === 'timestamp')
        where = `${name} IS NOT NULL AND (${name} NOT GLOB '${TIMESTAMP_GLOB}' OR strftime('%Y-%m-%dT%H:%M:%fZ', ${name}) IS NOT ${name})`;
      else if (column.kind === 'date')
        where = `${name} IS NOT NULL AND (${name} NOT GLOB '${DATE_GLOB}' OR date(${name}) IS NOT ${name})`;
      else if (column.kind === 'uuid')
        where = `${name} IS NOT NULL AND ${name} NOT GLOB '${UUID_GLOB}'`;
      else if (column.kind === 'json') where = `${name} IS NOT NULL AND json_valid(${name}) = 0`;
      else if (column.kind === 'boolean') where = `${name} NOT IN (0, 1)`;
      if (!where) continue;
      const found = count(table.name, where);
      if (found > 0) violations[`${table.name}.${column.name}`] = found;
    }
  }

  const nonBase62PublicIds: CountMap = {};
  for (const table of ['generated_outputs', 'publication_records', 'print_jobs']) {
    const found = count(table, `public_id NOT GLOB '${PUBLIC_ID_GLOB}'`);
    if (found > 0) nonBase62PublicIds[table] = found;
  }
  return { ok: Object.keys(violations).length === 0, violations, nonBase62PublicIds };
}
