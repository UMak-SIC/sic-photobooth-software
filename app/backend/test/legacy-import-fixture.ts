import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expectedLegacyLedger } from '../scripts/database/lib/import-catalog.js';
import { LEGACY_TABLES, POSTGRES_DATA_TYPES } from '../scripts/database/lib/import-schema.js';
import type {
  CatalogColumn,
  LegacyReader,
  MigrationLedgerRow,
} from '../scripts/database/lib/import-source.js';
import type { SourceRow } from '../scripts/database/lib/import-values.js';

/** Deterministic lowercase UUIDs; the numeric suffix keeps fixture ids readable. */
export const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const T0 = '2026-03-14T08:30:00.123Z';
const T1 = '2026-03-14T08:31:05.000Z';
const T2 = '2026-03-14T09:00:00.999Z';

/**
 * Legacy rows in the shape the PostgreSQL reader returns: timestamps and dates
 * as canonical text, NUMERIC and JSONB as text, booleans as booleans.
 */
export function legacyFixture(): Record<string, SourceRow[]> {
  return {
    events: [
      {
        id: uuid(1),
        name: 'Foundation Day',
        description: null,
        date: '2026-03-14',
        operator_name: 'Ana',
        created_at: T0,
      },
    ],
    templates: [
      {
        id: uuid(10),
        name: 'Classic Strip',
        type: 'photo_strip',
        orientation: 'portrait',
        output_width: 1200,
        output_height: 1800,
        background_path: 'templates/bg.png',
        cover_path: null,
        background_x: '0',
        background_y: '-12.50',
        background_width: '1200.25',
        background_height: '1800',
        is_active: true,
        required_capture_count: 3,
        countdown_seconds: 5,
        sort_order: null,
        created_at: T0,
        updated_at: T1,
      },
    ],
    frames: [
      {
        id: uuid(20),
        name: 'Gold',
        overlay_path: 'frames/gold.png',
        is_active: false,
        created_at: T0,
        updated_at: T0,
      },
    ],
    template_placements: [
      {
        id: uuid(30),
        template_id: uuid(10),
        capture_index: 1,
        x: '100',
        y: '120.5',
        width: '1000',
        height: '440',
        rotation: '0',
        border_radius: '8',
        z_index: 1,
        created_at: T0,
      },
    ],
    template_overlays: [
      {
        id: uuid(40),
        template_id: uuid(10),
        label: 'Logo',
        asset_path: 'templates/logo.png',
        x: '10',
        y: '20',
        width: '300',
        height: '150',
        rotation: '-3.5',
        z_index: 2,
        created_at: T0,
      },
    ],
    sessions: [
      {
        id: uuid(50),
        token: 'token-a',
        event_id: uuid(1),
        type: 'photo_strip',
        state: 'printed',
        template_id: uuid(10),
        frame_id: null,
        template_snapshot: '{"name": "Classic Strip", "placements": [{"x": 100, "y": 120.5}]}',
        retake_count: 1,
        is_printed: true,
        copies_printed: 3,
        created_at: T0,
        last_activity_at: T2,
        cancelled_at: null,
      },
      {
        id: uuid(51),
        token: 'token-b',
        event_id: uuid(1),
        type: 'flipbook',
        state: 'booth_confirmed',
        template_id: null,
        frame_id: uuid(20),
        template_snapshot: null,
        retake_count: 0,
        is_printed: false,
        copies_printed: 0,
        created_at: T1,
        last_activity_at: T1,
        cancelled_at: null,
      },
    ],
    session_captures: [
      {
        id: uuid(60),
        session_id: uuid(50),
        capture_index: 1,
        file_path: 'sessions/a/1.jpg',
        is_cover: false,
        is_selected: true,
        created_at: T0,
      },
    ],
    session_videos: [
      {
        id: uuid(70),
        session_id: uuid(51),
        video_index: 1,
        file_path: 'sessions/b/1.webm',
        duration_seconds: '6.00',
        is_selected: true,
        created_at: T1,
      },
    ],
    generated_outputs: [
      {
        id: uuid(80),
        session_id: uuid(50),
        public_id: 'Ab3dE9z',
        media_type: 'image/png',
        file_path: 'outputs/a.png',
        width: 1200,
        height: 1800,
        created_at: T1,
      },
      {
        id: uuid(81),
        session_id: uuid(51),
        public_id: 'Zz9Yy8x',
        media_type: 'image/gif',
        file_path: 'outputs/b.gif',
        width: 600,
        height: 600,
        created_at: T2,
      },
    ],
    publication_records: [
      {
        id: uuid(90),
        output_id: uuid(80),
        public_id: 'Ab3dE9z',
        status: 'uploaded',
        retry_count: 2,
        last_attempt_at: T1,
        next_attempt_at: null,
        last_error: 'timeout',
        cloudinary_url: 'https://res.example/a.png',
        cloudinary_public_id: 'booth/a',
        cloud_finalized_at: T2,
        expires_at: null,
        created_at: T1,
      },
      {
        id: uuid(91),
        output_id: uuid(81),
        public_id: 'Zz9Yy8x',
        status: 'queued',
        retry_count: 0,
        last_attempt_at: null,
        next_attempt_at: T2,
        last_error: null,
        cloudinary_url: null,
        cloudinary_public_id: null,
        cloud_finalized_at: null,
        expires_at: null,
        created_at: T2,
      },
    ],
    print_jobs: [
      // The reprint sorts before its original so the importer must order the self-reference.
      {
        id: uuid(100),
        output_id: uuid(80),
        session_id: uuid(50),
        request_key: uuid(200),
        artifact_path: 'prints/a.png',
        artifact_type: 'image/png',
        public_id: 'Ab3dE9z',
        output_type: 'photo_strip',
        printer_name: 'DNP',
        media_size: '4x6',
        copies_requested: 1,
        copies_completed: 1,
        mode: 'cups',
        status: 'completed',
        last_error: null,
        last_reconciled_at: T2,
        reprint_of_id: uuid(101),
        created_at: T2,
        updated_at: T2,
      },
      {
        id: uuid(101),
        output_id: uuid(80),
        session_id: uuid(50),
        request_key: uuid(201),
        artifact_path: 'prints/a.png',
        artifact_type: 'image/png',
        public_id: 'Ab3dE9z',
        output_type: 'photo_strip',
        printer_name: 'DNP',
        media_size: '4x6',
        copies_requested: 2,
        copies_completed: 2,
        mode: 'cups',
        status: 'completed',
        last_error: null,
        last_reconciled_at: T1,
        reprint_of_id: null,
        created_at: T1,
        updated_at: T1,
      },
    ],
    print_job_attempts: [
      {
        id: uuid(110),
        print_job_id: uuid(101),
        attempt_number: 1,
        title: 'a-1',
        cups_job_id: '17',
        state: 'failed',
        error: 'paper',
        is_current: false,
        superseded_at: T1,
        created_at: T1,
        updated_at: T1,
      },
      {
        id: uuid(111),
        print_job_id: uuid(101),
        attempt_number: 2,
        title: 'a-2',
        cups_job_id: '18',
        state: 'completed',
        error: null,
        is_current: true,
        superseded_at: null,
        created_at: T1,
        updated_at: T2,
      },
    ],
  };
}

export function fixtureCatalog(): CatalogColumn[] {
  return [
    ...LEGACY_TABLES.flatMap((table) =>
      table.columns.map((column) => ({
        table: table.name,
        column: column.name,
        dataType: POSTGRES_DATA_TYPES[column.kind][0],
        nullable: column.nullable,
      })),
    ),
    { table: 'schema_migrations', column: 'id', dataType: 'character varying', nullable: false },
  ];
}

export interface FakeReaderOptions {
  ledger?: MigrationLedgerRow[];
  catalog?: CatalogColumn[];
  subMillisecond?: number;
}

/** An in-memory stand-in for the PostgreSQL reader with the same output contract. */
export function createFakeReader(
  tables: Record<string, SourceRow[]>,
  options: FakeReaderOptions = {},
): LegacyReader & { inSnapshot: boolean } {
  const reader = {
    inSnapshot: false,
    async begin() {
      reader.inSnapshot = true;
    },
    async end() {
      reader.inSnapshot = false;
    },
    async currentDatabase() {
      return 'photobooth_scratch_fixture';
    },
    async serverVersion() {
      return 'fixture';
    },
    async migrationLedger() {
      return options.ledger ?? expectedLegacyLedger();
    },
    async catalogColumns() {
      return options.catalog ?? fixtureCatalog();
    },
    async readTable(
      table: (typeof LEGACY_TABLES)[number],
      readOptions: { epochColumns?: boolean } = {},
    ) {
      const rows = [...(tables[table.name] ?? [])].sort((a, b) =>
        String(a.id).localeCompare(String(b.id)),
      );
      if (!readOptions.epochColumns) return rows.map((row) => ({ ...row }));
      return rows.map((row) => {
        const copy: SourceRow = { ...row };
        for (const column of table.columns.filter((candidate) => candidate.kind === 'timestamp')) {
          const value = row[column.name];
          copy[`${column.name}__epoch_ms`] =
            typeof value === 'string' ? String(Date.parse(value)) : null;
        }
        return copy;
      });
    },
    async subMillisecondTimestampCount() {
      return options.subMillisecond ?? 0;
    },
  };
  return reader;
}

export function temporaryDirectory(created: string[]): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'photobooth-legacy-import-'));
  created.push(directory);
  return directory;
}
