import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { closeSqliteConnection, createSqliteConnection } from '../src/db/sqlite/connection.js';
import { runSqliteMigrations } from '../src/db/sqlite/migrations.js';
import { parseCutoverParityReport } from '../scripts/database/cutover-parity-report.js';
import { importLegacyPostgres } from '../scripts/database/import-legacy-postgres.js';
import {
  expectedLegacyLedger,
  RETIRED_LEGACY_MIGRATIONS,
} from '../scripts/database/lib/import-catalog.js';
import type { LegacyReader } from '../scripts/database/lib/import-source.js';
import { LEGACY_TABLES } from '../scripts/database/lib/import-schema.js';
import { validateParity } from '../scripts/database/validate-postgres-sqlite-parity.js';
import { createFakeReader, legacyFixture } from './legacy-import-fixture.js';
import {
  parseCutoverArgs,
  validateCutoverCandidate,
  type CutoverValidationResult,
} from '../scripts/database/validate-cutover-candidate.js';

const directories: string[] = [];
const NOW = '2026-01-01T00:00:00.000Z';

function tempPath(name: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'photobooth-cutover-'));
  directories.push(directory);
  return path.join(directory, name);
}

/** Creates a migrated, cleanly closed candidate with one event row. */
function createCandidate(seed?: (db: Database.Database) => void): string {
  const filename = tempPath('photobooth-candidate.sqlite');
  const db = createSqliteConnection(filename);
  runSqliteMigrations(db);
  db.prepare(
    "INSERT INTO events (id, name, date, operator_name, created_at) VALUES ('event-1', 'Launch', '2026-01-01', 'Operator', ?)",
  ).run(NOW);
  seed?.(db);
  closeSqliteConnection(db);
  return filename;
}

/** A candidate built by the real Phase 4 importer from the legacy fixture. */
async function importedCandidate(): Promise<string> {
  const filename = tempPath('photobooth-imported.sqlite');
  await importLegacyPostgres({ reader: createFakeReader(legacyFixture()), destinationPath: filename, env: {} });
  return filename;
}

/** Runs the real parity gate and writes its report as the CLI does (JSON on disk). */
async function writeParityReport(sqlitePath: string, reader: LegacyReader): Promise<string> {
  const report = await validateParity({ reader, sqlitePath });
  const reportPath = tempPath('parity-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report));
  return reportPath;
}

function check(result: CutoverValidationResult, name: string) {
  return result.checks.find((entry) => entry.name === name);
}

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('validateCutoverCandidate', () => {
  it('passes a clean migrated candidate and does not modify it', () => {
    const candidate = createCandidate();
    const before = fs.readFileSync(candidate);

    const result = validateCutoverCandidate({ candidatePath: candidate });

    expect(result.passed).toBe(true);
    expect(result.checks.map((entry) => entry.name)).toEqual([
      'open_read_only',
      'integrity_check',
      'foreign_key_check',
      'migration_ledger',
      'schema_objects',
    ]);
    expect(result.rowCounts.events).toBe(1);
    expect(result.rowCounts.schema_migrations).toBe(1);
    expect(result.candidate.file).toBe('photobooth-candidate.sqlite');
    expect(result.candidate.checksumCoversAllData).toBe(true);
    expect(result.candidate.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(fs.readFileSync(candidate).equals(before)).toBe(true);
    // Redaction: no directory paths or row values in the output.
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(path.dirname(candidate));
    expect(serialized).not.toContain('Launch');
  });

  it('fails a missing candidate without throwing', () => {
    const result = validateCutoverCandidate({ candidatePath: tempPath('absent.sqlite') });
    expect(result.passed).toBe(false);
    expect(check(result, 'candidate_file')?.passed).toBe(false);
  });

  it('fails when foreign keys are violated', () => {
    const candidate = createCandidate((db) => {
      db.pragma('foreign_keys = OFF');
      db.prepare(
        "INSERT INTO sessions (id, token, event_id, type, state, created_at, last_activity_at) VALUES ('s1', 't1', 'missing', 'photo_strip', 'created', ?, ?)",
      ).run(NOW, NOW);
    });
    const result = validateCutoverCandidate({ candidatePath: candidate });
    expect(result.passed).toBe(false);
    expect(check(result, 'foreign_key_check')).toEqual({
      name: 'foreign_key_check',
      passed: false,
      details: { violationsByTable: { sessions: 1 } },
    });
  });

  it('fails on a tampered migration checksum or missing ledger row', () => {
    const tampered = createCandidate((db) => {
      db.prepare('UPDATE schema_migrations SET checksum = ?').run('0'.repeat(64));
    });
    const tamperedResult = validateCutoverCandidate({ candidatePath: tampered });
    expect(tamperedResult.passed).toBe(false);
    expect(check(tamperedResult, 'migration_ledger')?.details).toMatchObject({
      checksumMismatch: ['001_current_schema.sql'],
    });

    const missing = createCandidate((db) => {
      db.prepare('DELETE FROM schema_migrations').run();
    });
    expect(check(validateCutoverCandidate({ candidatePath: missing }), 'migration_ledger')?.details).toMatchObject({
      missing: ['001_current_schema.sql'],
    });
  });

  it('fails on schema drift', () => {
    const candidate = createCandidate((db) => {
      db.exec('DROP TABLE print_job_attempts; CREATE TABLE stray (id TEXT) STRICT;');
    });
    const result = validateCutoverCandidate({ candidatePath: candidate });
    expect(result.passed).toBe(false);
    const details = check(result, 'schema_objects')?.details as { missing: string[]; unexpected: string[] };
    expect(details.missing).toContain('table:print_job_attempts');
    expect(details.unexpected).toEqual(['table:stray']);
  });

  it('accepts a passing report written by db:validate-parity and binds it to the candidate', async () => {
    const candidate = await importedCandidate();
    const reportPath = await writeParityReport(candidate, createFakeReader(legacyFixture()));

    const ok = validateCutoverCandidate({ candidatePath: candidate, parityReportPath: reportPath });
    expect(check(ok, 'parity_counts')).toEqual({
      name: 'parity_counts',
      passed: true,
      details: { tablesCompared: LEGACY_TABLES.length, candidateChecksumCompared: true },
    });
    expect(ok.passed).toBe(true);

    // Any change to the candidate after the parity gate breaks the binding.
    const db = new Database(candidate);
    db.prepare('DELETE FROM print_job_attempts').run();
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
    const changed = validateCutoverCandidate({ candidatePath: candidate, parityReportPath: reportPath });
    expect(changed.passed).toBe(false);
    expect(check(changed, 'parity_counts')?.details).toMatchObject({
      candidateChecksumMismatch: true,
      mismatches: { print_job_attempts: { expected: 2, actual: 0 } },
    });

    const unreadable = validateCutoverCandidate({ candidatePath: candidate, parityReportPath: tempPath('none.json') });
    expect(check(unreadable, 'parity_counts')).toMatchObject({ passed: false, details: { reason: 'parity report unreadable' } });
  });

  it('carries the retired-migration note and rejects a failing parity report', async () => {
    const candidate = await importedCandidate();
    const retiredReport = await writeParityReport(
      candidate,
      createFakeReader(legacyFixture(), { ledger: [...expectedLegacyLedger(), ...RETIRED_LEGACY_MIGRATIONS] }),
    );
    const retired = validateCutoverCandidate({ candidatePath: candidate, parityReportPath: retiredReport });
    expect(retired.passed).toBe(true);
    expect(check(retired, 'parity_counts')?.details).toMatchObject({
      retiredSourceMigrations: ['011_storage_relative_paths.sql'],
    });

    const failingReport = await writeParityReport(
      candidate,
      createFakeReader(legacyFixture(), { ledger: expectedLegacyLedger().slice(0, -1) }),
    );
    const failed = validateCutoverCandidate({ candidatePath: candidate, parityReportPath: failingReport });
    expect(failed.passed).toBe(false);
    expect(check(failed, 'parity_counts')?.details).toMatchObject({
      reportRecordsFailure: true,
      problems: ['Parity report does not record a passing source ledger.'],
    });
  });
});

describe('parseCutoverParityReport', () => {
  it('fails closed on foreign, failed, incomplete, or inconsistent reports', async () => {
    const candidate = await importedCandidate();
    const report = await validateParity({ reader: createFakeReader(legacyFixture()), sqlitePath: candidate });
    const passing = JSON.parse(JSON.stringify(report)) as Record<string, unknown>;
    const parsed = parseCutoverParityReport(passing);
    expect(parsed.problems).toEqual([]);
    expect(parsed.reportRecordsFailure).toBe(false);
    expect(parsed.candidateSha256).toBe(report.sqlite.sha256After);

    expect(parseCutoverParityReport([]).problems).toEqual(['Parity report is not a JSON object.']);
    expect(parseCutoverParityReport({ expectedCounts: { events: 1 } })).toMatchObject({
      reportRecordsFailure: true,
      problems: ['Parity report is not a validate-postgres-sqlite-parity report version 1.'],
    });
    expect(parseCutoverParityReport({ ...passing, status: 'fail' }).reportRecordsFailure).toBe(true);
    expect(parseCutoverParityReport({ ...passing, mismatches: ['x'] }).reportRecordsFailure).toBe(true);

    const tables = { ...(passing.tables as Record<string, Record<string, unknown>>) };
    delete tables.print_jobs;
    tables.events = { ...tables.events, sqliteCount: (tables.events.sourceCount as number) + 1 };
    tables.stray = { ok: true, sourceCount: 0, sqliteCount: 0 };
    expect(parseCutoverParityReport({ ...passing, tables }).problems).toEqual([
      'Parity report records a count mismatch for "events".',
      'Parity report has no entry for "print_jobs".',
      'Parity report contains unknown table "stray".',
    ]);
  });
});

describe('parseCutoverArgs', () => {
  it('requires a candidate and rejects unknown flags', () => {
    expect(parseCutoverArgs(['--', '--candidate', 'a.sqlite', '--parity-report', 'r.json'])).toEqual({
      candidatePath: path.resolve('a.sqlite'),
      parityReportPath: path.resolve('r.json'),
    });
    expect(parseCutoverArgs([])).toBeNull();
    expect(parseCutoverArgs(['--candidate'])).toBeNull();
    expect(parseCutoverArgs(['--candidate', 'a', '--write'])).toBeNull();
  });
});
