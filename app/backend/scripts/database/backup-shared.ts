import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Every artifact this tooling creates or prunes must match this exact name shape. */
export const BACKUP_FILE_PATTERN =
  /^photobooth-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.sqlite$/;
export const CHECKSUM_SUFFIX = '.sha256';
export const PRIVATE_DIRECTORY_MODE = 0o700;
export const PRIVATE_FILE_MODE = 0o600;

export function backupFileName(now: Date): string {
  // ISO-8601 in UTC with filesystem-safe separators keeps lexical order chronological.
  return `photobooth-${now.toISOString().replace(/[:.]/g, '-')}.sqlite`;
}

export function sha256File(filename: string): string {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filename, 'r');
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let bytesRead: number;
    while ((bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

/** Formats a checksum line compatible with `sha256sum --check`. */
export function checksumLine(sha256: string, filename: string): string {
  return `${sha256}  ${path.basename(filename)}\n`;
}

export function parseChecksumLine(content: string): { sha256: string; fileName: string } {
  const match = /^([0-9a-f]{64}) [ *](.+)\n?$/.exec(content);
  if (!match) throw new Error('Checksum file is not a single sha256sum line.');
  return { sha256: match[1], fileName: match[2] };
}

export function fsyncPath(target: string): void {
  const fd = fs.openSync(target, 'r');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

export class UsageError extends Error {}

export interface ParsedArgs {
  values: Map<string, string>;
  flags: Set<string>;
  positionals: string[];
}

/** Minimal `--name value` / `--flag` parser that rejects anything it does not know. */
export function parseArgs(
  argv: string[],
  valueOptions: string[],
  flagOptions: string[],
): ParsedArgs {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const positionals: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    // Package-manager separators (`pnpm db:backup -- --dest ...`) are not options.
    if (argument === '--') continue;
    if (!argument.startsWith('--')) {
      positionals.push(argument);
      continue;
    }
    const name = argument.slice(2);
    if (flagOptions.includes(name)) {
      flags.add(name);
    } else if (valueOptions.includes(name)) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--'))
        throw new UsageError(`--${name} requires a value.`);
      values.set(name, value);
      index += 1;
    } else {
      throw new UsageError(`Unknown option: ${argument}`);
    }
  }
  return { values, flags, positionals };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isDirectRun(moduleUrl: string): boolean {
  const entry = process.argv[1];
  return entry !== undefined && pathToFileURL(path.resolve(entry)).href === moduleUrl;
}
