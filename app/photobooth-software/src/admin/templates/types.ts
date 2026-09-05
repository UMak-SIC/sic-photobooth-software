export type Orientation = 'portrait' | 'landscape';

export type TemplatePlacement = {
  id?: string;
  captureIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  borderRadius: number;
  zIndex: number;
};

export type TemplateOverlay = {
  id?: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  path?: string | null;
};

export type TemplateDraft = {
  name: string;
  orientation: Orientation;
  background: { x: number; y: number; width: number; height: number };
  placements: TemplatePlacement[];
  overlays: TemplateOverlay[];
};

export type Template = TemplateDraft & {
  id: string;
  width: 1200 | 1800;
  height: 1200 | 1800;
  active: boolean;
  requiredCaptureCount: number;
  backgroundPath: string | null;
  sortOrder: number | null;
  createdAt: string;
  updatedAt: string;
};

export const dimensionsFor = (orientation: Orientation) =>
  orientation === 'portrait' ? { width: 1200, height: 1800 } : { width: 1800, height: 1200 };

export const emptyDraft = (): TemplateDraft => ({
  name: '',
  orientation: 'portrait',
  background: { x: 0, y: 0, width: 1200, height: 1800 },
  placements: [],
  overlays: [],
});

export function draftFromTemplate(template: Template): TemplateDraft {
  return {
    name: template.name,
    orientation: template.orientation,
    background: { ...template.background },
    placements: template.placements.map(({ id: _id, ...placement }) => placement),
    overlays: template.overlays.map((overlay) => ({ ...overlay, height: overlay.width })),
  };
}
