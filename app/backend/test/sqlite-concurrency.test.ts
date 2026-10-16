import crypto from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { afterEach, describe, expect, it } from 'vitest';
import { closeSqliteConnection, createSqliteConnection } from '../src/db/sqlite/connection.js';
import { seedConfirmedOutput, temporaryDatabases } from './helpers/sqlite.js';

const databases = temporaryDatabases();
afterEach(() => databases.cleanup());

function runClaimWorker(filename: string, kind: 'publication' | 'print'): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./fixtures/sqlite-claim-worker.ts', import.meta.url), {
      workerData: { filename, kind },
      execArgv: ['--import', 'tsx'],
    });
    worker.once('message', (message: { claimed?: string[]; error?: string }) =>
      message.error ? reject(new Error(message.error)) : resolve(message.claimed!),
    );
    worker.once('error', reject);
  });
}

describe('SQLite concurrency', () => {
  it('lets readers proceed while a writer holds the write lock (WAL)', async () => {
    const filename = databases.path();
    const provider = await databases.open(filename);
    const event = await provider.repository.createEvent('Reader Event', '2026-10-16', 'Op');
    const writer = createSqliteConnection(filename);
    const reader = createSqliteConnection(filename);
    try {
      writer.prepare('BEGIN IMMEDIATE').run();
      writer.prepare("UPDATE events SET operator_name = 'Pending' WHERE id = ?").run(event.id);
      // Readers see the last committed snapshot without blocking.
      expect(reader.prepare('SELECT operator_name FROM events WHERE id = ?').get(event.id)).toEqual({
        operator_name: 'Op',
      });
      expect((await provider.repository.getEventById(event.id))?.operatorName).toBe('Op');
      writer.prepare('COMMIT').run();
      expect((await provider.repository.getEventById(event.id))?.operatorName).toBe('Pending');
    } finally {
      closeSqliteConnection(writer);
      closeSqliteConnection(reader);
    }
  });

  it('serializes writers: a second writer waits, then fails cleanly at its busy timeout', async () => {
    const filename = databases.path();
    await databases.open(filename);
    const first = createSqliteConnection(filename);
    const second = createSqliteConnection(filename, { busyTimeoutMs: 50 });
    try {
      first.prepare('BEGIN IMMEDIATE').run();
      expect(() => second.prepare('BEGIN IMMEDIATE').run()).toThrow(/database is locked/);
      first.prepare('COMMIT').run();
      second.prepare('BEGIN IMMEDIATE').run();
      second.prepare('COMMIT').run();
    } finally {
      closeSqliteConnection(first);
      closeSqliteConnection(second);
    }
  });

  it('never hands the same publication to two concurrent workers', async () => {
    const filename = databases.path();
    const provider = await databases.open(filename);
    const expected = new Set<string>();
    for (let index = 0; index < 24; index++) await seedConfirmedOutput(provider.repository);
    for (const publication of await provider.repository.listPublications()) expected.add(publication.id);

    const results = await Promise.all([1, 2, 3, 4].map(() => runClaimWorker(filename, 'publication')));
    const claimed = results.flat();

    expect(new Set(claimed).size).toBe(claimed.length);
    expect(new Set(claimed)).toEqual(expected);
    const statuses = (await provider.repository.listPublications()).map((p) => p.status);
    expect(new Set(statuses)).toEqual(new Set(['in_progress']));
  }, 30_000);

  it('never hands the same print job to two concurrent workers', async () => {
    const filename = databases.path();
    const provider = await databases.open(filename);
    const expected = new Set<string>();
    for (let index = 0; index < 16; index++) {
      const { output } = await seedConfirmedOutput(provider.repository);
      const job = await provider.repository.createPrintJob({
        output,
        requestKey: crypto.randomUUID(),
        artifactPath: output.filePath,
        artifactType: 'image/png',
        printerName: 'Test',
        mediaSize: '4x6',
        copies: 1,
        mode: 'simulation',
      });
      expected.add(job!.id);
    }

    const results = await Promise.all([1, 2, 3, 4].map(() => runClaimWorker(filename, 'print')));
    const claimed = results.flat();

    expect(new Set(claimed).size).toBe(claimed.length);
    expect(new Set(claimed)).toEqual(expected);
  }, 30_000);
});
