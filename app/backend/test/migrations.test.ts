import { describe, it, expect } from 'vitest';
import type { PoolClient } from 'pg';
import {
  findMigrationsDir,
  computeChecksum,
  ensureMigrationTable,
  getAppliedMigrations,
} from '../src/db/migrations.js';
import fs from 'node:fs';
import path from 'node:path';

describe('Versioned Database Migrations', () => {
  it('locates the migrations directory successfully', () => {
    const dir = findMigrationsDir();
    expect(fs.existsSync(dir)).toBe(true);
    expect(fs.statSync(dir).isDirectory()).toBe(true);

    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql'));
    expect(files.length).toBeGreaterThanOrEqual(1);
    expect(files).toContain('001_initial_core_schema.sql');
  });

  it('computes deterministic SHA-256 checksums normalized for line endings', () => {
    const crlfContent = 'CREATE TABLE test (\r\n  id INT\r\n);\r\n';
    const lfContent = 'CREATE TABLE test (\n  id INT\n);\n';

    const hash1 = computeChecksum(crlfContent);
    const hash2 = computeChecksum(lfContent);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('verifies 001_initial_core_schema.sql contains authoritative core tables', () => {
    const dir = findMigrationsDir();
    const schema001 = fs.readFileSync(path.join(dir, '001_initial_core_schema.sql'), 'utf8');

    expect(schema001).toContain('CREATE TABLE IF NOT EXISTS events');
    expect(schema001).toContain('CREATE TABLE IF NOT EXISTS templates');
    expect(schema001).toContain('CREATE TABLE IF NOT EXISTS frames');
    expect(schema001).toContain('CREATE TABLE IF NOT EXISTS sessions');
    expect(schema001).toContain('CREATE TABLE IF NOT EXISTS session_captures');
    expect(schema001).toContain('CREATE TABLE IF NOT EXISTS session_videos');
    expect(schema001).toContain('CREATE TABLE IF NOT EXISTS generated_outputs');
    expect(schema001).toContain('CREATE TABLE IF NOT EXISTS publication_records');
  });

  it('verifies 002_normalize_template_schema.sql defines normalized placement and overlay tables', () => {
    const dir = findMigrationsDir();
    const schema002 = fs.readFileSync(path.join(dir, '002_normalize_template_schema.sql'), 'utf8');

    expect(schema002).toContain('CREATE TABLE IF NOT EXISTS template_placements');
    expect(schema002).toContain('CREATE TABLE IF NOT EXISTS template_overlays');
    expect(schema002).toContain('ALTER TABLE templates DROP COLUMN IF EXISTS placements');
  });

  it('ensureMigrationTable and getAppliedMigrations handle mock client queries', async () => {
    const queries: string[] = [];
    const mockClient = {
      query: async (sql: string) => {
        queries.push(sql);
        if (sql.includes('SELECT id, checksum FROM schema_migrations')) {
          return {
            rows: [{ id: '001_initial_core_schema.sql', checksum: 'abc123mockhash' }],
          };
        }
        return { rows: [] };
      },
    } as unknown as PoolClient;

    await ensureMigrationTable(mockClient);
    expect(queries.some((q) => q.includes('CREATE TABLE IF NOT EXISTS schema_migrations'))).toBe(
      true,
    );

    const applied = await getAppliedMigrations(mockClient);
    expect(applied.size).toBe(1);
    expect(applied.get('001_initial_core_schema.sql')).toBe('abc123mockhash');
  });
});
