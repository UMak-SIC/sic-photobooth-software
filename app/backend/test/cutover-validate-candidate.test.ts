import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { closeSqliteConnection, createSqliteConnection } from '../src/db/sqlite/connection.js';
import { runSqliteMigrations } from '../src/db/sqlite/migrations.js';
import { parseCutoverParityReport } from '../scripts/database/cutover-parity-report.js';
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

  it('compares counts against a parity report', () => {
    const candidate = createCandidate();
    const matching = tempPath('parity.json');
    fs.writeFileSync(matching, JSON.stringify({ passed: true, tables: { events: { postgresCount: 1, sqliteCount: 1 }, sessions: 0 } }));
    const ok = validateCutoverCandidate({ candidatePath: candidate, parityReportPath: matching });
    expect(ok.passed).toBe(true);
    expect(check(ok, 'parity_counts')?.details).toEqual({ tablesCompared: 2 });

    const mismatched = tempPath('parity.json');
    fs.writeFileSync(mismatched, JSON.stringify({ expectedCounts: { events: 2, missing_table: 0 } }));
    const bad = validateCutoverCandidate({ candidatePath: candidate, parityReportPath: mismatched });
    expect(bad.passed).toBe(false);
    expect(check(bad, 'parity_counts')?.details).toMatchObject({
      mismatches: { events: { expected: 2, actual: 1 }, missing_table: { expected: 0, actual: null } },
    });

    const unreadable = validateCutoverCandidate({ candidatePath: candidate, parityReportPath: tempPath('none.json') });
    expect(check(unreadable, 'parity_counts')).toMatchObject({ passed: false, details: { reason: 'parity report unreadable' } });
  });
});

describe('parseCutoverParityReport', () => {
  it('flags failed reports, engine disagreements, and unusable shapes', () => {
    expect(parseCutoverParityReport({ status: 'failed', expectedCounts: { events: 1 } }).reportRecordsFailure).toBe(true);
    expect(
      parseCutoverParityReport({ tables: [{ table: 'events', postgresCount: 2, sqliteCount: 1 }] }).problems,
    ).toEqual(['Parity report records a count mismatch for "events".', 'Parity report contains no usable table counts.']);
    expect(parseCutoverParityReport([]).problems).toEqual(['Parity report is not a JSON object.']);
    expect(parseCutoverParityReport({}).problems).toEqual(['Parity report has neither "expectedCounts" nor "tables".']);
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
