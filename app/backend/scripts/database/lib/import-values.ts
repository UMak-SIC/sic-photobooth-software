import type { ColumnKind, ColumnSpec, TableSpec } from './import-schema.js';

export type SqliteValue = string | number | null;
export type SourceRow = Record<string, unknown>;
export type SqliteRow = Record<string, SqliteValue>;

const CANONICAL_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CANONICAL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class ConversionError extends Error {}

export function isCanonicalTimestamp(value: string): boolean {
  if (!CANONICAL_TIMESTAMP.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

export function isCanonicalDate(value: string): boolean {
  return CANONICAL_DATE.test(value) && isCanonicalTimestamp(`${value}T00:00:00.000Z`);
}

/** Strips sign noise and insignificant zeros so decimal strings can be compared exactly. */
function normalizeDecimal(text: string): string | undefined {
  const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(text.trim());
  if (!match || (match[2] === '' && (match[3] ?? '') === '')) return undefined;
  const integer = match[2].replace(/^0+/, '') || '0';
  const fraction = (match[3] ?? '').replace(/0+$/, '');
  const magnitude = fraction ? `${integer}.${fraction}` : integer;
  return magnitude === '0' || match[1] !== '-' ? magnitude : `-${magnitude}`;
}

/**
 * Converts a PostgreSQL NUMERIC text value to a REAL, refusing any value that a
 * double cannot represent exactly so the import never silently loses precision.
 */
export function numericToReal(text: string): number {
  const expected = normalizeDecimal(text);
  const value = Number(text);
  if (expected === undefined || !Number.isFinite(value)) {
    throw new ConversionError('is not a finite decimal');
  }
  const rendered = String(value);
  if (rendered.includes('e') || normalizeDecimal(rendered) !== expected) {
    throw new ConversionError('cannot be represented exactly as a SQLite REAL');
  }
  return value;
}

/** Serializes JSON with object keys sorted so equivalent documents compare equal. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

function convertValue(kind: ColumnKind, value: unknown): SqliteValue {
  switch (kind) {
    case 'uuid':
      if (typeof value !== 'string' || !UUID.test(value)) {
        throw new ConversionError('is not a lowercase UUID');
      }
      return value;
    case 'text':
      if (typeof value !== 'string') throw new ConversionError('is not text');
      return value;
    case 'integer': {
      const number = typeof value === 'string' ? Number(value) : value;
      if (typeof number !== 'number' || !Number.isSafeInteger(number)) {
        throw new ConversionError('is not a safe integer');
      }
      return number;
    }
    case 'numeric':
      if (typeof value === 'number') return numericToReal(String(value));
      if (typeof value !== 'string') throw new ConversionError('is not a decimal');
      return numericToReal(value);
    case 'boolean':
      if (typeof value !== 'boolean') throw new ConversionError('is not a boolean');
      return value ? 1 : 0;
    case 'timestamp': {
      const text = value instanceof Date ? value.toISOString() : value;
      if (typeof text !== 'string' || !isCanonicalTimestamp(text)) {
        throw new ConversionError('is not a canonical UTC timestamp');
      }
      return text;
    }
    case 'date':
      if (typeof value !== 'string' || !isCanonicalDate(value)) {
        throw new ConversionError('is not a YYYY-MM-DD date');
      }
      return value;
    case 'json': {
      let parsed: unknown = value;
      if (typeof value === 'string') {
        try {
          parsed = JSON.parse(value);
        } catch {
          throw new ConversionError('is not valid JSON');
        }
      }
      // JSONB already dropped duplicate keys and whitespace; compact text keeps
      // the stored document byte-stable without changing its meaning.
      return JSON.stringify(parsed);
    }
  }
}

export function convertColumn(column: ColumnSpec, value: unknown): SqliteValue {
  if (value === null || value === undefined) {
    if (!column.nullable) throw new ConversionError('is NULL but the column is NOT NULL');
    return null;
  }
  return convertValue(column.kind, value);
}

/** Converts one source row; errors name the table, column, and row id but never the value. */
export function convertSourceRow(table: TableSpec, row: SourceRow): SqliteRow {
  const converted: SqliteRow = {};
  for (const column of table.columns) {
    try {
      converted[column.name] = convertColumn(column, row[column.name]);
    } catch (error) {
      if (!(error instanceof ConversionError)) throw error;
      const id = typeof row.id === 'string' ? row.id : '<unknown id>';
      throw new ConversionError(`${table.name}.${column.name} for row ${id} ${error.message}.`);
    }
  }
  return converted;
}

/**
 * The comparison form of a stored SQLite value: JSON is compared semantically and
 * everything else must be identical after conversion.
 */
export function comparableValue(column: ColumnSpec, value: SqliteValue): unknown {
  if (value === null) return null;
  if (column.kind === 'json' && typeof value === 'string') {
    try {
      return canonicalJson(JSON.parse(value));
    } catch {
      return { invalidJson: true };
    }
  }
  return value;
}
