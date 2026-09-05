import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PoolClient } from 'pg';
import { pool } from './pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface MigrationSummary {
  applied: string[];
  total: number;
}

/**
 * Resolves the absolute path to the migrations directory.
 */
export function findMigrationsDir(): string {
  const candidatePaths = [
    path.resolve(__dirname, 'migrations'),
    path.resolve(__dirname, '../../src/db/migrations'),
    path.resolve(process.cwd(), 'src/db/migrations'),
    path.resolve(process.cwd(), 'app/backend/src/db/migrations'),
    path.resolve(process.cwd(), 'app/backend/dist/db/migrations'),
  ];

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }

  throw new Error(
    `Migrations directory not found in any candidate path:\n${candidatePaths.join('\n')}`,
  );
}

/**
 * Computes a deterministic SHA-256 checksum for migration content.
 */
export function computeChecksum(content: string): string {
  // Normalize line endings before hashing to prevent CRLF vs LF drift across operating systems
  const normalized = content.replace(/\r\n/g, '\n').trim();
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/**
 * Ensures the schema_migrations tracking table exists in PostgreSQL.
 */
export async function ensureMigrationTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id VARCHAR(255) PRIMARY KEY,
      checksum VARCHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

/**
 * Retrieves already applied migrations and their checksums.
 */
export async function getAppliedMigrations(client: PoolClient): Promise<Map<string, string>> {
  const res = await client.query<{ id: string; checksum: string }>(`
    SELECT id, checksum FROM schema_migrations ORDER BY id ASC
  `);
  const applied = new Map<string, string>();
  for (const row of res.rows) {
    applied.set(row.id, row.checksum);
  }
  return applied;
}

/**
 * Runs all unapplied database migrations in sequence inside atomic transactions.
 */
export async function runMigrations(): Promise<MigrationSummary> {
  const migrationsDir = findMigrationsDir();
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  if (files.length === 0) {
    return { applied: [], total: 0 };
  }

  const client = await pool.connect();
  const newlyApplied: string[] = [];

  try {
    await ensureMigrationTable(client);
    const appliedMap = await getAppliedMigrations(client);

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sqlContent = fs.readFileSync(filePath, 'utf8');
      const checksum = computeChecksum(sqlContent);

      if (appliedMap.has(file)) {
        const existingChecksum = appliedMap.get(file);
        if (existingChecksum && existingChecksum !== checksum) {
          throw new Error(
            `Migration checksum mismatch for "${file}".\nDatabase recorded: ${existingChecksum}\nCurrent file:     ${checksum}\nMigration content was modified after execution.`,
          );
        }
        continue;
      }

      // Execute unapplied migration in an atomic transaction
      await client.query('BEGIN');
      try {
        await client.query(sqlContent);
        await client.query(
          `INSERT INTO schema_migrations (id, checksum, applied_at) VALUES ($1, $2, CURRENT_TIMESTAMP)`,
          [file, checksum],
        );
        await client.query('COMMIT');
        newlyApplied.push(file);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(
          `Failed to execute migration "${file}": ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return {
      applied: newlyApplied,
      total: files.length,
    };
  } finally {
    client.release();
  }
}
