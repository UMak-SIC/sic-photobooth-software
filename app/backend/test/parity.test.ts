import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { importLegacyPostgres } from '../scripts/database/import-legacy-postgres.js';
import {
  expectedLegacyLedger,
  RETIRED_LEGACY_MIGRATIONS,
} from '../scripts/database/lib/import-catalog.js';
import { validateParity } from '../scripts/database/validate-postgres-sqlite-parity.js';
import {
  createFakeReader,
  legacyFixture,
  temporaryDirectory,
  uuid,
} from './legacy-import-fixture.js';

const created: string[] = [];
afterEach(() => {
  for (const directory of created.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

async function importedCandidate(): Promise<string> {
  const target = path.join(temporaryDirectory(created), 'candidate.sqlite');
  await importLegacyPostgres({
    reader: createFakeReader(legacyFixture()),
    destinationPath: target,
    env: {},
  });
  return target;
}

/** Simulates a damaged or hand-edited candidate. */
function tamper(sqlitePath: string, sql: string, ...params: unknown[]): void {
  const db = new Database(sqlitePath);
  try {
    db.pragma('foreign_keys = OFF');
    db.prepare(sql).run(...params);
    db.pragma('wal_checkpoint(TRUNCATE)');
  } finally {
    db.close();
  }
}

const SOURCE = { host: 'localhost', port: '5432', database: 'photobooth_scratch_fixture' };

describe('PostgreSQL to SQLite parity gate', () => {
  it('passes a faithful import and leaves the candidate unchanged', async () => {
    const sqlitePath = await importedCandidate();
    const report = await validateParity({
      reader: createFakeReader(legacyFixture(), { subMillisecond: 2 }),
      sqlitePath,
      source: SOURCE,
    });

    expect(report.mismatches).toEqual([]);
    expect(report.status).toBe('pass');
    expect(report.tables.print_jobs).toMatchObject({ ok: true, sourceCount: 2, sqliteCount: 2 });
    expect(report.sqlite.sha256Before).toBe(report.sqlite.sha256After);
    expect(report.sqliteChecks).toMatchObject({
      integrityCheck: 'ok',
      foreignKeyViolations: 0,
      reopen: { ok: true },
    });
    expect(report.aggregates?.totals.sqlite).toMatchObject({
      copiesCompleted: 3,
      sessionCopiesPrinted: 3,
      publicIds: 2,
    });
    expect(report.warnings.join(' ')).toMatch(/2 source timestamp value\(s\) carried microseconds/);
    expect(JSON.stringify(report)).not.toMatch(/token-a|password/);
  });

  it('reports row, accounting, and queue differences without leaking values', async () => {
    const sqlitePath = await importedCandidate();
    tamper(sqlitePath, 'UPDATE print_jobs SET copies_completed = 5 WHERE id = ?', uuid(101));
    tamper(sqlitePath, "UPDATE publication_records SET status = 'failed' WHERE id = ?", uuid(91));
    tamper(sqlitePath, 'DELETE FROM session_captures');
    tamper(sqlitePath, "UPDATE sessions SET token = 'stolen' WHERE id = ?", uuid(50));

    const report = await validateParity({
      reader: createFakeReader(legacyFixture()),
      sqlitePath,
      source: SOURCE,
    });

    expect(report.status).toBe('fail');
    expect(report.tables.print_jobs).toMatchObject({
      ok: false,
      mismatchedRows: [{ id: uuid(101), columns: ['copies_completed'] }],
    });
    expect(report.tables.session_captures).toMatchObject({ missingInSqlite: [uuid(60)] });
    expect(report.tables.sessions).toMatchObject({
      mismatchedRows: [{ id: uuid(50), columns: ['token'] }],
    });
    expect(report.aggregates?.printAccounting.differences).toContain('copiesCompleted');
    expect(report.aggregates?.queues.differences).toContain('publicationByStatus.failed');
    expect(JSON.stringify(report)).not.toContain('stolen');
  });

  it('treats reordered JSON keys as equal but a shifted timestamp as a mismatch', async () => {
    const sqlitePath = await importedCandidate();
    tamper(
      sqlitePath,
      'UPDATE sessions SET template_snapshot = ? WHERE id = ?',
      '{"placements":[{"y":120.5,"x":100}],"name":"Classic Strip"}',
      uuid(50),
    );
    tamper(sqlitePath, "UPDATE events SET created_at = '2026-03-14T08:30:00.124Z'");

    const report = await validateParity({
      reader: createFakeReader(legacyFixture()),
      sqlitePath,
      source: SOURCE,
    });

    expect(report.tables.sessions).toMatchObject({ ok: true });
    expect(report.tables.events).toMatchObject({
      mismatchedRows: [{ id: uuid(1), columns: ['created_at'] }],
    });
    expect(report.status).toBe('fail');
  });

  it('flags non-canonical stored timestamps and orphaned rows', async () => {
    const sqlitePath = await importedCandidate();
    tamper(sqlitePath, "UPDATE frames SET updated_at = '2026-03-14 08:30:00'");
    tamper(sqlitePath, 'UPDATE session_videos SET session_id = ?', uuid(777));

    const report = await validateParity({
      reader: createFakeReader(legacyFixture()),
      sqlitePath,
      source: SOURCE,
    });

    expect(report.constraints?.violations).toMatchObject({ 'frames.updated_at': 1 });
    expect(report.orphans).toMatchObject({
      ok: false,
      sqlite: { 'session_videos.session_id->sessions': 1 },
    });
    expect(report.sqliteChecks?.foreignKeyViolations).toBe(1);
    expect(report.status).toBe('fail');
  });

  it('fails when the source ledger does not match migrations 001-010', async () => {
    const sqlitePath = await importedCandidate();
    const ledger = expectedLegacyLedger().slice(0, -1);
    const report = await validateParity({
      reader: createFakeReader(legacyFixture(), { ledger }),
      sqlitePath,
    });
    expect(report.migrationLedger?.ok).toBe(false);
    expect(report.status).toBe('fail');
  });

  it('reports retired migration 011 with the allowlisted checksum and rejects any other', async () => {
    const sqlitePath = await importedCandidate();
    const retired = RETIRED_LEGACY_MIGRATIONS.find(
      (m) => m.id === '011_storage_relative_paths.sql',
    )!;
    const accepted = await validateParity({
      reader: createFakeReader(legacyFixture(), {
        ledger: [...expectedLegacyLedger(), retired],
      }),
      sqlitePath,
    });
    expect(accepted.migrationLedger).toEqual({
      ok: true,
      problems: [],
      retired: ['011_storage_relative_paths.sql'],
    });
    expect(accepted.warnings.some((w) => w.includes('011_storage_relative_paths.sql'))).toBe(true);

    const rejected = await validateParity({
      reader: createFakeReader(legacyFixture(), {
        ledger: [...expectedLegacyLedger(), { ...retired, checksum: '0'.repeat(64) }],
      }),
      sqlitePath,
    });
    expect(rejected.migrationLedger).toMatchObject({ ok: false, retired: [] });
    expect(rejected.status).toBe('fail');
  });

  it('checks referenced media against the manifest and optionally re-hashes files', async () => {
    const sqlitePath = await importedCandidate();
    const storageRoot = temporaryDirectory(created);
    const referenced = [
      'templates/bg.png',
      'templates/logo.png',
      'sessions/a/1.jpg',
      'sessions/b/1.webm',
      'outputs/a.png',
      'outputs/b.gif',
      'prints/a.png',
    ];
    const lines = referenced.map((relative) => {
      const absolute = path.join(storageRoot, relative);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, relative);
      const hash = crypto.createHash('sha256').update(relative).digest('hex');
      // Absolute paths inside the storage root are matched by their relative form.
      return relative === 'outputs/a.png' ? `${hash}  ${absolute}` : `${hash}  ./${relative}`;
    });
    const manifest = path.join(storageRoot, 'storage-manifest.sha256');
    fs.writeFileSync(manifest, `${lines.join('\n')}\n`);

    const passing = await validateParity({
      reader: createFakeReader(legacyFixture()),
      sqlitePath,
      media: { manifestPath: manifest, storageRoot, verifyFiles: true },
    });
    expect(passing.media).toMatchObject({ ok: true, referencedPaths: 7, verifiedFiles: 7 });
    expect(passing.status).toBe('pass');

    fs.writeFileSync(path.join(storageRoot, 'outputs/b.gif'), 'changed');
    fs.writeFileSync(
      manifest,
      `${lines.filter((line) => !line.includes('prints/a.png')).join('\n')}\n`,
    );
    const failing = await validateParity({
      reader: createFakeReader(legacyFixture()),
      sqlitePath,
      media: { manifestPath: manifest, storageRoot, verifyFiles: true },
    });
    expect(failing.media).toMatchObject({
      ok: false,
      missingFromManifest: ['prints/a.png'],
      checksumMismatches: ['outputs/b.gif'],
    });
    expect(failing.status).toBe('fail');
  });

  it('excuses an operator-accepted dangling path only while the file is absent', async () => {
    const sqlitePath = await importedCandidate();
    const storageRoot = temporaryDirectory(created);
    const referenced = [
      'templates/bg.png',
      'templates/logo.png',
      'sessions/a/1.jpg',
      'sessions/b/1.webm',
      'outputs/a.png',
      'outputs/b.gif',
    ];
    const manifest = path.join(storageRoot, 'storage-manifest.sha256');
    fs.writeFileSync(
      manifest,
      referenced
        .map(
          (relative) =>
            `${crypto.createHash('sha256').update(relative).digest('hex')}  ./${relative}`,
        )
        .join('\n'),
    );
    const run = () =>
      validateParity({
        reader: createFakeReader(legacyFixture()),
        sqlitePath,
        media: { manifestPath: manifest, storageRoot, acceptMissing: ['./prints/a.png'] },
      });

    const accepted = await run();
    expect(accepted.status).toBe('pass');
    expect(accepted.media).toMatchObject({ ok: true, acceptedMissing: ['prints/a.png'] });
    expect(accepted.warnings).toContainEqual(expect.stringContaining('prints/a.png'));

    // Once the file exists it is a real, unbacked file and must be in the manifest.
    fs.mkdirSync(path.join(storageRoot, 'prints'), { recursive: true });
    fs.writeFileSync(path.join(storageRoot, 'prints/a.png'), 'late');
    const appeared = await run();
    expect(appeared.status).toBe('fail');
    expect(appeared.media).toMatchObject({
      missingFromManifest: ['prints/a.png'],
      acceptedMissing: [],
    });
  });
});
