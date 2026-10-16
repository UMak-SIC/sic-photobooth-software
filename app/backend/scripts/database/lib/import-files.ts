import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const SQLITE_SIDECAR_SUFFIXES = ['-wal', '-shm', '-journal'] as const;

/** True when the module at `moduleUrl` is the script node was asked to run. */
export function isMainModule(moduleUrl: string): boolean {
  const entry = process.argv[1];
  return entry !== undefined && pathToFileURL(path.resolve(entry)).href === moduleUrl;
}

/** pnpm may forward a literal `--` separator; drop it before strict parsing. */
export function cliArguments(argv = process.argv.slice(2)): string[] {
  return argv[0] === '--' ? argv.slice(1) : argv;
}

export function sha256File(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

/** Writes operator evidence with owner-only permissions and never overwrites an earlier report. */
export function writeJsonExclusive(filePath: string, value: unknown): void {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true, mode: 0o700 });
  const fd = fs.openSync(resolved, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

export function removeSqliteFiles(databasePath: string): void {
  for (const suffix of ['', ...SQLITE_SIDECAR_SUFFIXES]) {
    fs.rmSync(`${databasePath}${suffix}`, { force: true });
  }
}
