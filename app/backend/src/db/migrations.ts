import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations(): Promise<void> {
  const schemaPath = path.resolve(__dirname, 'schema.sql');
  const migrationPath = path.resolve(__dirname, '../../migrations/0002_templates.sql');
  const sortOrderMigrationPath = path.resolve(__dirname, '../../migrations/0003_template_sort_order.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  const sortOrderMigrationSql = fs.readFileSync(sortOrderMigrationPath, 'utf8');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(schemaSql);
    await client.query(migrationSql);
    await client.query(sortOrderMigrationSql);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
