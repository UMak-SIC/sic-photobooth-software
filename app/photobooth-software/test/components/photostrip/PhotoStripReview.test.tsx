// @vitest-environment jsdom
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PhotoStripReview, type ReviewTemplate } from '../../../src/components/photostrip/PhotoStripReview';

const mockTemplate: ReviewTemplate = {
  id: 'template-1',
  name: 'Retro Strip',
  orientation: 'portrait',
  outputWidth: 1200,
  outputHeight: 1800,
  countdownSeconds: 5,
  requiredCaptureCount: 3,
  placements: [
    { captureIndex: 1, x: 100, y: 100, width: 450, height: 350 },
    { captureIndex: 2, x: 600, y: 100, width: 450, height: 350 },
    { captureIndex: 3, x: 100, y: 500, width: 450, height: 350 },
  ],
};

const initialCaptures = [
  { captureIndex: 1, photoId: 'photo-1', dataUrl: 'blob:photo-1', originalDataUrl: 'blob:photo-1' },
  { captureIndex: 2, photoId: 'photo-2', dataUrl: 'blob:photo-2', originalDataUrl: 'blob:photo-2' },
  { captureIndex: 3, photoId: 'photo-3', dataUrl: 'blob:photo-3', originalDataUrl: 'blob:photo-3' },
];

describe('PhotoStripReview Retake Bank workflow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('renders countdown timer, updated instruction copy, 4 photo filter options, and finished button', () => {
    render(
      <PhotoStripReview
        template={mockTemplate}
        captures={initialCaptures}
        retakeCount={0}
      />
    );

    // Review timer
    expect(screen.getByText('45')).toBeDefined();

    // Instruction copy
    expect(screen.getByText('Replacing 1 photo won’t touch the rest.')).toBeDefined();
    expect(screen.getByText('4 Retakes Left')).toBeDefined();
    expect(screen.getByText('Select a photo filter below, or tap a photo to retake.')).toBeDefined();

    // The 4 filter cards in 2x2 grid are labeled Original, Classic B&W, Vintage Sepia, Warm Golden
    expect(screen.getByText('Original')).toBeDefined();
    expect(screen.getByText('Classic B&W')).toBeDefined();
    expect(screen.getByText('Vintage Sepia')).toBeDefined();
    expect(screen.getByText('Warm Golden')).toBeDefined();

    // Buttons
    expect(screen.getByRole('button', { name: /Retake photo #1/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /I'm finished/i })).toBeDefined();
  });

  it('allows selecting different frames from the photostrip preview', () => {
    render(
      <PhotoStripReview
        template={mockTemplate}
        captures={initialCaptures}
        retakeCount={0}
      />
    );

    // Click Frame 2
    const slot2PlacementBtn = screen.getByRole('button', { name: /Select photo 2/i });
    fireEvent.click(slot2PlacementBtn);

    expect(screen.getByRole('button', { name: /Retake photo #2/i })).toBeDefined();
  });

  it('triggers onSelectFilter when tapping a filter card', () => {
    const onSelectFilterMock = vi.fn();
    render(
      <PhotoStripReview
        template={mockTemplate}
        captures={initialCaptures}
        retakeCount={0}
        onSelectFilter={onSelectFilterMock}
      />
    );

    // Click Classic B&W filter card
    const bwBtn = screen.getByRole('button', { name: /Select Classic B&W filter/i });
    fireEvent.click(bwBtn);

    expect(onSelectFilterMock).toHaveBeenCalledWith('bw');
  });

  it('triggers onRetake when clicking Retake photo #X button', () => {
    const onRetakeMock = vi.fn();
    render(
      <PhotoStripReview
        template={mockTemplate}
        captures={initialCaptures}
        retakeCount={0}
        onRetake={onRetakeMock}
      />
    );

    const retakeBtn = screen.getByRole('button', { name: /Retake photo #1/i });
    fireEvent.click(retakeBtn);

    expect(onRetakeMock).toHaveBeenCalledWith(1);
  });

  it('disables retake button when 4 retakes have been exhausted', () => {
    render(
      <PhotoStripReview
        template={mockTemplate}
        captures={initialCaptures}
        retakeCount={4}
      />
    );

    expect(screen.getByText('0 Retakes Left')).toBeDefined();
    const retakeBtn = screen.getByRole('button', { name: /No retakes left/i });
    expect((retakeBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('auto-continues and confirms when timer counts down to 0', async () => {
    const onConfirmMock = vi.fn();
    render(
      <PhotoStripReview
        template={mockTemplate}
        captures={initialCaptures}
        retakeCount={0}
        onConfirm={onConfirmMock}
      />
    );

    expect(screen.getByText('45')).toBeDefined();

    // Advance 45 seconds
    act(() => {
      vi.advanceTimersByTime(45000);
    });

    expect(onConfirmMock).toHaveBeenCalledTimes(1);
  });

  it('calls onConfirm when user manually clicks I am finished', () => {
    const onConfirmMock = vi.fn();
    render(
      <PhotoStripReview
        template={mockTemplate}
        captures={initialCaptures}
        retakeCount={0}
        onConfirm={onConfirmMock}
      />
    );

    const finishedBtn = screen.getByRole('button', { name: /I'm finished/i });
    fireEvent.click(finishedBtn);

    expect(onConfirmMock).toHaveBeenCalled();
  });

  it('cycles through all 4 filters (Original, B&W, Sepia, Warm) and applies correct style', () => {
    const onSelectFilterMock = vi.fn();
    const { rerender } = render(
      <PhotoStripReview
        template={mockTemplate}
        captures={initialCaptures}
        retakeCount={0}
        selectedFilter="normal"
        onSelectFilter={onSelectFilterMock}
      />
    );

    const photoImg = screen.getByAltText('Photo 1');
    expect(photoImg.getAttribute('style')).toBe('filter: none;');

    // Switch to Sepia
    const sepiaBtn = screen.getByRole('button', { name: /Select Vintage Sepia filter/i });
    fireEvent.click(sepiaBtn);
    expect(onSelectFilterMock).toHaveBeenCalledWith('sepia');

    rerender(
      <PhotoStripReview
        template={mockTemplate}
        captures={initialCaptures}
        retakeCount={0}
        selectedFilter="sepia"
        onSelectFilter={onSelectFilterMock}
      />
    );
    expect(photoImg.getAttribute('style')).toContain('sepia(65%)');

    // Switch to Warm
    const warmBtn = screen.getByRole('button', { name: /Select Warm Golden filter/i });
    fireEvent.click(warmBtn);
    expect(onSelectFilterMock).toHaveBeenCalledWith('warm');

    rerender(
      <PhotoStripReview
        template={mockTemplate}
        captures={initialCaptures}
        retakeCount={0}
        selectedFilter="warm"
        onSelectFilter={onSelectFilterMock}
      />
    );
    expect(photoImg.getAttribute('style')).toContain('sepia(15%)');

    // Switch to B&W
    const bwBtn = screen.getByRole('button', { name: /Select Classic B&W filter/i });
    fireEvent.click(bwBtn);
    expect(onSelectFilterMock).toHaveBeenCalledWith('bw');

    rerender(
      <PhotoStripReview
        template={mockTemplate}
        captures={initialCaptures}
        retakeCount={0}
        selectedFilter="bw"
        onSelectFilter={onSelectFilterMock}
      />
    );
    expect(photoImg.getAttribute('style')).toContain('grayscale(100%)');
  });
});

