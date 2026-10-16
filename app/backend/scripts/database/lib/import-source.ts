import pg from 'pg';
import { quoteIdent, type TableSpec } from './import-schema.js';
import type { SourceRow } from './import-values.js';

/** The production booth database name; reading it requires an explicit override. */
export const LIVE_DATABASE_NAME = 'photobooth';

export interface LegacySourceTarget {
  connectionString: string;
  host: string;
  port: string;
  database: string;
  password: string;
}

/** What a report may record about the source: never the user, password, or full URL. */
export interface RedactedSourceTarget {
  host: string;
  port: string;
  database: string;
}

export interface ResolveSourceOptions {
  sourceUrl?: string;
  allowLiveSource?: boolean;
  env?: NodeJS.ProcessEnv;
}

export class SourceGuardError extends Error {}

/**
 * Resolves the restored legacy database to read. The application's own
 * `DATABASE_URL` is deliberately never consulted as a fallback, and the live
 * booth database is refused unless the operator passes an explicit override.
 */
export function resolveSourceTarget(options: ResolveSourceOptions): LegacySourceTarget {
  const env = options.env ?? process.env;
  const connectionString = options.sourceUrl ?? env.LEGACY_DATABASE_URL;
  if (!connectionString) {
    throw new SourceGuardError(
      'Provide the restored legacy database with --source-url or LEGACY_DATABASE_URL. DATABASE_URL is never used.',
    );
  }

  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new SourceGuardError('The legacy source URL is not a valid postgres:// URL.');
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new SourceGuardError(
      'The legacy source URL must use the postgres:// or postgresql:// scheme.',
    );
  }

  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!database) {
    throw new SourceGuardError('The legacy source URL must name the restored database explicitly.');
  }

  const target: LegacySourceTarget = {
    connectionString,
    host: url.hostname || url.searchParams.get('host') || 'localhost',
    port: url.port || '5432',
    database,
    password: decodeURIComponent(url.password),
  };
  assertSourceAllowed(target.database, connectionString, options.allowLiveSource ?? false, env);
  return target;
}

export function assertSourceAllowed(
  database: string,
  connectionString: string | undefined,
  allowLiveSource: boolean,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (allowLiveSource) return;
  if (database === LIVE_DATABASE_NAME) {
    throw new SourceGuardError(
      `Refusing to read the live "${LIVE_DATABASE_NAME}" database. Restore the verified dump into a disposable database, or pass --allow-live-source during an approved, write-frozen cutover.`,
    );
  }
  if (connectionString && env.DATABASE_URL && connectionString === env.DATABASE_URL) {
    throw new SourceGuardError(
      'Refusing to read the application DATABASE_URL. Point --source-url at a restored legacy database, or pass --allow-live-source during an approved, write-frozen cutover.',
    );
  }
}

export function redactTarget(target: LegacySourceTarget): RedactedSourceTarget {
  return { host: target.host, port: target.port, database: target.database };
}

/** Removes the connection string and password from text that may reach a terminal or report. */
export function scrubSecrets(message: string, target?: LegacySourceTarget): string {
  let scrubbed = message.replace(/(postgres(?:ql)?:\/\/[^:/@\s]*:)[^@\s]*@/gi, '$1***@');
  if (target) {
    scrubbed = scrubbed.split(target.connectionString).join('<legacy-source-url>');
    if (target.password.length >= 4) scrubbed = scrubbed.split(target.password).join('***');
  }
  return scrubbed;
}

export interface MigrationLedgerRow {
  id: string;
  checksum: string;
}

export interface CatalogColumn {
  table: string;
  column: string;
  dataType: string;
  nullable: boolean;
}

/** Read-only view of a restored legacy PostgreSQL database. */
export interface LegacyReader {
  /** Starts one consistent, read-only snapshot used for every later read. */
  begin(): Promise<void>;
  end(): Promise<void>;
  currentDatabase(): Promise<string>;
  serverVersion(): Promise<string>;
  migrationLedger(): Promise<MigrationLedgerRow[]>;
  catalogColumns(): Promise<CatalogColumn[]>;
  /**
   * Returns rows ordered by id with timestamps as canonical UTC text (truncated
   * to milliseconds), dates as YYYY-MM-DD, NUMERIC and JSONB as text. With
   * `epochColumns`, each timestamp also gets an independent `<column>__epoch_ms`.
   */
  readTable(table: TableSpec, options?: { epochColumns?: boolean }): Promise<SourceRow[]>;
  /** Timestamps carrying sub-millisecond precision that the canonical format truncates. */
  subMillisecondTimestampCount(tables: readonly TableSpec[]): Promise<number>;
}

export interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

const CANONICAL_TIMESTAMP_FORMAT = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;

/** Builds the SELECT used to extract one table; exported for focused tests. */
export function buildTableSelect(table: TableSpec, epochColumns = false): string {
  const expressions = table.columns.flatMap((column) => {
    const name = quoteIdent(column.name);
    switch (column.kind) {
      case 'timestamp': {
        const truncated = `date_trunc('milliseconds', ${name})`;
        const text = `to_char(${truncated} AT TIME ZONE 'UTC', ${CANONICAL_TIMESTAMP_FORMAT}) AS ${name}`;
        if (!epochColumns) return [text];
        return [
          text,
          `(extract(epoch FROM ${truncated}) * 1000)::bigint::text AS ${quoteIdent(`${column.name}__epoch_ms`)}`,
        ];
      }
      case 'date':
        return [`to_char(${name}, 'YYYY-MM-DD') AS ${name}`];
      case 'numeric':
      case 'json':
        return [`${name}::text AS ${name}`];
      default:
        return [name];
    }
  });
  return `SELECT ${expressions.join(', ')} FROM ${quoteIdent(table.name)} ORDER BY "id"`;
}

export function createPgLegacyReader(client: Queryable): LegacyReader {
  return {
    async begin() {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    },
    async end() {
      await client.query('ROLLBACK');
    },
    async currentDatabase() {
      const result = await client.query('SELECT current_database() AS name');
      return String(result.rows[0]?.name);
    },
    async serverVersion() {
      const result = await client.query('SHOW server_version');
      return String(result.rows[0]?.server_version);
    },
    async migrationLedger() {
      const exists = await client.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'schema_migrations'`,
      );
      if (exists.rows.length === 0) return [];
      const result = await client.query('SELECT id, checksum FROM schema_migrations ORDER BY id');
      return result.rows.map((row) => ({ id: String(row.id), checksum: String(row.checksum) }));
    },
    async catalogColumns() {
      const result = await client.query(
        `SELECT table_name, column_name, data_type, is_nullable
           FROM information_schema.columns
          WHERE table_schema = current_schema()
          ORDER BY table_name, ordinal_position`,
      );
      return result.rows.map((row) => ({
        table: String(row.table_name),
        column: String(row.column_name),
        dataType: String(row.data_type),
        nullable: row.is_nullable === 'YES',
      }));
    },
    async readTable(table, options = {}) {
      const result = await client.query(buildTableSelect(table, options.epochColumns ?? false));
      return result.rows;
    },
    async subMillisecondTimestampCount(tables) {
      const checks = tables.flatMap((table) =>
        table.columns
          .filter((column) => column.kind === 'timestamp')
          .map(
            (column) =>
              `SELECT count(*) AS n FROM ${quoteIdent(table.name)} WHERE ${quoteIdent(column.name)} <> date_trunc('milliseconds', ${quoteIdent(column.name)})`,
          ),
      );
      if (checks.length === 0) return 0;
      const result = await client.query(
        `SELECT COALESCE(sum(n), 0)::text AS total FROM (${checks.join(' UNION ALL ')}) AS counts`,
      );
      return Number(result.rows[0]?.total ?? 0);
    },
  };
}

export interface OpenedLegacySource {
  reader: LegacyReader;
  serverVersion: string;
  close(): Promise<void>;
}

/** Connects to the restored legacy database and re-checks its real name before any read. */
export async function openLegacySource(
  target: LegacySourceTarget,
  allowLiveSource: boolean,
): Promise<OpenedLegacySource> {
  const client = new pg.Client({
    connectionString: target.connectionString,
    connectionTimeoutMillis: 10_000,
    application_name: 'photobooth-legacy-import',
  });
  try {
    await client.connect();
  } catch (error) {
    throw new Error(
      `Could not connect to the legacy source ${target.host}:${target.port}/${target.database}: ${scrubSecrets(error instanceof Error ? error.message : String(error), target)}`,
    );
  }
  try {
    const reader = createPgLegacyReader(client);
    const actualDatabase = await reader.currentDatabase();
    if (actualDatabase !== target.database) {
      throw new SourceGuardError(
        `Connected database "${actualDatabase}" does not match the requested "${target.database}".`,
      );
    }
    assertSourceAllowed(actualDatabase, undefined, allowLiveSource);
    const serverVersion = await reader.serverVersion();
    return { reader, serverVersion, close: () => client.end() };
  } catch (error) {
    await client.end().catch(() => undefined);
    throw error;
  }
}
