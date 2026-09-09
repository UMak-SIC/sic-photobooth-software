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

const mockPhotoPoolWithRetakes = [
  { id: 'photo-1', dataUrl: 'blob:photo-1', label: 'Frame 1', isRetake: false },
  { id: 'photo-2', dataUrl: 'blob:photo-2', label: 'Frame 2', isRetake: false },
  { id: 'photo-3', dataUrl: 'blob:photo-3', label: 'Frame 3', isRetake: false },
  { id: 'retake-A', dataUrl: 'blob:photo-retake-A', label: 'Take A', letter: 'A', isRetake: true },
  { id: 'retake-B', dataUrl: 'blob:photo-retake-B', label: 'Take B', letter: 'B', isRetake: true },
];

describe('PhotoStripReview Retake Bank workflow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('renders 60 second timer, updated instruction copy, 4 Take A/B/C/D slots, and finished button', () => {
    render(
      <PhotoStripReview
        template={mockTemplate}
        captures={initialCaptures}
        retakeCount={0}
      />
    );

    // 60-second timer
    expect(screen.getByText('60')).toBeDefined();

    // Instruction copy
    expect(screen.getByText('Replacing 1 photo won’t touch the rest.')).toBeDefined();
    expect(screen.getByText('4 Retakes Left')).toBeDefined();
    expect(screen.getByText('Tap a frame to retake it, or tap a slot below to swap.')).toBeDefined();

    // The 4 slots in 2x2 grid are labeled Take A, Take B, Take C, Take D (never 1–4)
    expect(screen.getByText('Take A')).toBeDefined();
    expect(screen.getByText('Take B')).toBeDefined();
    expect(screen.getByText('Take C')).toBeDefined();
    expect(screen.getByText('Take D')).toBeDefined();

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

  it('displays frame ownership badges and triggers onAssignPhoto when tapping an occupied Take slot', () => {
    const onAssignPhotoMock = vi.fn();
    render(
      <PhotoStripReview
        template={mockTemplate}
        captures={initialCaptures}
        photoPool={mockPhotoPoolWithRetakes}
        slotAssignments={{ 1: 'retake-A', 2: 'photo-2', 3: 'photo-3' }}
        retakeCount={2}
        onAssignPhoto={onAssignPhotoMock}
      />
    );

    // Take A is in Frame 1
    expect(screen.getByText('In Frame 1')).toBeDefined();
    // Take B is unused
    expect(screen.getByText('Unused (Tap to Swap)')).toBeDefined();

    // Click Take B to assign it to currently selected Frame 1
    const takeBSlot = screen.getByRole('button', { name: /Retake bank slot Take B/i });
    fireEvent.click(takeBSlot);

    expect(onAssignPhotoMock).toHaveBeenCalledWith(1, 'retake-B');
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

  it('auto-continues and confirms when 60-second timer counts down to 0', async () => {
    const onConfirmMock = vi.fn();
    render(
      <PhotoStripReview
        template={mockTemplate}
        captures={initialCaptures}
        retakeCount={0}
        onConfirm={onConfirmMock}
      />
    );

    expect(screen.getByText('60')).toBeDefined();

    // Advance 60 seconds
    act(() => {
      vi.advanceTimersByTime(60000);
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
});

