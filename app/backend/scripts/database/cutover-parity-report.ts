/**
 * Extracts expected per-table row counts from a parity report JSON document.
 *
 * Accepted shapes (first match wins):
 *   { "expectedCounts": { "<table>": <n> } }
 *   { "tables": { "<table>": { "postgresCount": <n>, "sqliteCount": <n> } } }
 *   { "tables": [ { "table": "<table>", "postgresCount": <n>, "sqliteCount": <n> } ] }
 * Within a table entry, `postgresCount`, `sqliteCount`, or `count` are read; when both
 * engine counts are present they must agree. A top-level `passed: false`, `ok: false`,
 * or `status: "failed"` marks the report itself as a failed parity gate.
 */
export interface CutoverParityExpectations {
  expectedCounts: Record<string, number>;
  reportRecordsFailure: boolean;
  problems: string[];
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function countFromEntry(table: string, entry: unknown, problems: string[]): number | undefined {
  if (isCount(entry)) return entry;
  if (!isRecord(entry)) {
    problems.push(`Parity entry for "${table}" is not a count or object.`);
    return undefined;
  }
  const postgres = entry.postgresCount;
  const sqlite = entry.sqliteCount;
  if (isCount(postgres) && isCount(sqlite) && postgres !== sqlite) {
    problems.push(`Parity report records a count mismatch for "${table}".`);
    return undefined;
  }
  const count = [postgres, sqlite, entry.count].find(isCount);
  if (count === undefined) problems.push(`Parity entry for "${table}" has no numeric count.`);
  return count;
}

export function parseCutoverParityReport(report: unknown): CutoverParityExpectations {
  const problems: string[] = [];
  const expectedCounts: Record<string, number> = {};
  if (!isRecord(report)) {
    return { expectedCounts, reportRecordsFailure: false, problems: ['Parity report is not a JSON object.'] };
  }

  const reportRecordsFailure =
    report.passed === false || report.ok === false || report.status === 'failed';

  let entries: Array<[string, unknown]> = [];
  if (isRecord(report.expectedCounts)) {
    entries = Object.entries(report.expectedCounts);
  } else if (isRecord(report.tables)) {
    entries = Object.entries(report.tables);
  } else if (Array.isArray(report.tables)) {
    for (const item of report.tables) {
      const name = isRecord(item) ? (item.table ?? item.name) : undefined;
      if (typeof name === 'string') entries.push([name, item]);
      else problems.push('Parity table entry is missing a table name.');
    }
  } else {
    problems.push('Parity report has neither "expectedCounts" nor "tables".');
  }

  for (const [table, entry] of entries) {
    const count = countFromEntry(table, entry, problems);
    if (count !== undefined) expectedCounts[table] = count;
  }
  if (entries.length > 0 && Object.keys(expectedCounts).length === 0) {
    problems.push('Parity report contains no usable table counts.');
  }
  return { expectedCounts, reportRecordsFailure, problems };
}
