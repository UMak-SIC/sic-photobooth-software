// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TemplateEditor } from './template-editor';
import { flipbookPlacements } from './presets';
import type { Template, TemplateDraft } from './types';

const mockDraft: TemplateDraft = {
  name: 'Test Template',
  orientation: 'portrait',
  background: { x: 0, y: 0, width: 1200, height: 1800 },
  placements: [
    {
      captureIndex: 1,
      x: 100,
      y: 100,
      width: 1000,
      height: 600,
      rotation: 0,
      borderRadius: 8,
      zIndex: 1,
    },
  ],
  overlays: [
    {
      id: 'overlay-1',
      label: 'Logo Top',
      x: 100,
      y: 50,
      width: 200,
      height: 200,
      rotation: 0,
      zIndex: 10,
      path: null,
    },
    {
      id: 'overlay-2',
      label: 'Sticker Bottom',
      x: 100,
      y: 1400,
      width: 200,
      height: 200,
      rotation: 0,
      zIndex: 11,
      path: null,
    },
  ],
};

describe('Flipbook layout', () => {
  it('uses one portrait layout with four slots', () => {
    expect(flipbookPlacements()).toMatchObject([
      { captureIndex: 1, x: 290, y: 150 },
      { captureIndex: 2, x: 290, y: 540 },
      { captureIndex: 3, x: 290, y: 930 },
      { captureIndex: 4, x: 290, y: 1320 },
    ]);
  });
});

describe('TemplateEditor', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders inspector tabs with overlay count badge', () => {
    render(
      <TemplateEditor
        draft={mockDraft}
        setDraft={vi.fn()}
        initialTemplate={null}
        onBack={vi.fn()}
        onSaved={vi.fn()}
        onLoad={vi.fn()}
      />,
    );

    expect(screen.getByRole('tab', { name: /Overlays/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Photo Slots/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Background/i })).toBeDefined();
    expect(screen.getAllByText('Logo Top').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sticker Bottom').length).toBeGreaterThan(0);
  });

  it('displays the uploaded overlay as a mini icon in the overlays section', () => {
    render(
      <TemplateEditor
        draft={mockDraft}
        setDraft={vi.fn()}
        initialTemplate={null}
        onBack={vi.fn()}
        onSaved={vi.fn()}
        onLoad={vi.fn()}
      />,
    );

    const miniIcons = document.querySelectorAll('.overlay-mini-icon');
    expect(miniIcons.length).toBe(2);

    // Upload an image directly through the mini icon file input
    const overlayFileInput = document.querySelector(
      '.overlay-mini-icon-wrapper input[type="file"]',
    ) as HTMLInputElement;
    expect(overlayFileInput).not.toBeNull();

    const file = new File(['dummy spider'], 'spider.png', { type: 'image/png' });
    fireEvent.change(overlayFileInput, { target: { files: [file] } });

    // Verify mini icon renders the uploaded image
    const miniIconImg = document.querySelector(
      '.overlay-mini-icon .mini-icon-img',
    ) as HTMLImageElement;
    expect(miniIconImg).not.toBeNull();
    expect(miniIconImg.alt).toBe('Logo Top');
    expect(miniIconImg.src).toContain('blob:mock-url');
  });

  it('renders "Use same image for all overlays" button in toolbar and overlay details', () => {
    render(
      <TemplateEditor
        draft={mockDraft}
        setDraft={vi.fn()}
        initialTemplate={null}
        onBack={vi.fn()}
        onSaved={vi.fn()}
        onLoad={vi.fn()}
      />,
    );

    const useSameImageButtons = screen.getAllByRole('button', {
      name: /Use same image for all overlays/i,
    });
    expect(useSameImageButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('applies an uploaded image to all overlays when clicking "Use same image for all overlays"', () => {
    render(
      <TemplateEditor
        draft={mockDraft}
        setDraft={vi.fn()}
        initialTemplate={null}
        onBack={vi.fn()}
        onSaved={vi.fn()}
        onLoad={vi.fn()}
      />,
    );

    const overlayFileInput = document.querySelector(
      '.overlay-mini-icon-wrapper input[type="file"]',
    ) as HTMLInputElement;
    expect(overlayFileInput).not.toBeNull();

    const file = new File(['dummy png data'], 'test-logo.png', { type: 'image/png' });
    fireEvent.change(overlayFileInput, { target: { files: [file] } });

    expect(screen.getByText(/Logo Top ready\. It uploads when you save\./i)).toBeDefined();

    // Now click the "Use same image for all overlays" button
    const useSameImageBtn = screen.getAllByRole('button', {
      name: /Use same image for all overlays/i,
    })[0];
    fireEvent.click(useSameImageBtn);

    expect(screen.getByText(/Applied image from "Logo Top" to all 2 overlays\./i)).toBeDefined();

    // Verify both mini icons now show images!
    const imgs = document.querySelectorAll('.overlay-mini-icon .mini-icon-img');
    expect(imgs.length).toBe(2);
  });

  it('can switch tabs to Photo Slots and Background', () => {
    render(
      <TemplateEditor
        draft={mockDraft}
        setDraft={vi.fn()}
        initialTemplate={null}
        onBack={vi.fn()}
        onSaved={vi.fn()}
        onLoad={vi.fn()}
      />,
    );

    const slotsTab = screen.getByRole('tab', { name: /Photo Slots/i });
    fireEvent.click(slotsTab);
    expect(screen.getByText(/SLOT #1 PROPERTIES/i)).toBeDefined();

    const bgTab = screen.getByRole('tab', { name: /Background/i });
    fireEvent.click(bgTab);
    expect(screen.getByText(/BACKGROUND IMAGE/i)).toBeDefined();
  });

  it('reloads the background asset after a saved template update', () => {
    const template = {
      ...mockDraft,
      id: 'template-1',
      width: 1200,
      height: 1800,
      active: true,
      requiredCaptureCount: 1,
      backgroundPath: '/templates/template-1/background',
      sortOrder: null,
      createdAt: '2026-09-05T00:00:00.000Z',
      updatedAt: '2026-09-05T00:00:00.000Z',
    } satisfies Template;
    const props = {
      draft: mockDraft,
      setDraft: vi.fn(),
      onBack: vi.fn(),
      onSaved: vi.fn(),
      onLoad: vi.fn(),
      templateId: template.id,
    };
    const { rerender } = render(<TemplateEditor {...props} initialTemplate={template} />);

    expect(screen.getByAltText('Background preview').getAttribute('src')).toContain(
      'v=2026-09-05T00%3A00%3A00.000Z',
    );

    rerender(
      <TemplateEditor
        {...props}
        initialTemplate={{ ...template, updatedAt: '2026-09-05T00:00:01.000Z' }}
      />,
    );

    expect(screen.getByAltText('Background preview').getAttribute('src')).toContain(
      'v=2026-09-05T00%3A00%3A01.000Z',
    );
  });
});
