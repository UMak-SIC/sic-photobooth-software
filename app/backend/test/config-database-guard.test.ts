import { describe, expect, it } from 'vitest';
import { config, resolveDatabaseUrl, TEST_UNSET_DATABASE_URL } from '../src/config.js';

const env = (values: Record<string, string>) => values as NodeJS.ProcessEnv;

describe('test database guard', () => {
  it('never resolves this test run to the live booth database', () => {
    expect(new URL(config.databaseUrl).pathname).not.toBe('/photobooth');
  });

  it('falls back to an unreachable URL when DATABASE_URL is unset under test', () => {
    expect(resolveDatabaseUrl(env({ VITEST: 'true' }))).toBe(TEST_UNSET_DATABASE_URL);
    expect(resolveDatabaseUrl(env({ NODE_ENV: 'test' }))).toBe(TEST_UNSET_DATABASE_URL);
    expect(new URL(TEST_UNSET_DATABASE_URL).port).toBe('1');
  });

  it('refuses the live photobooth database under test, even when set explicitly', () => {
    for (const testEnv of [{ VITEST: 'true' }, { NODE_ENV: 'test' }]) {
      expect(() =>
        resolveDatabaseUrl(
          env({
            ...testEnv,
            DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/photobooth',
          }),
        ),
      ).toThrow(/live "photobooth" database/);
    }
  });

  it('allows a differently named test database', () => {
    const url = 'postgresql://postgres@localhost:5432/photobooth_scratch_1';
    expect(resolveDatabaseUrl(env({ VITEST: 'true', DATABASE_URL: url }))).toBe(url);
  });

  it('keeps the development default outside tests', () => {
    expect(resolveDatabaseUrl(env({ NODE_ENV: 'production' }))).toBe(
      'postgresql://postgres:postgres@localhost:5432/photobooth',
    );
  });
});
