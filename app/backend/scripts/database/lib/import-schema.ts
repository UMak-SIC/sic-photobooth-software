/**
 * The legacy PostgreSQL schema produced by migrations 001-010 and the way each
 * column maps onto the SQLite baseline. This is written by hand from the
 * migrations (never from the stale `schema.sql`) and is verified at runtime
 * against both the source catalog and the destination SQLite schema, so drift
 * on either side stops the import instead of silently dropping data.
 */

export type ColumnKind =
  'uuid' | 'text' | 'integer' | 'numeric' | 'boolean' | 'timestamp' | 'date' | 'json';

export interface ColumnSpec {
  name: string;
  kind: ColumnKind;
  nullable: boolean;
}

export interface ForeignKeySpec {
  column: string;
  references: string;
}

export interface TableSpec {
  name: string;
  columns: ColumnSpec[];
  foreignKeys: ForeignKeySpec[];
}

/** `information_schema.columns.data_type` values the migrations produce per kind. */
export const POSTGRES_DATA_TYPES: Record<ColumnKind, readonly string[]> = {
  uuid: ['uuid'],
  text: ['text', 'character varying'],
  integer: ['integer'],
  numeric: ['numeric'],
  boolean: ['boolean'],
  timestamp: ['timestamp with time zone'],
  date: ['date'],
  json: ['jsonb'],
};

function col(name: string, kind: ColumnKind, nullable = false): ColumnSpec {
  return { name, kind, nullable };
}

/** Listed in foreign-key dependency order; the importer inserts in this order. */
export const LEGACY_TABLES: readonly TableSpec[] = [
  {
    name: 'events',
    columns: [
      col('id', 'uuid'),
      col('name', 'text'),
      col('description', 'text', true),
      col('date', 'date'),
      col('operator_name', 'text'),
      col('created_at', 'timestamp'),
    ],
    foreignKeys: [],
  },
  {
    name: 'templates',
    columns: [
      col('id', 'uuid'),
      col('name', 'text'),
      col('type', 'text'),
      col('orientation', 'text'),
      col('output_width', 'integer'),
      col('output_height', 'integer'),
      col('background_path', 'text', true),
      col('cover_path', 'text', true),
      col('background_x', 'numeric'),
      col('background_y', 'numeric'),
      col('background_width', 'numeric'),
      col('background_height', 'numeric'),
      col('is_active', 'boolean'),
      col('required_capture_count', 'integer'),
      col('countdown_seconds', 'integer'),
      col('sort_order', 'integer', true),
      col('created_at', 'timestamp'),
      col('updated_at', 'timestamp'),
    ],
    foreignKeys: [],
  },
  {
    name: 'frames',
    columns: [
      col('id', 'uuid'),
      col('name', 'text'),
      col('overlay_path', 'text'),
      col('is_active', 'boolean'),
      col('created_at', 'timestamp'),
      col('updated_at', 'timestamp'),
    ],
    foreignKeys: [],
  },
  {
    name: 'template_placements',
    columns: [
      col('id', 'uuid'),
      col('template_id', 'uuid'),
      col('capture_index', 'integer'),
      col('x', 'numeric'),
      col('y', 'numeric'),
      col('width', 'numeric'),
      col('height', 'numeric'),
      col('rotation', 'numeric'),
      col('border_radius', 'numeric'),
      col('z_index', 'integer'),
      col('created_at', 'timestamp'),
    ],
    foreignKeys: [{ column: 'template_id', references: 'templates' }],
  },
  {
    name: 'template_overlays',
    columns: [
      col('id', 'uuid'),
      col('template_id', 'uuid'),
      col('label', 'text'),
      col('asset_path', 'text', true),
      col('x', 'numeric'),
      col('y', 'numeric'),
      col('width', 'numeric'),
      col('height', 'numeric'),
      col('rotation', 'numeric'),
      col('z_index', 'integer'),
      col('created_at', 'timestamp'),
    ],
    foreignKeys: [{ column: 'template_id', references: 'templates' }],
  },
  {
    name: 'sessions',
    columns: [
      col('id', 'uuid'),
      col('token', 'text'),
      col('event_id', 'uuid'),
      col('type', 'text'),
      col('state', 'text'),
      col('template_id', 'uuid', true),
      col('frame_id', 'uuid', true),
      col('template_snapshot', 'json', true),
      col('retake_count', 'integer'),
      col('is_printed', 'boolean'),
      col('copies_printed', 'integer'),
      col('created_at', 'timestamp'),
      col('last_activity_at', 'timestamp'),
      col('cancelled_at', 'timestamp', true),
    ],
    foreignKeys: [
      { column: 'event_id', references: 'events' },
      { column: 'template_id', references: 'templates' },
      { column: 'frame_id', references: 'frames' },
    ],
  },
  {
    name: 'session_captures',
    columns: [
      col('id', 'uuid'),
      col('session_id', 'uuid'),
      col('capture_index', 'integer'),
      col('file_path', 'text'),
      col('is_cover', 'boolean'),
      col('is_selected', 'boolean'),
      col('created_at', 'timestamp'),
    ],
    foreignKeys: [{ column: 'session_id', references: 'sessions' }],
  },
  {
    name: 'session_videos',
    columns: [
      col('id', 'uuid'),
      col('session_id', 'uuid'),
      col('video_index', 'integer'),
      col('file_path', 'text'),
      col('duration_seconds', 'numeric'),
      col('is_selected', 'boolean'),
      col('created_at', 'timestamp'),
    ],
    foreignKeys: [{ column: 'session_id', references: 'sessions' }],
  },
  {
    name: 'generated_outputs',
    columns: [
      col('id', 'uuid'),
      col('session_id', 'uuid'),
      col('public_id', 'text'),
      col('media_type', 'text'),
      col('file_path', 'text'),
      col('width', 'integer'),
      col('height', 'integer'),
      col('created_at', 'timestamp'),
    ],
    foreignKeys: [{ column: 'session_id', references: 'sessions' }],
  },
  {
    name: 'publication_records',
    columns: [
      col('id', 'uuid'),
      col('output_id', 'uuid'),
      col('public_id', 'text'),
      col('status', 'text'),
      col('retry_count', 'integer'),
      col('last_attempt_at', 'timestamp', true),
      col('next_attempt_at', 'timestamp', true),
      col('last_error', 'text', true),
      col('cloudinary_url', 'text', true),
      col('cloudinary_public_id', 'text', true),
      col('cloud_finalized_at', 'timestamp', true),
      col('expires_at', 'timestamp', true),
      col('created_at', 'timestamp'),
    ],
    foreignKeys: [{ column: 'output_id', references: 'generated_outputs' }],
  },
  {
    name: 'print_jobs',
    columns: [
      col('id', 'uuid'),
      col('output_id', 'uuid', true),
      col('session_id', 'uuid'),
      col('request_key', 'uuid'),
      col('artifact_path', 'text'),
      col('artifact_type', 'text'),
      col('public_id', 'text'),
      col('output_type', 'text'),
      col('printer_name', 'text'),
      col('media_size', 'text'),
      col('copies_requested', 'integer'),
      col('copies_completed', 'integer'),
      col('mode', 'text'),
      col('status', 'text'),
      col('last_error', 'text', true),
      col('last_reconciled_at', 'timestamp', true),
      col('reprint_of_id', 'uuid', true),
      col('created_at', 'timestamp'),
      col('updated_at', 'timestamp'),
    ],
    foreignKeys: [
      { column: 'output_id', references: 'generated_outputs' },
      { column: 'session_id', references: 'sessions' },
      { column: 'reprint_of_id', references: 'print_jobs' },
    ],
  },
  {
    name: 'print_job_attempts',
    columns: [
      col('id', 'uuid'),
      col('print_job_id', 'uuid'),
      col('attempt_number', 'integer'),
      col('title', 'text'),
      col('cups_job_id', 'text', true),
      col('state', 'text'),
      col('error', 'text', true),
      col('is_current', 'boolean'),
      col('superseded_at', 'timestamp', true),
      col('created_at', 'timestamp'),
      col('updated_at', 'timestamp'),
    ],
    foreignKeys: [{ column: 'print_job_id', references: 'print_jobs' }],
  },
];

/**
 * Known drift between the production catalog and migrations 001-010, left by the
 * pre-0c94d09 four-digit migrations (0002_templates created the template tables
 * before 002's `CREATE TABLE IF NOT EXISTS`, and 0004_frame_cover_paths was never
 * committed). Anything outside these entries still fails the catalog check.
 */
export interface LegacyDerivedColumn {
  table: string;
  column: string;
  /** SQL over the source row (aliased `src`) that supplies the value when the column is absent. */
  expression: string;
}

/** Columns absent from production; filled from the owning template's `created_at`. */
export const LEGACY_DERIVED_COLUMNS: readonly LegacyDerivedColumn[] = [
  {
    table: 'template_placements',
    column: 'created_at',
    expression: '(SELECT t."created_at" FROM "templates" t WHERE t."id" = src."template_id")',
  },
  {
    table: 'template_overlays',
    column: 'created_at',
    expression: '(SELECT t."created_at" FROM "templates" t WHERE t."id" = src."template_id")',
  },
];

/** Production-only columns that are not copied; the import refuses any non-null value. */
export const LEGACY_DROPPED_COLUMNS: readonly (readonly [string, string])[] = [
  ['frames', 'cover_path'],
];

export function derivedColumn(table: string, column: string): LegacyDerivedColumn | undefined {
  return LEGACY_DERIVED_COLUMNS.find((entry) => entry.table === table && entry.column === column);
}

export function isDroppedColumn(table: string, column: string): boolean {
  return LEGACY_DROPPED_COLUMNS.some(([t, c]) => t === table && c === column);
}

/** Source tables that are expected but intentionally not copied row-for-row. */
export const LEGACY_LEDGER_TABLE = 'schema_migrations';

/** Columns holding storage paths, used by the optional media-manifest check. */
export const STORED_PATH_COLUMNS: readonly (readonly [string, string])[] = [
  ['session_captures', 'file_path'],
  ['session_videos', 'file_path'],
  ['generated_outputs', 'file_path'],
  ['print_jobs', 'artifact_path'],
  ['templates', 'background_path'],
  ['templates', 'cover_path'],
  ['template_overlays', 'asset_path'],
];

export function tableSpec(name: string): TableSpec {
  const spec = LEGACY_TABLES.find((table) => table.name === name);
  if (!spec) throw new Error(`Unknown legacy table "${name}".`);
  return spec;
}

/** Quotes a trusted identifier from the static specs above. */
export function quoteIdent(identifier: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(identifier)) {
    throw new Error(`Refusing to quote unexpected identifier "${identifier}".`);
  }
  return `"${identifier}"`;
}
