import type { PoolClient } from 'pg';
import { resolveStoredPath, toStoredPath } from '../services/storage-paths.js';

/** Every column that persists a path inside the storage directory. */
const STORED_PATH_COLUMNS = [
  ['session_captures', 'file_path'],
  ['session_videos', 'file_path'],
  ['generated_outputs', 'file_path'],
  ['print_jobs', 'artifact_path'],
  ['templates', 'background_path'],
  ['templates', 'cover_path'],
  ['template_overlays', 'asset_path'],
] as const;

/**
 * Maps legacy absolute paths to the storage-relative form new writes use.
 * Paths that cannot be located under the current storage directory are left
 * untouched rather than guessed at.
 */
export function storedPathRewrites(paths: string[]): { from: string[]; to: string[] } {
  const from: string[] = [];
  const to: string[] = [];
  for (const original of new Set(paths)) {
    const stored = toStoredPath(resolveStoredPath(original));
    if (stored !== original) {
      from.push(original);
      to.push(stored);
    }
  }
  return { from, to };
}

/**
 * Rewrites absolute storage paths to storage-relative ones against the configured
 * STORAGE_DIR. Idempotent, so it is safe to run after every migration pass.
 */
export async function normalizeStoredPaths(client: PoolClient): Promise<number> {
  let rewritten = 0;
  await client.query('BEGIN');
  try {
    for (const [table, column] of STORED_PATH_COLUMNS) {
      const res = await client.query<{ path: string }>(
        `SELECT DISTINCT ${column} AS path FROM ${table} WHERE ${column} LIKE '/%'`,
      );
      const { from, to } = storedPathRewrites(res.rows.map((row) => row.path));
      if (from.length === 0) continue;
      const update = await client.query(
        `UPDATE ${table} AS t SET ${column} = v.stored
         FROM unnest($1::text[], $2::text[]) AS v(original, stored)
         WHERE t.${column} = v.original`,
        [from, to],
      );
      rewritten += update.rowCount ?? 0;
    }
    await client.query('COMMIT');
    return rewritten;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}
