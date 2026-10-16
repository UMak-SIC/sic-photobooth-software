/**
 * Every backend test file runs against its own throwaway SQLite database and
 * storage directory; config refuses to start a test without them.
 *
 * This module must not statically import application code: `config` reads
 * these variables when it is first loaded.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll } from 'vitest';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'photobooth-test-'));
process.env.SQLITE_DATABASE_PATH = path.join(root, 'database', 'photobooth.sqlite');
process.env.STORAGE_DIR = path.join(root, 'storage');

type ProviderModule = typeof import('../../src/db/provider.js');
let provider: ProviderModule | undefined;

beforeAll(async () => {
  provider = await import('../../src/db/provider.js');
  await provider.runDatabaseMigrations();
});

afterAll(async () => {
  // A test may have reset the module graph, so close both the original and current instances.
  const current = await import('../../src/db/provider.js');
  for (const instance of new Set([provider, current])) {
    await instance?.closeDatabaseProvider().catch(() => {});
  }
  fs.rmSync(root, { recursive: true, force: true });
});
