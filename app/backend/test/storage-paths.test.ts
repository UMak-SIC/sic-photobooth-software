import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { config } from '../src/config.js';
import { storedPathRewrites } from '../src/db/normalize-storage-paths.js';
import { resolveStoredPath, toStoredPath } from '../src/services/storage-paths.js';

describe('storage paths', () => {
  const originalStorageDir = config.storageDir;
  let storageDir: string;

  beforeEach(() => {
    storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'photobooth-storage-'));
    config.storageDir = storageDir;
  });

  afterEach(() => {
    config.storageDir = originalStorageDir;
    fs.rmSync(storageDir, { recursive: true, force: true });
  });

  it('stores paths inside the storage directory relative to it', () => {
    expect(toStoredPath(path.join(storageDir, 'sessions', 's1', 'outputs', 'abc.png'))).toBe(
      'sessions/s1/outputs/abc.png',
    );
  });

  it('leaves paths outside the storage directory and empty values unchanged', () => {
    expect(toStoredPath('/elsewhere/abc.png')).toBe('/elsewhere/abc.png');
    expect(toStoredPath('templates/grid.png')).toBe('templates/grid.png');
    expect(toStoredPath(null)).toBeNull();
  });

  it('resolves relative paths against the current storage directory', () => {
    expect(resolveStoredPath('sessions/s1/outputs/abc.png')).toBe(
      path.join(storageDir, 'sessions', 's1', 'outputs', 'abc.png'),
    );
  });

  it('relocates legacy absolute paths from a previous storage directory', () => {
    const file = path.join(storageDir, 'outputs', 'abc.png');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'x');
    expect(resolveStoredPath('/old/checkout/app/storage/outputs/abc.png')).toBe(file);
  });

  it('relocates legacy paths containing a nested folder named storage', () => {
    const file = path.join(storageDir, 'events', 'storage', 'abc.png');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'x');
    expect(resolveStoredPath('/old/checkout/app/storage/events/storage/abc.png')).toBe(file);
  });

  it('rewrites legacy absolute paths to the same form new writes use', () => {
    const file = path.join(storageDir, 'events', 'storage', 'abc.png');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'x');
    const legacy = '/old/checkout/app/storage/events/storage/abc.png';
    expect(storedPathRewrites([legacy, file, legacy, '/old/storage/missing.png', 'outputs/a.png'])).toEqual({
      from: [legacy, file],
      to: ['events/storage/abc.png', 'events/storage/abc.png'],
    });
  });

  it('keeps an unresolvable legacy absolute path as-is', () => {
    expect(resolveStoredPath('/old/checkout/app/storage/outputs/missing.png')).toBe(
      '/old/checkout/app/storage/outputs/missing.png',
    );
  });
});
