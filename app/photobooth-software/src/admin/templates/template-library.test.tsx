// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TemplateLibrary } from './template-library';
import type { Template } from './types';

const template = {
  id: 'template-1',
  name: 'Layered template',
  orientation: 'portrait',
  width: 1200,
  height: 1800,
  active: true,
  requiredCaptureCount: 1,
  backgroundPath: null,
  sortOrder: 0,
  createdAt: '2026-09-05T00:00:00.000Z',
  updatedAt: '2026-09-05T00:00:00.000Z',
  background: { x: 0, y: 0, width: 1200, height: 1800 },
  placements: [{ captureIndex: 1, x: 100, y: 100, width: 600, height: 600, rotation: 15, borderRadius: 8, zIndex: 4 }],
  overlays: [{ id: 'overlay-1', label: 'Frame', x: 80, y: 80, width: 700, height: 100, rotation: 10, zIndex: 5, path: '/templates/template-1/overlays/overlay-1' }],
} satisfies Template;

describe('TemplateLibrary', () => {
  it('renders overlays above photo slots according to their saved layers', () => {
    render(<TemplateLibrary templates={[template]} error="" onCreate={vi.fn()} onEdit={vi.fn()} onActive={vi.fn()} onMove={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} onImport={vi.fn()} />);

    expect(screen.getByText('1').style.zIndex).toBe('4');
    expect(screen.getByAltText('Frame').style.zIndex).toBe('5');
    expect(screen.getByAltText('Frame').style.transform).toBe('rotate(10deg)');
    expect(screen.getByAltText('Frame').style.height).toBe(`${(700 / 1800) * 100}%`);
  });
});
