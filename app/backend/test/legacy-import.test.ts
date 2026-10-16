import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import {
  importLegacyPostgres,
  ImportRefusedError,
} from '../scripts/database/import-legacy-postgres.js';
import {
  expectedLegacyLedger,
  RETIRED_LEGACY_MIGRATIONS,
} from '../scripts/database/lib/import-catalog.js';
import { tableSpec } from '../scripts/database/lib/import-schema.js';
import {
  buildTableSelect,
  resolveSourceTarget,
  scrubSecrets,
  SourceGuardError,
} from '../scripts/database/lib/import-source.js';
import { canonicalJson, numericToReal } from '../scripts/database/lib/import-values.js';
import {
  createFakeReader,
  fixtureCatalog,
  legacyFixture,
  temporaryDirectory,
  uuid,
} from './legacy-import-fixture.js';

const created: string[] = [];
afterEach(() => {
  for (const directory of created.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

const NO_ENV = {} as NodeJS.ProcessEnv;

function destination(): string {
  return path.join(temporaryDirectory(created), 'candidate.sqlite');
}

/** Only the published database may remain; temp files and sidecars must be gone. */
function filesIn(directory: string): string[] {
  return fs.readdirSync(directory).sort();
}

describe('legacy PostgreSQL import', () => {
  it('imports every row with canonical values in one fresh owner-only file', async () => {
    const target = destination();
    const reader = createFakeReader(legacyFixture(), { subMillisecond: 4 });
    const summary = await importLegacyPostgres({ reader, destinationPath: target, env: NO_ENV });

    expect(summary.tables).toMatchObject({
      events: 1,
      sessions: 2,
      print_jobs: 2,
      print_job_attempts: 2,
    });
    expect(summary.subMillisecondTimestampsTruncated).toBe(4);
    expect(summary.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(reader.inSnapshot).toBe(false);
    expect(filesIn(path.dirname(target))).toEqual(['candidate.sqlite']);
    expect(fs.statSync(target).mode & 0o777).toBe(0o600);

    const db = new Database(target, { readonly: true });
    try {
      expect(db.prepare('SELECT * FROM templates').get()).toMatchObject({
        is_active: 1,
        background_y: -12.5,
        background_width: 1200.25,
        sort_order: null,
        created_at: '2026-03-14T08:30:00.123Z',
      });
      const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(uuid(50)) as Record<
        string,
        unknown
      >;
      expect(session).toMatchObject({ is_printed: 1, copies_printed: 3, retake_count: 1 });
      expect(canonicalJson(JSON.parse(session.template_snapshot as string))).toBe(
        canonicalJson({ name: 'Classic Strip', placements: [{ x: 100, y: 120.5 }] }),
      );
      expect(db.prepare('SELECT duration_seconds FROM session_videos').get()).toEqual({
        duration_seconds: 6,
      });
      expect(
        db.prepare('SELECT reprint_of_id FROM print_jobs WHERE id = ?').get(uuid(100)),
      ).toEqual({
        reprint_of_id: uuid(101),
      });
      expect(
        db
          .prepare(
            'SELECT is_current, superseded_at FROM print_job_attempts ORDER BY attempt_number',
          )
          .all(),
      ).toEqual([
        { is_current: 0, superseded_at: '2026-03-14T08:31:05.000Z' },
        { is_current: 1, superseded_at: null },
      ]);
      expect(db.pragma('foreign_key_check')).toEqual([]);
    } finally {
      db.close();
    }
  });

  it('refuses an existing destination, its sidecars, and the configured application database', async () => {
    const reader = createFakeReader(legacyFixture());
    const existing = destination();
    fs.writeFileSync(existing, '');
    await expect(
      importLegacyPostgres({ reader, destinationPath: existing, env: NO_ENV }),
    ).rejects.toThrow(ImportRefusedError);
    expect(fs.readFileSync(existing, 'utf8')).toBe('');

    const withSidecar = destination();
    fs.writeFileSync(`${withSidecar}-wal`, 'x');
    await expect(
      importLegacyPostgres({ reader, destinationPath: withSidecar, env: NO_ENV }),
    ).rejects.toThrow(/already exists/);

    const configured = destination();
    await expect(
      importLegacyPostgres({
        reader,
        destinationPath: configured,
        env: { SQLITE_DATABASE_PATH: configured },
      }),
    ).rejects.toThrow(/SQLITE_DATABASE_PATH/);
    expect(fs.existsSync(configured)).toBe(false);
  });

  it.each([
    [
      'a CHECK constraint violation',
      () => {
        const tables = legacyFixture();
        tables.templates[0].countdown_seconds = 7;
        return tables;
      },
      /CHECK constraint failed/,
    ],
    [
      'a dangling foreign key detected at commit',
      () => {
        const tables = legacyFixture();
        tables.sessions[1].frame_id = uuid(999);
        return tables;
      },
      /FOREIGN KEY constraint failed/,
    ],
  ])('rolls back completely and removes the partial file on %s', async (_label, build, error) => {
    const target = destination();
    await expect(
      importLegacyPostgres({
        reader: createFakeReader(build()),
        destinationPath: target,
        env: NO_ENV,
      }),
    ).rejects.toThrow(error);
    expect(filesIn(path.dirname(target))).toEqual([]);
  });

  it('rolls back when a failure happens just before commit', async () => {
    const target = destination();
    await expect(
      importLegacyPostgres({
        reader: createFakeReader(legacyFixture()),
        destinationPath: target,
        env: NO_ENV,
        beforeCommit: (db) => {
          expect((db.prepare('SELECT count(*) AS n FROM sessions').get() as { n: number }).n).toBe(
            2,
          );
          throw new Error('simulated crash');
        },
      }),
    ).rejects.toThrow('simulated crash');
    expect(filesIn(path.dirname(target))).toEqual([]);
  });

  it('accepts retired migration 011 only with its exact allowlisted checksum', async () => {
    const [retired] = RETIRED_LEGACY_MIGRATIONS;
    expect(retired.id).toBe('011_storage_relative_paths.sql');

    const summary = await importLegacyPostgres({
      reader: createFakeReader(legacyFixture(), {
        ledger: [...expectedLegacyLedger(), retired],
      }),
      destinationPath: destination(),
      env: NO_ENV,
    });
    expect(summary.retiredSourceMigrations).toEqual(['011_storage_relative_paths.sql']);

    const wrongTarget = destination();
    await expect(
      importLegacyPostgres({
        reader: createFakeReader(legacyFixture(), {
          ledger: [...expectedLegacyLedger(), { ...retired, checksum: 'f'.repeat(64) }],
        }),
        destinationPath: wrongTarget,
        env: NO_ENV,
      }),
    ).rejects.toThrow(/Retired migration 011_storage_relative_paths\.sql checksum differs/);
    expect(filesIn(path.dirname(wrongTarget))).toEqual([]);
  });

  it('refuses a source whose migration ledger or catalog drifted before creating any file', async () => {
    const ledger = expectedLegacyLedger();
    ledger[3] = { ...ledger[3], checksum: '0'.repeat(64) };
    const ledgerTarget = destination();
    await expect(
      importLegacyPostgres({
        reader: createFakeReader(legacyFixture(), { ledger }),
        destinationPath: ledgerTarget,
        env: NO_ENV,
      }),
    ).rejects.toThrow(/checksum differs/);
    expect(filesIn(path.dirname(ledgerTarget))).toEqual([]);

    const catalog = [
      ...fixtureCatalog(),
      { table: 'sessions', column: 'surprise', dataType: 'text', nullable: true },
    ];
    await expect(
      importLegacyPostgres({
        reader: createFakeReader(legacyFixture(), { catalog }),
        destinationPath: destination(),
        env: NO_ENV,
      }),
    ).rejects.toThrow(/sessions\.surprise is not mapped/);
  });

  it('names the row and column but never the value when a source value cannot be preserved', async () => {
    const tables = legacyFixture();
    tables.template_placements[0].x = '0.12345678901234567890123';
    await expect(
      importLegacyPostgres({
        reader: createFakeReader(tables),
        destinationPath: destination(),
        env: NO_ENV,
      }),
    ).rejects.toThrow(`template_placements.x for row ${uuid(30)} cannot be represented exactly`);
  });
});

describe('legacy source guard', () => {
  it('never falls back to DATABASE_URL', () => {
    expect(() =>
      resolveSourceTarget({
        env: { DATABASE_URL: 'postgresql://postgres:secret@localhost:5432/photobooth_restore' },
      }),
    ).toThrow(/DATABASE_URL is never used/);
  });

  it('refuses the live database name and the app DATABASE_URL unless explicitly allowed', () => {
    const live = 'postgresql://postgres:secret@localhost:5432/photobooth';
    expect(() => resolveSourceTarget({ sourceUrl: live, env: {} })).toThrow(SourceGuardError);
    expect(resolveSourceTarget({ sourceUrl: live, env: {}, allowLiveSource: true }).database).toBe(
      'photobooth',
    );

    const restored = 'postgresql://postgres:secret@localhost:5432/photobooth_restore_20260314';
    expect(() =>
      resolveSourceTarget({ sourceUrl: restored, env: { DATABASE_URL: restored } }),
    ).toThrow(/application DATABASE_URL/);
    expect(resolveSourceTarget({ env: { LEGACY_DATABASE_URL: restored } })).toMatchObject({
      host: 'localhost',
      port: '5432',
      database: 'photobooth_restore_20260314',
    });
    expect(() =>
      resolveSourceTarget({ sourceUrl: 'postgresql://postgres@localhost:5432', env: {} }),
    ).toThrow(/name the restored database/);
  });

  it('scrubs passwords from messages', () => {
    const target = resolveSourceTarget({
      sourceUrl: 'postgresql://booth:s3cr3t-pass@db:5433/photobooth_restore',
      env: {},
    });
    const scrubbed = scrubSecrets(
      'failed for postgresql://booth:s3cr3t-pass@db:5433/photobooth_restore (password s3cr3t-pass)',
      target,
    );
    expect(scrubbed).not.toContain('s3cr3t-pass');
    expect(scrubSecrets('postgres://u:p@h/db')).toBe('postgres://u:***@h/db');
  });
});

describe('legacy value conversion', () => {
  it('extracts timestamps in UTC with millisecond precision and an independent epoch', () => {
    const sql = buildTableSelect(tableSpec('sessions'), true);
    expect(sql).toContain(`to_char(date_trunc('milliseconds', "created_at") AT TIME ZONE 'UTC'`);
    expect(sql).toContain('"created_at__epoch_ms"');
    expect(sql).toContain('"template_snapshot"::text');
    expect(sql).toMatch(/ORDER BY "id"$/);
  });

  it('accepts exact decimals and rejects lossy ones', () => {
    expect(numericToReal('6.00')).toBe(6);
    expect(numericToReal('-0.0')).toBe(-0);
    expect(numericToReal('1200.25')).toBe(1200.25);
    expect(() => numericToReal('NaN')).toThrow();
    expect(() => numericToReal('9007199254740993')).toThrow(/exactly/);
  });
});
