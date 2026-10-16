import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// The legacy engine is exercised only through mocks; no test may reach PostgreSQL.
const pg = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock('../src/db/pool.js', () => ({ pool: { connect: pg.connect } }));

import { computeChecksum, findMigrationsDir, runMigrations } from '../src/db/migrations.js';

describe('PostgreSQL runtime migration runner', () => {
  // The live booth ledger still records 011, which was deleted from the repository in
  // 88644d7. The booth keeps running PostgreSQL until cutover, so startup must not refuse it.
  it('tolerates the orphan 011_storage_relative_paths.sql ledger row', async () => {
    const directory = findMigrationsDir();
    const ledger = fs
      .readdirSync(directory)
      .filter((file) => file.endsWith('.sql'))
      .map((file) => ({
        id: file,
        checksum: computeChecksum(fs.readFileSync(path.join(directory, file), 'utf8')),
      }));
    ledger.push({
      id: '011_storage_relative_paths.sql',
      checksum: '7f5da758ca231f1c4a53f4b94a1e49901366bd82a16631dd582a7b89caaaff96',
    });

    const queries: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);
        if (sql.includes('SELECT id, checksum FROM schema_migrations')) return { rows: ledger };
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    };
    pg.connect.mockResolvedValue(client);

    await expect(runMigrations()).resolves.toEqual({ applied: [], total: ledger.length - 1 });
    expect(queries.some((sql) => sql.includes('INSERT INTO schema_migrations'))).toBe(false);
    expect(client.release).toHaveBeenCalledOnce();
  });
});
