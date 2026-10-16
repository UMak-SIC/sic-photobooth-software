import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

/**
 * File paths are persisted relative to the storage directory so the database
 * survives moving the checkout or changing STORAGE_DIR.
 */
function storageRoot(): string {
  return path.resolve(config.storageDir);
}

/**
 * Converts an absolute path inside the storage directory to a storage-relative POSIX path.
 * Paths outside the storage directory are returned unchanged.
 */
export function toStoredPath<T extends string | null | undefined>(filePath: T): T {
  if (!filePath || !path.isAbsolute(filePath)) return filePath;
  const relative = path.relative(storageRoot(), filePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return filePath;
  return relative.split(path.sep).join('/') as T;
}

/**
 * Resolves a persisted path to an absolute path on disk.
 * Legacy absolute paths from a previous storage location are remapped by their `/storage/` suffix.
 */
export function resolveStoredPath<T extends string | null | undefined>(filePath: T): T {
  if (!filePath) return filePath;
  const root = storageRoot();
  if (!path.isAbsolute(filePath)) return path.resolve(root, filePath) as T;
  if (fs.existsSync(filePath)) return filePath;
  const marker = `${path.sep}storage${path.sep}`;
  const markerIndex = filePath.lastIndexOf(marker);
  if (markerIndex < 0) return filePath;
  const relocated = path.resolve(root, filePath.slice(markerIndex + marker.length));
  return (relocated.startsWith(`${root}${path.sep}`) && fs.existsSync(relocated) ? relocated : filePath) as T;
}

/** Resolves `filePath` on a repository row in place of the stored value. */
export function withResolvedFilePath<T extends { filePath: string } | undefined>(row: T): T {
  return row ? { ...row, filePath: resolveStoredPath(row.filePath) } : row;
}
