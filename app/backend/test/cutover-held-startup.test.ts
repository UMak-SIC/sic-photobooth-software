import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { importLegacyPostgres } from '../scripts/database/import-legacy-postgres.js';
import { closeSqliteConnection, createSqliteConnection } from '../src/db/sqlite/connection.js';
import { runSqliteMigrations } from '../src/db/sqlite/migrations.js';
import { createFakeReader, legacyFixture } from './legacy-import-fixture.js';

const workers = vi.hoisted(() => ({
  startPublishingWorker: vi.fn(),
  stopPublishingWorker: vi.fn(),
  startPrintWorker: vi.fn(),
  stopPrintWorker: vi.fn(),
}));
vi.mock('../src/services/publishing-worker.js', () => ({
  startPublishingWorker: workers.startPublishingWorker,
  stopPublishingWorker: workers.stopPublishingWorker,
}));
vi.mock('../src/services/print-worker.js', () => ({
  startPrintWorker: workers.startPrintWorker,
  stopPrintWorker: workers.stopPrintWorker,
}));

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'photobooth-held-startup-'));
const saved = { ...process.env };
afterAll(() => {
  process.env = saved;
  fs.rmSync(directory, { recursive: true, force: true });
});

const sha256 = (file: string) =>
  crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

describe('server startup with the cutover hold active', () => {
  it.each([
    ['an imported candidate', true],
    ['an empty migrated database (built-in frame and template fallbacks)', false],
  ])('starts no worker and never writes to %s', async (_label, imported) => {
    // Closed with a TRUNCATE checkpoint, so the main file holds all data.
    const candidate = path.join(directory, `candidate-${imported ? 'imported' : 'empty'}.sqlite`);
    if (imported) {
      await importLegacyPostgres({
        reader: createFakeReader(legacyFixture()),
        destinationPath: candidate,
        env: {},
      });
    } else {
      const db = createSqliteConnection(candidate);
      runSqliteMigrations(db);
      closeSqliteConnection(db);
    }
    const before = sha256(candidate);
    workers.startPublishingWorker.mockClear();
    workers.startPrintWorker.mockClear();

    process.env.LOCAL_DATABASE_ENGINE = 'sqlite';
    process.env.SQLITE_DATABASE_PATH = candidate;
    process.env.DATABASE_CUTOVER_HOLD = '1';
    process.env.HOST = '127.0.0.1';
    process.env.PORT = '0';
    vi.resetModules();
    const server = await import('../src/server.js');
    expect(server.shouldStartWorkers()).toBe(false);

    const app = await server.startServer();
    try {
      for (const url of [
        '/health',
        '/api/events',
        '/api/frames',
        '/api/templates',
        '/templates',
        '/api/publications',
        '/api/print-jobs',
        '/api/admin/analytics',
      ]) {
        const response = await app.inject({ method: 'GET', url });
        expect(response.statusCode, url).toBeLessThan(500);
      }
      const mutation = await app.inject({ method: 'POST', url: '/api/events', payload: {} });
      expect(mutation.statusCode).toBe(503);
    } finally {
      await server.stopServer(app);
    }

    expect(workers.startPublishingWorker).not.toHaveBeenCalled();
    expect(workers.startPrintWorker).not.toHaveBeenCalled();
    expect(server.CUTOVER_HOLD_WORKERS_MESSAGE).toBe(
      'Database cutover hold is active: publishing and print workers were not started.',
    );
    expect(sha256(candidate)).toBe(before);
    expect(fs.statSync(`${candidate}-wal`, { throwIfNoEntry: false })?.size ?? 0).toBe(0);
  });
});
