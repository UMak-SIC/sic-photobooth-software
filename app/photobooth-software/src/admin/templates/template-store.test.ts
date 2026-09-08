import { describe, expect, it } from 'vitest';
import { useTemplateStore } from './template-store';
import type { Template } from './types';

const template = {
  id: 'template-id',
  name: 'Beach day',
  orientation: 'portrait',
  width: 1200,
  height: 1800,
  active: true,
  requiredCaptureCount: 1,
  backgroundPath: '/templates/template-id/background',
  background: { x: 0, y: 0, width: 1200, height: 1800 },
  placements: [
    {
      id: 'placement-id',
      captureIndex: 1,
      x: 0,
      y: 0,
      width: 160,
      height: 90,
      rotation: 0,
      borderRadius: 0,
      zIndex: 1,
    },
  ],
  overlays: [
    {
      id: 'overlay-id',
      label: 'Logo',
      x: 480,
      y: 820,
      width: 240,
      height: 160,
      rotation: 0,
      zIndex: 10,
      path: '/templates/template-id/overlays/overlay-id',
    },
  ],
  createdAt: '2026-09-05T00:00:00Z',
  updatedAt: '2026-09-05T00:00:00Z',
  sortOrder: 1,
} satisfies Template;

describe('template store', () => {
  it('does not send server template metadata back as an editable draft', () => {
    useTemplateStore.getState().setSaved(template);

    expect(useTemplateStore.getState().draft).toEqual({
      name: template.name,
      orientation: template.orientation,
      background: template.background,
      placements: [
        {
          captureIndex: 1,
          x: 0,
          y: 0,
          width: 160,
          height: 90,
          rotation: 0,
          borderRadius: 0,
          zIndex: 1,
        },
      ],
      overlays: [
        {
          id: 'overlay-id',
          label: 'Logo',
          x: 480,
          y: 820,
          width: 240,
          height: 240,
          rotation: 0,
          zIndex: 10,
          path: '/templates/template-id/overlays/overlay-id',
        },
      ],
    });
  });
});
