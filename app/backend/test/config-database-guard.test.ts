import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { config, resolveSqliteDatabasePath, resolveStorageDir } from '../src/config.js';

const env = (values: Record<string, string>) => values as NodeJS.ProcessEnv;

describe('test database guard', () => {
  it('runs this suite on a temporary database and storage directory', () => {
    expect(process.env.SQLITE_DATABASE_PATH).toBeTruthy();
    expect(config.sqliteDatabasePath).toBe(path.resolve(process.env.SQLITE_DATABASE_PATH!));
    expect(config.storageDir).toBe(process.env.STORAGE_DIR);
  });

  it('refuses an unset database path or storage directory under test', () => {
    for (const testEnv of [{ VITEST: 'true' }, { NODE_ENV: 'test' }]) {
      expect(() => resolveSqliteDatabasePath(env(testEnv))).toThrow(/booth SQLite database/);
      expect(() => resolveStorageDir(env(testEnv))).toThrow(/booth storage directory/);
    }
  });

  it('refuses the default booth files under test even when set explicitly', () => {
    const boothDatabase = resolveSqliteDatabasePath(env({ NODE_ENV: 'production' }));
    const boothStorage = resolveStorageDir(env({ NODE_ENV: 'production' }));
    expect(() =>
      resolveSqliteDatabasePath(env({ VITEST: 'true', SQLITE_DATABASE_PATH: boothDatabase })),
    ).toThrow(/booth SQLite database/);
    expect(() => resolveStorageDir(env({ VITEST: 'true', STORAGE_DIR: boothStorage }))).toThrow(
      /booth storage directory/,
    );
  });

  it('keeps the production defaults outside tests', () => {
    expect(resolveSqliteDatabasePath(env({ NODE_ENV: 'production' }))).toMatch(
      /storage[/\\]database[/\\]photobooth\.sqlite$/,
    );
    expect(
      resolveSqliteDatabasePath(env({ VITEST: 'true', SQLITE_DATABASE_PATH: '/tmp/x.sqlite' })),
    ).toBe(path.resolve('/tmp/x.sqlite'));
  });
});
