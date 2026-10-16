/**
 * Every backend test file runs against its own throwaway SQLite database and
 * storage directory. PostgreSQL is pointed at an unroutable address so no test
 * can ever reach a real (possibly production) PostgreSQL instance; tests that
 * exercise the legacy engine mock `../src/db/pool.js` explicitly.
 *
 * This module must not statically import application code: `config` reads
 * these variables when it is first loaded.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll } from 'vitest';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'photobooth-test-'));
process.env.DATABASE_URL = 'postgresql://nobody:none@127.0.0.1:1/none';
process.env.LOCAL_DATABASE_ENGINE = 'sqlite';
process.env.SQLITE_DATABASE_PATH = path.join(root, 'database', 'photobooth.sqlite');
process.env.STORAGE_DIR = path.join(root, 'storage');

type ProviderModule = typeof import('../../src/db/provider.js');
let provider: ProviderModule | undefined;

beforeAll(async () => {
  provider = await import('../../src/db/provider.js');
  if (provider.getDatabaseProvider().engine === 'sqlite') await provider.runDatabaseMigrations();
});

afterAll(async () => {
  // A test may have reset the module graph, so close both the original and current instances.
  const current = await import('../../src/db/provider.js');
  for (const instance of new Set([provider, current])) {
    await instance?.closeDatabaseProvider().catch(() => {});
  }
  fs.rmSync(root, { recursive: true, force: true });
});
