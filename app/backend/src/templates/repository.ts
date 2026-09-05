import { pool } from '../db/pool.js';
import { dimensionsFor, type Template, type TemplateDraft } from './types.js';

type TemplateRow = {
  id: string;
  name: string;
  type: Template['type'];
  orientation: Template['orientation'];
  output_width: 1200 | 1800;
  output_height: 1200 | 1800;
  background_path: string | null;
  cover_path: string | null;
  background_x: number;
  background_y: number;
  background_width: number;
  background_height: number;
  is_active: boolean;
  required_capture_count: number;
  sort_order: number | null;
  created_at: Date;
  updated_at: Date;
};

export type ExistingOverlay = { id: string; path: string | null };

type NumericValue = number | string;
type PlacementRow = Omit<
  Template['placements'][number],
  'captureIndex' | 'x' | 'y' | 'width' | 'height' | 'rotation' | 'borderRadius' | 'zIndex'
> & {
  captureIndex: NumericValue;
  x: NumericValue;
  y: NumericValue;
  width: NumericValue;
  height: NumericValue;
  rotation: NumericValue;
  borderRadius: NumericValue;
  zIndex: NumericValue;
};
type OverlayRow = Omit<
  Template['overlays'][number],
  'x' | 'y' | 'width' | 'height' | 'rotation' | 'zIndex'
> & {
  x: NumericValue;
  y: NumericValue;
  width: NumericValue;
  height: NumericValue;
  rotation: NumericValue;
  zIndex: NumericValue;
};

export function mergeOverlayAssetPaths(
  draft: TemplateDraft['overlays'],
  existing: ExistingOverlay[],
): TemplateDraft['overlays'] & { path?: string | null }[] {
  const assets = new Map(existing.map((overlay) => [overlay.id, overlay.path]));
  return draft.map((overlay) => ({
    ...overlay,
    path: overlay.id ? (assets.get(overlay.id) ?? null) : null,
  }));
}

export function mapTemplate(
  row: TemplateRow,
  placements: PlacementRow[],
  overlays: OverlayRow[],
): Template {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    orientation: row.orientation,
    width: row.output_width,
    height: row.output_height,
    active: row.is_active,
    requiredCaptureCount: row.required_capture_count,
    backgroundPath: row.background_path,
    coverPath: row.cover_path,
    sortOrder: row.sort_order,
    background: {
      x: Number(row.background_x),
      y: Number(row.background_y),
      width: Number(row.background_width),
      height: Number(row.background_height),
    },
    placements: placements.map((placement) => ({
      ...placement,
      captureIndex: Number(placement.captureIndex),
      x: Number(placement.x),
      y: Number(placement.y),
      width: Number(placement.width),
      height: Number(placement.height),
      rotation: Number(placement.rotation),
      borderRadius: Number(placement.borderRadius),
      zIndex: Number(placement.zIndex),
    })),
    overlays: overlays.map((overlay) => ({
      ...overlay,
      x: Number(overlay.x),
      y: Number(overlay.y),
      width: Number(overlay.width),
      height: Number(overlay.height),
      rotation: Number(overlay.rotation),
      zIndex: Number(overlay.zIndex),
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const templateSelect = `
  SELECT id, name, type, orientation, output_width, output_height, background_path, cover_path,
    background_x, background_y, background_width, background_height, is_active,
    required_capture_count, sort_order, created_at, updated_at
  FROM templates`;

export const isTemplateId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

export class TemplateRepository {
  private async hydrate(row: TemplateRow): Promise<Template> {
    const [placements, overlays] = await Promise.all([
      pool.query(
        'SELECT id, capture_index AS "captureIndex", x, y, width, height, rotation, border_radius AS "borderRadius", z_index AS "zIndex" FROM template_placements WHERE template_id = $1 ORDER BY z_index, id',
        [row.id],
      ),
      pool.query(
        'SELECT id, label, asset_path AS path, x, y, width, height, rotation, z_index AS "zIndex" FROM template_overlays WHERE template_id = $1 ORDER BY z_index, id',
        [row.id],
      ),
    ]);
    return mapTemplate(row, placements.rows, overlays.rows);
  }

  public async list(type?: Template['type']): Promise<Template[]> {
    const result = await pool.query<TemplateRow>(`${templateSelect}${type ? ' WHERE type = $1' : ''} ORDER BY sort_order ASC NULLS LAST, name ASC`, type ? [type] : []);
    return Promise.all(result.rows.map((row) => this.hydrate(row)));
  }

  public async get(id: string): Promise<Template | null> {
    if (!isTemplateId(id)) return null;
    const result = await pool.query<TemplateRow>(`${templateSelect} WHERE id = $1`, [id]);
    return result.rows[0] ? this.hydrate(result.rows[0]) : null;
  }

  public async create(draft: TemplateDraft): Promise<Template> {
    const client = await pool.connect();
    const dimensions = dimensionsFor(draft.orientation);
    try {
      await client.query('BEGIN');
      const result = await client.query<TemplateRow>(
        `INSERT INTO templates (name, type, orientation, output_width, output_height, background_path, background_x, background_y, background_width, background_height, required_capture_count)
         VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8, $9, $10) RETURNING id, name, type, orientation, output_width, output_height, background_path, cover_path, background_x, background_y, background_width, background_height, is_active, required_capture_count, sort_order, created_at, updated_at`,
        [
          draft.name,
          draft.type,
          draft.orientation,
          dimensions.width,
          dimensions.height,
          draft.background.x,
          draft.background.y,
          draft.background.width,
          draft.background.height,
          new Set(draft.placements.map((p) => p.captureIndex)).size,
        ],
      );
      await this.writeChildren(client, result.rows[0].id, draft);
      await client.query('COMMIT');
      return this.hydrate(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async writeChildren(
    client: { query: (query: string, values?: unknown[]) => Promise<unknown> },
    id: string,
    draft: Omit<TemplateDraft, 'overlays'> & {
      overlays: Array<TemplateDraft['overlays'][number] & { path?: string | null }>;
    },
  ): Promise<void> {
    for (const placement of draft.placements) {
      await client.query(
        'INSERT INTO template_placements (template_id, capture_index, x, y, width, height, rotation, border_radius, z_index) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [
          id,
          placement.captureIndex,
          placement.x,
          placement.y,
          placement.width,
          placement.height,
          placement.rotation,
          placement.borderRadius,
          placement.zIndex,
        ],
      );
    }
    for (const overlay of draft.overlays) {
      await client.query(
        'INSERT INTO template_overlays (id, template_id, label, asset_path, x, y, width, height, rotation, z_index) VALUES (COALESCE($1, gen_random_uuid()),$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [
          overlay.id,
          id,
          overlay.label,
          overlay.path ?? null,
          overlay.x,
          overlay.y,
          overlay.width,
          overlay.width,
          overlay.rotation,
          overlay.zIndex,
        ],
      );
    }
  }

  public async update(id: string, draft: TemplateDraft): Promise<Template | null> {
    const client = await pool.connect();
    const dimensions = dimensionsFor(draft.orientation);
    try {
      await client.query('BEGIN');
      const existingOverlays = await client.query<ExistingOverlay>(
        'SELECT id, asset_path AS path FROM template_overlays WHERE template_id = $1',
        [id],
      );
      const overlays = mergeOverlayAssetPaths(draft.overlays, existingOverlays.rows);
      const result = await client.query<TemplateRow>(
        `UPDATE templates SET name=$2, type=$3, orientation=$4, output_width=$5, output_height=$6, background_x=$7, background_y=$8, background_width=$9, background_height=$10, required_capture_count=$11, updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING id, name, type, orientation, output_width, output_height, background_path, cover_path, background_x, background_y, background_width, background_height, is_active, required_capture_count, sort_order, created_at, updated_at`,
        [
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
          new Set(draft.placements.map((p) => p.captureIndex)).size,
        ],
      );
      if (!result.rows[0]) {
        await client.query('ROLLBACK');
        return null;
      }
      await client.query('DELETE FROM template_placements WHERE template_id = $1', [id]);
      await client.query('DELETE FROM template_overlays WHERE template_id = $1', [id]);
      await this.writeChildren(client, id, { ...draft, overlays });
      await client.query('COMMIT');
      return this.get(id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public async setActive(id: string, active: boolean): Promise<Template | null> {
    const result = await pool.query<TemplateRow>(
      `UPDATE templates SET is_active=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING id, name, type, orientation, output_width, output_height, background_path, cover_path, background_x, background_y, background_width, background_height, is_active, required_capture_count, sort_order, created_at, updated_at`,
      [id, active],
    );
    return result.rows[0] ? this.hydrate(result.rows[0]) : null;
  }

  public async setBackgroundPath(id: string, path: string): Promise<Template | null> {
    const result = await pool.query<TemplateRow>(
      `UPDATE templates SET background_path=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING id, name, type, orientation, output_width, output_height, background_path, cover_path, background_x, background_y, background_width, background_height, is_active, required_capture_count, sort_order, created_at, updated_at`,
      [id, path],
    );
    return result.rows[0] ? this.hydrate(result.rows[0]) : null;
  }

  public async setCoverPath(id: string, path: string): Promise<Template | null> {
    const result = await pool.query<TemplateRow>(
      `UPDATE templates SET cover_path=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING id, name, type, orientation, output_width, output_height, background_path, cover_path, background_x, background_y, background_width, background_height, is_active, required_capture_count, sort_order, created_at, updated_at`,
      [id, path],
    );
    return result.rows[0] ? this.hydrate(result.rows[0]) : null;
  }

  public async reorder(orderedIds: string[]): Promise<Template[]> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let index = 0; index < orderedIds.length; index++) {
        await client.query('UPDATE templates SET sort_order=$2 WHERE id=$1', [
          orderedIds[index],
          index + 1,
        ]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.list();
  }

  public async addOverlayPath(
    id: string,
    overlayId: string,
    path: string,
  ): Promise<Template | null> {
    const result = await pool.query(
      'UPDATE template_overlays SET asset_path=$3 WHERE template_id=$1 AND id=$2 RETURNING id',
      [id, overlayId, path],
    );
    if (!result.rowCount) return null;
    return this.get(id);
  }

  public async delete(id: string): Promise<Template | null> {
    const template = await this.get(id);
    if (!template) return null;
    await pool.query('DELETE FROM templates WHERE id = $1', [id]);
    return template;
  }
}

export const templateRepository = new TemplateRepository();
