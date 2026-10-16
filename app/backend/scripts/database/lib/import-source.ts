import pg from 'pg';
import {
  derivedColumn,
  LEGACY_DROPPED_COLUMNS,
  quoteIdent,
  type TableSpec,
} from './import-schema.js';
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

/**
 * Builds the SELECT used to extract one table; exported for focused tests.
 * `absentColumns` names drifted columns the source lacks; each is read from its
 * {@link LEGACY_DERIVED_COLUMNS} expression instead.
 */
export function buildTableSelect(
  table: TableSpec,
  epochColumns = false,
  absentColumns: ReadonlySet<string> = new Set(),
): string {
  const expressions = table.columns.flatMap((column) => {
    let name = `src.${quoteIdent(column.name)}`;
    if (absentColumns.has(column.name)) {
      const derived = derivedColumn(table.name, column.name);
      if (!derived) throw new Error(`Source column ${table.name}.${column.name} is missing.`);
      name = derived.expression;
    }
    const alias = quoteIdent(column.name);
    switch (column.kind) {
      case 'timestamp': {
        const truncated = `date_trunc('milliseconds', ${name})`;
        const text = `to_char(${truncated} AT TIME ZONE 'UTC', ${CANONICAL_TIMESTAMP_FORMAT}) AS ${alias}`;
        if (!epochColumns) return [text];
        return [
          text,
          `(extract(epoch FROM ${truncated}) * 1000)::bigint::text AS ${quoteIdent(`${column.name}__epoch_ms`)}`,
        ];
      }
      case 'date':
        return [`to_char(${name}, 'YYYY-MM-DD') AS ${alias}`];
      case 'numeric':
      case 'json':
        return [`${name}::text AS ${alias}`];
      default:
        return [`${name} AS ${alias}`];
    }
  });
  return `SELECT ${expressions.join(', ')} FROM ${quoteIdent(table.name)} AS src ORDER BY src."id"`;
}

export function createPgLegacyReader(client: Queryable): LegacyReader {
  let catalog: Promise<CatalogColumn[]> | undefined;
  const catalogColumns = () => (catalog ??= readCatalog(client));
  const sourceColumns = async (table: string) =>
    new Set((await catalogColumns()).filter((c) => c.table === table).map((c) => c.column));
  const absentColumns = async (table: TableSpec) => {
    const present = await sourceColumns(table.name);
    return new Set(table.columns.map((c) => c.name).filter((name) => !present.has(name)));
  };

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
    catalogColumns,
    async readTable(table, options = {}) {
      const present = await sourceColumns(table.name);
      for (const [dropTable, dropColumn] of LEGACY_DROPPED_COLUMNS) {
        if (dropTable !== table.name || !present.has(dropColumn)) continue;
        const held = await client.query(
          `SELECT count(*)::text AS n FROM ${quoteIdent(dropTable)} WHERE ${quoteIdent(dropColumn)} IS NOT NULL`,
        );
        if (Number(held.rows[0]?.n ?? 0) > 0) {
          throw new Error(
            `Source column ${dropTable}.${dropColumn} holds data but has no SQLite column; refusing to drop it.`,
          );
        }
      }
      const result = await client.query(
        buildTableSelect(table, options.epochColumns ?? false, await absentColumns(table)),
      );
      return result.rows;
    },
    async subMillisecondTimestampCount(tables) {
      const absent = new Map(
        await Promise.all(tables.map(async (t) => [t.name, await absentColumns(t)] as const)),
      );
      const checks = tables.flatMap((table) =>
        table.columns
          .filter(
            (column) => column.kind === 'timestamp' && !absent.get(table.name)?.has(column.name),
          )
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

async function readCatalog(client: Queryable): Promise<CatalogColumn[]> {
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
