/**
 * SQLite implementation of the admin template store contract. Row hydration
 * goes through `mapTemplate` in `mapping.ts`.
 */
import type { TemplateStore } from '../db/contracts.js';
import type { SqliteDatabase } from '../db/sqlite/connection.js';
import {
  fromBool,
  fromTimestamp,
  immediate,
  newId,
  nowTimestamp,
  registerSqliteFunctions,
  toBool,
} from '../db/sqlite/mappers.js';
import { toStoredPath } from '../services/storage-paths.js';
import { isTemplateId, mapTemplate, mergeOverlayAssetPaths, type ExistingOverlay } from './mapping.js';
import { dimensionsFor, type Template, type TemplateDraft } from './types.js';

type Row = Record<string, unknown>;

const TEMPLATE_COLUMNS = `id, name, type, orientation, output_width, output_height, background_path,
  cover_path, background_x, background_y, background_width, background_height, is_active,
  required_capture_count, sort_order, created_at, updated_at`;

type DraftWithOverlayPaths = Omit<TemplateDraft, 'overlays'> & {
  overlays: Array<TemplateDraft['overlays'][number] & { path?: string | null }>;
};

const captureCount = (draft: TemplateDraft) =>
  new Set(draft.placements.map((placement) => placement.captureIndex)).size;

export class SqliteTemplateRepository implements TemplateStore {
  constructor(private readonly db: SqliteDatabase) {
    registerSqliteFunctions(db);
  }

  private hydrate(row: Row): Template {
    const id = row.id as string;
    const placements = this.db
      .prepare(
        `SELECT id, capture_index AS captureIndex, x, y, width, height, rotation,
           border_radius AS borderRadius, z_index AS zIndex
         FROM template_placements WHERE template_id = ? ORDER BY z_index, id`,
      )
      .all(id) as Parameters<typeof mapTemplate>[1];
    const overlays = this.db
      .prepare(
        `SELECT id, label, asset_path AS path, x, y, width, height, rotation, z_index AS zIndex
         FROM template_overlays WHERE template_id = ? ORDER BY z_index, id`,
      )
      .all(id) as Parameters<typeof mapTemplate>[2];
    return mapTemplate(
      {
        ...(row as Parameters<typeof mapTemplate>[0]),
        is_active: fromBool(row.is_active as number),
        created_at: fromTimestamp(row.created_at as string),
        updated_at: fromTimestamp(row.updated_at as string),
      },
      placements,
      overlays,
    );
  }

  private row(id: string): Row | undefined {
    return this.db.prepare(`SELECT ${TEMPLATE_COLUMNS} FROM templates WHERE id = ?`).get(id) as
      | Row
      | undefined;
  }

  private changedTemplate(id: string, changes: number): Template | null {
    const row = changes > 0 ? this.row(id) : undefined;
    return row ? this.hydrate(row) : null;
  }

  public async list(type?: Template['type']): Promise<Template[]> {
    const rows = this.db
      .prepare(
        `SELECT ${TEMPLATE_COLUMNS} FROM templates
         WHERE (@type IS NULL OR type = @type)
         ORDER BY sort_order IS NULL, sort_order ASC, casefold(name) ASC, name ASC`,
      )
      .all({ type: type ?? null }) as Row[];
    return rows.map((row) => this.hydrate(row));
  }

  public async get(id: string): Promise<Template | null> {
    if (!isTemplateId(id)) return null;
    const row = this.row(id);
    return row ? this.hydrate(row) : null;
  }

  public async create(draft: TemplateDraft): Promise<Template> {
    const dimensions = dimensionsFor(draft.orientation);
    return immediate(this.db, () => {
      const id = newId();
      const now = nowTimestamp();
      this.db
        .prepare(
          `INSERT INTO templates (id, name, type, orientation, output_width, output_height, background_path,
             background_x, background_y, background_width, background_height, required_capture_count,
             created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          draft.name,
          draft.type,
          draft.orientation,
          dimensions.width,
          dimensions.height,
          draft.background.x,
          draft.background.y,
          draft.background.width,
          draft.background.height,
          captureCount(draft),
          now,
          now,
        );
      this.writeChildren(id, draft, now);
      return this.hydrate(this.row(id)!);
    });
  }

  private writeChildren(id: string, draft: DraftWithOverlayPaths, now: string): void {
    const placement = this.db.prepare(
      `INSERT INTO template_placements
         (id, template_id, capture_index, x, y, width, height, rotation, border_radius, z_index, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const p of draft.placements) {
      placement.run(
        newId(),
        id,
        p.captureIndex,
        p.x,
        p.y,
        p.width,
        p.height,
        p.rotation,
        p.borderRadius,
        p.zIndex,
        now,
      );
    }
    const overlay = this.db.prepare(
      `INSERT INTO template_overlays
         (id, template_id, label, asset_path, x, y, width, height, rotation, z_index, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const o of draft.overlays) {
      overlay.run(
        o.id ?? newId(),
        id,
        o.label,
        toStoredPath(o.path) ?? null,
        o.x,
        o.y,
        o.width,
        o.height,
        o.rotation,
        o.zIndex,
        now,
      );
    }
  }

  public async update(id: string, draft: TemplateDraft): Promise<Template | null> {
    if (!isTemplateId(id)) return null;
    const dimensions = dimensionsFor(draft.orientation);
    return immediate(this.db, () => {
      const existing = this.db
        .prepare('SELECT id, asset_path AS path FROM template_overlays WHERE template_id = ?')
        .all(id) as ExistingOverlay[];
      const overlays = mergeOverlayAssetPaths(draft.overlays, existing);
      const now = nowTimestamp();
      const changes = this.db
        .prepare(
          `UPDATE templates SET name = ?, type = ?, orientation = ?, output_width = ?, output_height = ?,
             background_x = ?, background_y = ?, background_width = ?, background_height = ?,
             required_capture_count = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(
          draft.name,
          draft.type,
          draft.orientation,
          dimensions.width,
          dimensions.height,
          draft.background.x,
          draft.background.y,
          draft.background.width,
          draft.background.height,
          captureCount(draft),
          now,
          id,
        ).changes;
      if (changes === 0) return null;
      this.db.prepare('DELETE FROM template_placements WHERE template_id = ?').run(id);
      this.db.prepare('DELETE FROM template_overlays WHERE template_id = ?').run(id);
      this.writeChildren(id, { ...draft, overlays }, now);
      return this.hydrate(this.row(id)!);
    });
  }

  public async setActive(id: string, active: boolean): Promise<Template | null> {
    const changes = this.db
      .prepare('UPDATE templates SET is_active = ?, updated_at = ? WHERE id = ?')
      .run(toBool(active), nowTimestamp(), id).changes;
    return this.changedTemplate(id, changes);
  }

  public async setBackgroundPath(id: string, path: string): Promise<Template | null> {
    const changes = this.db
      .prepare('UPDATE templates SET background_path = ?, updated_at = ? WHERE id = ?')
      .run(toStoredPath(path), nowTimestamp(), id).changes;
    return this.changedTemplate(id, changes);
  }

  public async setCoverPath(id: string, path: string): Promise<Template | null> {
    const changes = this.db
      .prepare('UPDATE templates SET cover_path = ?, updated_at = ? WHERE id = ?')
      .run(toStoredPath(path), nowTimestamp(), id).changes;
    return this.changedTemplate(id, changes);
  }

  public async reorder(orderedIds: string[]): Promise<Template[]> {
    immediate(this.db, () => {
      const statement = this.db.prepare('UPDATE templates SET sort_order = ? WHERE id = ?');
      orderedIds.forEach((id, index) => statement.run(index + 1, id));
    });
    return this.list();
  }

  public async addOverlayPath(
    id: string,
    overlayId: string,
    path: string,
  ): Promise<Template | null> {
    const changes = this.db
      .prepare('UPDATE template_overlays SET asset_path = ? WHERE template_id = ? AND id = ?')
      .run(toStoredPath(path), id, overlayId).changes;
    if (!changes) return null;
    return this.get(id);
  }

  public async delete(id: string): Promise<Template | null> {
    return immediate(this.db, () => {
      const row = isTemplateId(id) ? this.row(id) : undefined;
      if (!row) return null;
      const template = this.hydrate(row);
      this.db.prepare('DELETE FROM templates WHERE id = ?').run(id);
      return template;
    });
  }
}
