import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { SqliteDatabase } from '../../../src/db/sqlite/connection.js';
import { quoteIdent, STORED_PATH_COLUMNS } from './import-schema.js';
import { MAX_LISTED } from './parity-checks.js';

export interface MediaOptions {
  manifestPath: string;
  storageRoot?: string;
  /** Re-hash every referenced file under `storageRoot` and compare with the manifest. */
  verifyFiles?: boolean;
}

export interface MediaReport {
  ok: boolean;
  manifestEntries: number;
  referencedPaths: number;
  missingFromManifest: string[];
  missingFromManifestCount: number;
  verifiedFiles: number;
  missingFiles: string[];
  missingFileCount: number;
  checksumMismatches: string[];
  checksumMismatchCount: number;
}

/** Storage-relative POSIX form when a path lies inside the storage root; otherwise unchanged. */
export function normalizeMediaPath(filePath: string, storageRoot?: string): string {
  let value = filePath.trim().replace(/^\.\//, '');
  if (storageRoot && path.isAbsolute(value)) {
    const relative = path.relative(path.resolve(storageRoot), value);
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) value = relative;
  }
  return value.split(path.sep).join('/');
}

/**
 * Parses `sha256sum` output (`<hex>  <path>`, optional `*` binary marker) or
 * tab-separated `<hex>\t<size>\t<path>` lines into normalized path -> checksum.
 */
export function parseMediaManifest(text: string, storageRoot?: string): Map<string, string> {
  const entries = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('#')) continue;
    const match =
      /^([0-9a-fA-F]{64})\t\d+\t(.+)$/.exec(line) ?? /^([0-9a-fA-F]{64}) [ *](.+)$/.exec(line);
    if (!match)
      throw new Error(
        'Media manifest contains a line that is not sha256sum or <sha256>\\t<size>\\t<path> format.',
      );
    entries.set(normalizeMediaPath(match[2], storageRoot), match[1].toLowerCase());
  }
  return entries;
}

function hashFile(filePath: string): string {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(1 << 20);
    let bytes: number;
    while ((bytes = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0)
      hash.update(buffer.subarray(0, bytes));
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

export function checkMedia(db: SqliteDatabase, options: MediaOptions): MediaReport {
  if (options.verifyFiles && !options.storageRoot) {
    throw new Error('--verify-media-files requires --storage-root.');
  }
  const manifest = parseMediaManifest(
    fs.readFileSync(options.manifestPath, 'utf8'),
    options.storageRoot,
  );
  const referenced = new Set<string>();
  for (const [table, column] of STORED_PATH_COLUMNS) {
    const rows = db
      .prepare(
        `SELECT DISTINCT ${quoteIdent(column)} AS p FROM ${quoteIdent(table)} WHERE ${quoteIdent(column)} IS NOT NULL`,
      )
      .all() as { p: string }[];
    for (const row of rows) referenced.add(normalizeMediaPath(row.p, options.storageRoot));
  }

  const missingFromManifest = [...referenced].filter((stored) => !manifest.has(stored)).sort();
  const missingFiles: string[] = [];
  const mismatches: string[] = [];
  let verified = 0;
  if (options.verifyFiles && options.storageRoot) {
    for (const stored of referenced) {
      const expected = manifest.get(stored);
      if (!expected) continue;
      const absolute = path.isAbsolute(stored) ? stored : path.resolve(options.storageRoot, stored);
      if (!fs.existsSync(absolute)) {
        missingFiles.push(stored);
        continue;
      }
      verified += 1;
      if (hashFile(absolute) !== expected) mismatches.push(stored);
    }
  }

  return {
    ok: missingFromManifest.length === 0 && missingFiles.length === 0 && mismatches.length === 0,
    manifestEntries: manifest.size,
    referencedPaths: referenced.size,
    missingFromManifest: missingFromManifest.slice(0, MAX_LISTED),
    missingFromManifestCount: missingFromManifest.length,
    verifiedFiles: verified,
    missingFiles: missingFiles.sort().slice(0, MAX_LISTED),
    missingFileCount: missingFiles.length,
    checksumMismatches: mismatches.sort().slice(0, MAX_LISTED),
    checksumMismatchCount: mismatches.length,
  };
}
