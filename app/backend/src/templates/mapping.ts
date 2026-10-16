/** Engine-neutral template row mapping and overlay helpers. */
import { resolveStoredPath } from '../services/storage-paths.js';
import type { Template, TemplateDraft } from './types.js';

export type TemplateRow = {
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
    backgroundPath: resolveStoredPath(row.background_path),
    coverPath: resolveStoredPath(row.cover_path),
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
      path: resolveStoredPath(overlay.path),
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

export const isTemplateId = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
