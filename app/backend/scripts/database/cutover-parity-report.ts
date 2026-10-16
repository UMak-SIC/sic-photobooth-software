import { LEGACY_TABLES } from './lib/import-schema.js';
import type { ParityReport } from './validate-postgres-sqlite-parity.js';

/**
 * Reads the report written by `db:validate-parity` (validate-postgres-sqlite-parity.ts,
 * `ParityReport`, `reportVersion: 1`) and extracts what the cutover gate needs.
 *
 * Fail-closed: any other tool, version, or shape is a problem. The report counts
 * as failed unless `status` is `"pass"` with no mismatches, and every legacy table
 * must have an `ok` entry whose source and SQLite counts agree.
 */
export interface CutoverParityExpectations {
  /** Per-table SQLite row counts the parity gate validated. */
  expectedCounts: Record<string, number>;
  reportRecordsFailure: boolean;
  /** SHA-256 of the candidate file after parity validation (`sqlite.sha256After`). */
  candidateSha256?: string;
  /** Allowlisted retired legacy migrations the parity gate saw in the source ledger. */
  retiredSourceMigrations: string[];
  problems: string[];
}

export const PARITY_REPORT_TOOL: ParityReport['tool'] = 'validate-postgres-sqlite-parity';
export const PARITY_REPORT_VERSION: ParityReport['reportVersion'] = 1;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function parseCutoverParityReport(report: unknown): CutoverParityExpectations {
  const problems: string[] = [];
  const expectedCounts: Record<string, number> = {};
  const result: CutoverParityExpectations = {
    expectedCounts,
    reportRecordsFailure: true,
    retiredSourceMigrations: [],
    problems,
  };
  if (!isRecord(report)) {
    problems.push('Parity report is not a JSON object.');
    return result;
  }
  if (report.tool !== PARITY_REPORT_TOOL || report.reportVersion !== PARITY_REPORT_VERSION) {
    problems.push(
      `Parity report is not a ${PARITY_REPORT_TOOL} report version ${PARITY_REPORT_VERSION}.`,
    );
    return result;
  }

  const mismatches = isStringArray(report.mismatches) ? report.mismatches : undefined;
  if (!mismatches) problems.push('Parity report has no "mismatches" list.');
  result.reportRecordsFailure = report.status !== 'pass' || (mismatches?.length ?? 1) > 0;

  const sqlite = isRecord(report.sqlite) ? report.sqlite : {};
  if (typeof sqlite.sha256After === 'string' && /^[0-9a-f]{64}$/.test(sqlite.sha256After)) {
    result.candidateSha256 = sqlite.sha256After;
  } else {
    problems.push('Parity report has no candidate checksum ("sqlite.sha256After").');
  }

  const ledger = isRecord(report.migrationLedger) ? report.migrationLedger : undefined;
  if (ledger?.ok !== true) problems.push('Parity report does not record a passing source ledger.');
  else if (isStringArray(ledger.retired)) result.retiredSourceMigrations = ledger.retired;

  const tables = isRecord(report.tables) ? report.tables : undefined;
  if (!tables) {
    problems.push('Parity report has no "tables" object.');
    return result;
  }
  for (const { name } of LEGACY_TABLES) {
    const entry = tables[name];
    if (!isRecord(entry)) {
      problems.push(`Parity report has no entry for "${name}".`);
      continue;
    }
    if (entry.ok !== true) {
      problems.push(`Parity report records a failure for "${name}".`);
      continue;
    }
    if (!isCount(entry.sourceCount) || !isCount(entry.sqliteCount)) {
      problems.push(`Parity entry for "${name}" has no numeric counts.`);
    } else if (entry.sourceCount !== entry.sqliteCount) {
      problems.push(`Parity report records a count mismatch for "${name}".`);
    } else {
      expectedCounts[name] = entry.sqliteCount;
    }
  }
  const known = new Set(LEGACY_TABLES.map((table) => table.name));
  for (const name of Object.keys(tables)) {
    if (!known.has(name)) problems.push(`Parity report contains unknown table "${name}".`);
  }
  return result;
}
