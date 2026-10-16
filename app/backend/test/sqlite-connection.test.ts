import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { closeSqliteConnection, createSqliteConnection, type SqliteDatabase } from '../src/db/sqlite/connection.js';
import { runSqliteMigrations } from '../src/db/sqlite/migrations.js';

const temporaryDirectories: string[] = [];

function temporaryDatabasePath(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'photobooth-sqlite-'));
  temporaryDirectories.push(directory);
  return path.join(directory, 'photobooth.sqlite');
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('SQLite foundation', () => {
  it('enables durable connection pragmas and JSON functions', () => {
    const db = createSqliteConnection(temporaryDatabasePath());
    try {
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
      expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
      expect(db.pragma('synchronous', { simple: true })).toBe(2);
      expect(db.prepare("SELECT json_valid('{\"ok\":true}') AS valid").get()).toEqual({ valid: 1 });
    } finally {
      closeSqliteConnection(db);
    }
  });

  it('applies the baseline once and detects a foreign-key violation', () => {
    const db: SqliteDatabase = createSqliteConnection(temporaryDatabasePath());
    try {
      const first = runSqliteMigrations(db);
      expect(first.applied).toEqual(['001_current_schema.sql']);
      expect(runSqliteMigrations(db).applied).toEqual([]);
      expect(() =>
        db.prepare(
          "INSERT INTO sessions (id, token, event_id, type, state, retake_count, is_printed, copies_printed, created_at, last_activity_at) VALUES ('session', 'token', 'missing', 'photo_strip', 'created', 0, 0, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
        ).run(),
      ).toThrow(/FOREIGN KEY constraint failed/);
    } finally {
      closeSqliteConnection(db);
    }
  });
});
