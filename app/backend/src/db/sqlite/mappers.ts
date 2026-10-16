/**
 * Centralized SQLite parameter serialization and row hydration.
 *
 * Storage conventions (see migrations/001_current_schema.sql):
 * - timestamps: canonical UTC `YYYY-MM-DDTHH:mm:ss.sssZ` TEXT, generated in app code,
 *   so lexical order equals chronological order;
 * - booleans: INTEGER 0/1;
 * - JSON: TEXT produced by JSON.stringify (normalized, no insignificant whitespace);
 * - identifiers: TEXT UUIDs generated with crypto.randomUUID().
 */
import crypto from 'node:crypto';
import type { SqliteDatabase } from './connection.js';

const CANONICAL_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export const newId = (): string => crypto.randomUUID();

/** Current time as a canonical timestamp string. */
export const nowTimestamp = (): string => new Date().toISOString();

export function toTimestamp(value: Date): string;
export function toTimestamp(value: Date | null | undefined): string | null;
export function toTimestamp(value: Date | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (Number.isNaN(value.getTime())) throw new RangeError('Cannot store an invalid date.');
  return value.toISOString();
}

export function fromTimestamp(value: string): Date;
export function fromTimestamp(value: string | null | undefined): Date | null;
export function fromTimestamp(value: string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  if (!CANONICAL_TIMESTAMP.test(value)) {
    throw new Error(`Non-canonical timestamp in SQLite row: ${JSON.stringify(value)}`);
  }
  return new Date(value);
}

export const toBool = (value: boolean | null | undefined): 0 | 1 => (value ? 1 : 0);

export const fromBool = (value: number | null | undefined): boolean => value === 1;

export function toJson(value: unknown): string | null {
  return value === null || value === undefined ? null : JSON.stringify(value);
}

export function fromJson<T = unknown>(value: string | null | undefined): T | null {
  return value === null || value === undefined ? null : (JSON.parse(value) as T);
}

/**
 * Unicode-aware case folding registered on every repository connection.
 * PostgreSQL `ILIKE '%term%'` is reproduced as a literal, case-insensitive
 * substring test: `instr(casefold(column), casefold(?)) > 0`. Unlike the legacy
 * query, `%` and `_` in the search term are matched literally.
 */
export function registerSqliteFunctions(db: SqliteDatabase): void {
  db.function('casefold', { deterministic: true }, (value: unknown) =>
    typeof value === 'string' ? value.toLocaleLowerCase('en-US') : value,
  );
}

/**
 * Runs `work` inside `BEGIN IMMEDIATE`, so the write lock is taken up front and
 * concurrent writers queue on `busy_timeout` instead of failing mid-transaction.
 * Any thrown error rolls the whole unit back.
 */
export function immediate<T>(db: SqliteDatabase, work: () => T): T {
  return db.transaction(work).immediate();
}
