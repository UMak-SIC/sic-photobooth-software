/**
 * Proves an imported SQLite candidate matches the restored legacy PostgreSQL
 * database and writes a redacted, machine-readable report. Exits non-zero on
 * any mismatch so it can gate the cutover.
 *
 *   pnpm --filter @photobooth/backend db:validate-parity -- \
 *     --source-url "$LEGACY_DATABASE_URL" --sqlite /path/to/candidate.sqlite \
 *     --report /var/backups/.../parity-report.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import Database from 'better-sqlite3';
import {
  closeSqliteConnection,
  createSqliteConnection,
  type SqliteDatabase,
} from '../../src/db/sqlite/connection.js';
import {
  expectedLegacyLedger,
  expectedSqliteLedger,
  RETIRED_LEGACY_MIGRATIONS,
  retiredMigrationsIn,
  verifyMigrationLedger,
  verifySourceCatalog,
  verifySqliteSchema,
} from './lib/import-catalog.js';
import { cliArguments, isMainModule, sha256File, writeJsonExclusive } from './lib/import-files.js';
import { LEGACY_TABLES, quoteIdent } from './lib/import-schema.js';
import {
  openLegacySource,
  redactTarget,
  resolveSourceTarget,
  scrubSecrets,
  type LegacyReader,
  type LegacySourceTarget,
  type MigrationLedgerRow,
  type RedactedSourceTarget,
} from './lib/import-source.js';
import type { SqliteRow } from './lib/import-values.js';
import {
  compareSections,
  compareTableRows,
  readSqliteTable,
  sourceAggregates,
  sourceOrphans,
  sqliteAggregates,
  sqliteConstraints,
  sqliteOrphans,
  type ConstraintReport,
  type CountMap,
  type ParityAggregates,
  type SectionComparison,
  type TableParity,
} from './lib/parity-checks.js';
import { checkMedia, type MediaOptions, type MediaReport } from './lib/parity-media.js';

export interface ParityOptions {
  reader: LegacyReader;
  sqlitePath: string;
  source?: RedactedSourceTarget & { serverVersion?: string };
  media?: MediaOptions;
}

export interface ParityReport {
  tool: 'validate-postgres-sqlite-parity';
  reportVersion: 1;
  generatedAt: string;
  status: 'pass' | 'fail';
  mismatches: string[];
  warnings: string[];
  source?: RedactedSourceTarget & { serverVersion?: string };
  sqlite: { path: string; sizeBytes?: number; sha256Before?: string; sha256After?: string };
  /** `retired` lists allowlisted retired migrations present in the source ledger. */
  migrationLedger?: { ok: boolean; problems: string[]; retired: string[] };
  sqliteMigrationLedger?: { ok: boolean; problems: string[] };
  catalog?: { ok: boolean; problems: string[] };
  tables: Record<string, TableParity | { ok: false; error: string }>;
  orphans?: { ok: boolean; source: CountMap; sqlite: CountMap };
  constraints?: ConstraintReport;
  aggregates?: Record<keyof ParityAggregates, SectionComparison> & {
    totals: { source: Record<string, unknown>; sqlite: Record<string, unknown> };
  };
  timestampPrecision?: { subMillisecondValuesTruncated: number };
  media?: MediaReport | { ok: false; error: string };
  sqliteChecks?: {
    integrityCheck: string;
    foreignKeyViolations: number;
    reopen: { ok: boolean; problems: string[] };
  };
}

function messageOf(error: unknown): string {
  return scrubSecrets(error instanceof Error ? error.message : String(error));
}

/** Small scalar totals kept verbatim in the report as operator-readable evidence. */
function totals(aggregates: ParityAggregates): Record<string, unknown> {
  const { queues, printAccounting, relationships } = aggregates;
  return {
    publicationByStatus: queues.publicationByStatus,
    publicationRetryTotal: queues.publicationRetryTotal,
    printJobsByStatus: queues.printJobsByStatus,
    printAttemptsByState: queues.printAttemptsByState,
    printAttemptsCurrent: queues.printAttemptsCurrent,
    copiesRequested: printAccounting.copiesRequested,
    copiesCompleted: printAccounting.copiesCompleted,
    sessionCopiesPrinted: printAccounting.sessionCopiesPrinted,
    printedSessions: printAccounting.printedSessions,
    sessionsByState: relationships.sessionsByState,
    publicIds: Object.keys(aggregates.publicIds.outputs).length,
    analyticsGroups: Object.keys(aggregates.analytics).length,
  };
}

function readSqliteLedger(db: SqliteDatabase): MigrationLedgerRow[] {
  return db
    .prepare('SELECT id, checksum FROM schema_migrations ORDER BY id')
    .all() as MigrationLedgerRow[];
}

/** A fresh connection must see the same committed data the validation saw. */
function reopenCheck(
  sqlitePath: string,
  expectedCounts: Record<string, number>,
): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  const db = createSqliteConnection(sqlitePath);
  try {
    const quick = db.pragma('quick_check', { simple: true });
    if (quick !== 'ok') problems.push('quick_check failed after reopen.');
    for (const table of LEGACY_TABLES) {
      const { n } = db.prepare(`SELECT count(*) AS n FROM ${quoteIdent(table.name)}`).get() as {
        n: number;
      };
      if (n !== expectedCounts[table.name])
        problems.push(`${table.name} count changed after reopen.`);
    }
    problems.push(...verifyMigrationLedger(readSqliteLedger(db), expectedSqliteLedger()));
  } finally {
    closeSqliteConnection(db);
  }
  return { ok: problems.length === 0, problems };
}

export async function validateParity(options: ParityOptions): Promise<ParityReport> {
  const sqlitePath = path.resolve(options.sqlitePath);
  const report: ParityReport = {
    tool: 'validate-postgres-sqlite-parity',
    reportVersion: 1,
    generatedAt: new Date().toISOString(),
    status: 'fail',
    mismatches: [],
    warnings: [],
    source: options.source,
    sqlite: { path: sqlitePath },
    tables: {},
  };
  const fail = (message: string): void => {
    report.mismatches.push(message);
  };

  if (!fs.existsSync(sqlitePath)) {
    fail('SQLite candidate does not exist.');
    return report;
  }
  report.sqlite.sizeBytes = fs.statSync(sqlitePath).size;
  report.sqlite.sha256Before = sha256File(sqlitePath);

  // Validation must not change the candidate; WAL is already set by the importer.
  const db = new Database(sqlitePath, { fileMustExist: true });
  db.pragma('foreign_keys = ON');
  db.pragma('query_only = ON');
  const sourceTables = new Map<string, SqliteRow[]>();
  const sqliteCounts: Record<string, number> = {};
  try {
    await options.reader.begin();
    try {
      const sourceLedger = await options.reader.migrationLedger();
      const ledgerProblems = verifyMigrationLedger(
        sourceLedger,
        expectedLegacyLedger(),
        RETIRED_LEGACY_MIGRATIONS,
      );
      const retired = retiredMigrationsIn(sourceLedger);
      report.migrationLedger = {
        ok: ledgerProblems.length === 0,
        problems: ledgerProblems,
        retired,
      };
      ledgerProblems.forEach((problem) => fail(`ledger: ${problem}`));
      if (retired.length > 0) {
        report.warnings.push(
          `Source ledger contains retired migration(s) ${retired.join(', ')} (allowlisted by checksum).`,
        );
      }

      const catalogProblems = [
        ...verifySourceCatalog(await options.reader.catalogColumns()),
        ...verifySqliteSchema(db),
      ];
      report.catalog = { ok: catalogProblems.length === 0, problems: catalogProblems };
      catalogProblems.forEach((problem) => fail(`catalog: ${problem}`));

      for (const table of LEGACY_TABLES) {
        try {
          const sqliteRows = readSqliteTable(db, table);
          sqliteCounts[table.name] = sqliteRows.length;
          const { parity, converted } = compareTableRows(
            table,
            await options.reader.readTable(table, { epochColumns: true }),
            sqliteRows,
          );
          sourceTables.set(table.name, converted);
          report.tables[table.name] = parity;
          if (!parity.ok) {
            fail(
              `${table.name}: ${parity.missingInSqliteCount} missing, ${parity.extraInSqliteCount} extra, ${parity.mismatchedRowCount} differing row(s).`,
            );
          }
        } catch (error) {
          report.tables[table.name] = { ok: false, error: messageOf(error) };
          fail(`${table.name}: ${messageOf(error)}`);
        }
      }

      const truncated = await options.reader.subMillisecondTimestampCount(LEGACY_TABLES);
      report.timestampPrecision = { subMillisecondValuesTruncated: truncated };
      if (truncated > 0) {
        report.warnings.push(
          `${truncated} source timestamp value(s) carried microseconds; canonical UTC keeps milliseconds.`,
        );
      }
    } finally {
      await options.reader.end();
    }

    const sqliteLedgerProblems = verifyMigrationLedger(
      readSqliteLedger(db),
      expectedSqliteLedger(),
    );
    report.sqliteMigrationLedger = {
      ok: sqliteLedgerProblems.length === 0,
      problems: sqliteLedgerProblems,
    };
    sqliteLedgerProblems.forEach((problem) => fail(`sqlite ledger: ${problem}`));

    if (sourceTables.size === LEGACY_TABLES.length) {
      const orphans = { source: sourceOrphans(sourceTables), sqlite: sqliteOrphans(db) };
      const orphansOk =
        Object.values(orphans.sqlite).every((count) => count === 0) &&
        compareSections(orphans.source, orphans.sqlite).ok;
      report.orphans = { ok: orphansOk, ...orphans };
      if (!orphansOk) fail('orphans: foreign-key orphan counts are non-zero or differ.');

      const source = sourceAggregates(sourceTables);
      const sqlite = sqliteAggregates(db);
      const sections = Object.fromEntries(
        (Object.keys(source) as (keyof ParityAggregates)[]).map((key) => [
          key,
          compareSections(source[key], sqlite[key]),
        ]),
      ) as Record<keyof ParityAggregates, SectionComparison>;
      report.aggregates = {
        ...sections,
        totals: { source: totals(source), sqlite: totals(sqlite) },
      };
      for (const [key, comparison] of Object.entries(sections)) {
        if (!comparison.ok)
          fail(
            `${key}: ${comparison.differenceCount} difference(s), e.g. ${comparison.differences.slice(0, 3).join(', ')}.`,
          );
      }
    } else {
      fail('aggregates: skipped because at least one table could not be read.');
    }

    report.constraints = sqliteConstraints(db);
    if (!report.constraints.ok)
      fail('constraints: stored values violate the canonical SQLite form.');
    if (Object.keys(report.constraints.nonBase62PublicIds).length > 0) {
      report.warnings.push(
        'Some legacy public IDs are not seven base-62 characters (preserved as-is).',
      );
    }

    if (options.media) {
      try {
        report.media = checkMedia(db, options.media);
        if (!report.media.ok)
          fail('media: referenced paths are missing from the manifest or failed verification.');
      } catch (error) {
        report.media = { ok: false, error: messageOf(error) };
        fail(`media: ${messageOf(error)}`);
      }
    } else {
      report.warnings.push('Media manifest check skipped (no --media-manifest).');
    }

    const integrityCheck = String(db.pragma('integrity_check', { simple: true }));
    const foreignKeyViolations = (db.pragma('foreign_key_check') as unknown[]).length;
    if (integrityCheck !== 'ok') fail('sqlite: PRAGMA integrity_check failed.');
    if (foreignKeyViolations > 0)
      fail(`sqlite: PRAGMA foreign_key_check reported ${foreignKeyViolations} violation(s).`);
    db.close();

    const reopen = reopenCheck(sqlitePath, sqliteCounts);
    reopen.problems.forEach((problem) => fail(`reopen: ${problem}`));
    report.sqliteChecks = { integrityCheck, foreignKeyViolations, reopen };
  } catch (error) {
    fail(`validation aborted: ${messageOf(error)}`);
  } finally {
    if (db.open) db.close();
  }

  report.sqlite.sha256After = sha256File(sqlitePath);
  if (report.sqlite.sha256After !== report.sqlite.sha256Before)
    fail('sqlite: candidate file changed during validation.');
  report.status = report.mismatches.length === 0 ? 'pass' : 'fail';
  return report;
}

const USAGE = `Usage: db:validate-parity --source-url <postgres-url> --sqlite <candidate.sqlite> --report <report.json>
                         [--media-manifest <storage-manifest.sha256> [--storage-root <dir>] [--verify-media-files]]
                         [--allow-live-source]

  --source-url          Restored legacy database (or set LEGACY_DATABASE_URL). DATABASE_URL is never used.
  --sqlite              Imported SQLite candidate to validate (not modified).
  --report              New JSON report path, written with mode 0600; existing files are refused.
  --media-manifest      sha256sum-style manifest from the backup set.
  --storage-root        Storage directory used to relativize absolute paths and locate files.
  --verify-media-files  Re-hash each referenced file under --storage-root.
  --allow-live-source   Permit reading a database named "photobooth" during an approved, write-frozen cutover.`;

async function main(): Promise<number> {
  let values;
  try {
    ({ values } = parseArgs({
      args: cliArguments(),
      options: {
        'source-url': { type: 'string' },
        sqlite: { type: 'string' },
        report: { type: 'string' },
        'media-manifest': { type: 'string' },
        'storage-root': { type: 'string' },
        'verify-media-files': { type: 'boolean', default: false },
        'allow-live-source': { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
      },
    }));
  } catch (error) {
    console.error(`${messageOf(error)}\n\n${USAGE}`);
    return 2;
  }
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  if (!values.sqlite || !values.report) {
    console.error(`--sqlite and --report are required.\n\n${USAGE}`);
    return 2;
  }
  if (fs.existsSync(values.report)) {
    console.error(`Report ${values.report} already exists; choose a new path.`);
    return 2;
  }

  let target: LegacySourceTarget | undefined;
  let report: ParityReport;
  try {
    target = resolveSourceTarget({
      sourceUrl: values['source-url'],
      allowLiveSource: values['allow-live-source'],
    });
    const source = await openLegacySource(target, values['allow-live-source']);
    try {
      report = await validateParity({
        reader: source.reader,
        sqlitePath: values.sqlite,
        source: { ...redactTarget(target), serverVersion: source.serverVersion },
        media: values['media-manifest']
          ? {
              manifestPath: values['media-manifest'],
              storageRoot: values['storage-root'],
              verifyFiles: values['verify-media-files'],
            }
          : undefined,
      });
    } finally {
      await source.close();
    }
  } catch (error) {
    report = {
      tool: 'validate-postgres-sqlite-parity',
      reportVersion: 1,
      generatedAt: new Date().toISOString(),
      status: 'fail',
      mismatches: [
        `validation aborted: ${scrubSecrets(error instanceof Error ? error.message : String(error), target)}`,
      ],
      warnings: [],
      source: target ? redactTarget(target) : undefined,
      sqlite: { path: path.resolve(values.sqlite) },
      tables: {},
    };
  }

  // Scrub the serialized report as a final guard against any leaked credential.
  const serialized = scrubSecrets(JSON.stringify(report), target);
  writeJsonExclusive(values.report, JSON.parse(serialized));
  console.log(
    `Parity ${report.status.toUpperCase()}: ${report.mismatches.length} mismatch(es), ${report.warnings.length} warning(s). Report: ${path.resolve(values.report)}`,
  );
  for (const mismatch of report.mismatches.slice(0, 20)) console.log(`  - ${mismatch}`);
  return report.status === 'pass' ? 0 : 1;
}

if (isMainModule(import.meta.url)) {
  main().then((code) => {
    process.exitCode = code;
  });
}
