import { z } from 'zod';

export const orientationSchema = z.enum(['portrait', 'landscape']);

const geometryNumber = z.number().finite();
const positiveGeometryNumber = geometryNumber.positive();

export const placementSchema = z
  .object({
    captureIndex: z.number().int().positive(),
    x: geometryNumber,
    y: geometryNumber,
    width: positiveGeometryNumber,
    height: positiveGeometryNumber,
    rotation: geometryNumber,
    borderRadius: z.number().finite().nonnegative(),
    zIndex: z.number().int(),
  })
  .strict();

export const overlaySchema = z
  .object({
    id: z.string().uuid().optional(),
    label: z.string().trim().min(1).max(255),
    x: geometryNumber,
    y: geometryNumber,
    width: positiveGeometryNumber,
    height: positiveGeometryNumber,
    rotation: geometryNumber,
    zIndex: z.number().int(),
  })
  .strict();

export const backgroundSchema = z
  .object({
    x: geometryNumber,
    y: geometryNumber,
    width: positiveGeometryNumber,
    height: positiveGeometryNumber,
  })
  .strict();

export const templateDraftSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    orientation: orientationSchema,
    background: backgroundSchema,
    placements: z.array(placementSchema).min(1),
    overlays: z.array(overlaySchema),
  })
  .strict();

export type TemplatePlacement = z.infer<typeof placementSchema> & { id?: string };
export type TemplateOverlay = z.infer<typeof overlaySchema> & { id?: string; path?: string | null };
export type TemplateDraft = z.infer<typeof templateDraftSchema>;

export interface Template extends TemplateDraft {
  id: string;
  width: 1200 | 1800;
  height: 1200 | 1800;
  active: boolean;
  requiredCaptureCount: number;
  backgroundPath: string | null;
  sortOrder: number | null;
  createdAt: Date;
  updatedAt: Date;
  placements: TemplatePlacement[];
  overlays: TemplateOverlay[];
}

export interface TemplateDto extends Omit<Template, 'backgroundPath' | 'overlays'> {
  backgroundPath: string | null;
  overlays: Array<Omit<TemplateOverlay, 'path'> & { path: string | null }>;
}

export const dimensionsFor = (
  orientation: TemplateDraft['orientation'],
): { width: 1200 | 1800; height: 1200 | 1800 } =>
  orientation === 'portrait' ? { width: 1200, height: 1800 } : { width: 1800, height: 1200 };

export function validateTemplateDraft(input: unknown): TemplateDraft {
  const draft = templateDraftSchema.parse(input);
  return draft;
}
