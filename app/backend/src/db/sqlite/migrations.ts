import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SqliteDatabase } from './connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface SqliteMigrationSummary {
  applied: string[];
  total: number;
}

export function computeSqliteMigrationChecksum(content: string): string {
  return crypto
    .createHash('sha256')
    .update(content.replace(/\r\n/g, '\n').trim(), 'utf8')
    .digest('hex');
}

export function findSqliteMigrationsDir(): string {
  const candidates = [
    path.resolve(__dirname, 'migrations'),
    path.resolve(__dirname, '../../../src/db/sqlite/migrations'),
    path.resolve(process.cwd(), 'src/db/sqlite/migrations'),
    path.resolve(process.cwd(), 'app/backend/src/db/sqlite/migrations'),
    path.resolve(process.cwd(), 'app/backend/dist/db/sqlite/migrations'),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isDirectory());
  if (!found) throw new Error(`SQLite migrations directory not found:\n${candidates.join('\n')}`);
  return found;
}

export function runSqliteMigrations(db: SqliteDatabase): SqliteMigrationSummary {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      checksum TEXT NOT NULL CHECK (length(checksum) = 64),
      applied_at TEXT NOT NULL
    ) STRICT;
  `);

  const directory = findSqliteMigrationsDir();
  const files = fs.readdirSync(directory).filter((file) => file.endsWith('.sql')).sort();
  const applied = db.prepare('SELECT checksum FROM schema_migrations WHERE id = ?');
  const insert = db.prepare(
    'INSERT INTO schema_migrations (id, checksum, applied_at) VALUES (?, ?, ?)',
  );
  const newlyApplied: string[] = [];

  const apply = db.transaction(() => {
    for (const file of files) {
      const content = fs.readFileSync(path.join(directory, file), 'utf8');
      const checksum = computeSqliteMigrationChecksum(content);
      const recorded = applied.get(file) as { checksum: string } | undefined;
      if (recorded) {
        if (recorded.checksum !== checksum) {
          throw new Error(`SQLite migration checksum mismatch for "${file}".`);
        }
        continue;
      }
      db.exec(content);
      insert.run(file, checksum, new Date().toISOString());
      newlyApplied.push(file);
    }
  });
  apply();
  return { applied: newlyApplied, total: files.length };
}
