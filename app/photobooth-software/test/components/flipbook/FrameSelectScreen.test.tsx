// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FrameSelectScreen } from '../../../src/components/flipbook/FrameSelectScreen';
import { useFlipbookStore } from '../../../src/store/flipbook-store';
import { boothApi, type FrameItem } from '../../../src/services/api';

describe('FrameSelectScreen layout and selection', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();

    useFlipbookStore.setState({
      currentStep: 'frame_select',
      sessionId: 'session-flip-101',
      sessionToken: 'token-flip-101',
      selectedEvent: { id: 'e1', name: 'SIC Night', date: '2026-09-08', operatorName: 'Operator' },
      selectedFrame: null,
      coverUrls: ['https://example.com/cover1.jpg'],
      coverBlobs: [],
      videoUrls: [],
      videoBlobs: [],
      videoFrames: [],
      selectedCoverIndex: 1,
      selectedVideoIndex: 1,
      publicId: null,
      qrUrl: null,
      outputGifUrl: null,
      errorMessage: null,
      isProcessing: false,
    });
  });

  it('renders "Pick your Frame" title and 2-column list of frames', async () => {
    const mockFrames: FrameItem[] = [
      { id: 'frame-a', name: 'Alpha Frame', type: 'flipbook', isActive: true },
      { id: 'frame-b', name: 'Beta Frame', type: 'flipbook', isActive: true },
    ];
    vi.spyOn(boothApi, 'listFrames').mockResolvedValue(mockFrames);

    render(<FrameSelectScreen />);

    expect(screen.getByText('Pick your Frame')).toBeDefined();
    expect(await screen.findByText('Alpha Frame')).toBeDefined();
    expect(screen.getByText('Beta Frame')).toBeDefined();

    // 4 Preview Sections
    expect(screen.getAllByText('Front Cover')[0]).toBeDefined();
    expect(screen.getByText('Cover Photo')).toBeDefined();
    expect(screen.getByText('Motion Pages')).toBeDefined();
    expect(screen.getByText('Back Cover')).toBeDefined();

    // Timer Badge (Arcade Gamer countdown)
    expect(screen.getByText('60')).toBeDefined();
    expect(screen.getByLabelText(/Auto continue in 60 seconds/i)).toBeDefined();

    // Action button
    expect(screen.getByRole('button', { name: /I LIKE THIS/i })).toBeDefined();
  });

  it('allows clicking a different frame card to update selection', async () => {
    const mockFrames: FrameItem[] = [
      { id: 'frame-a', name: 'Alpha Frame', type: 'flipbook', isActive: true },
      { id: 'frame-b', name: 'Beta Frame', type: 'flipbook', isActive: true },
    ];
    vi.spyOn(boothApi, 'listFrames').mockResolvedValue(mockFrames);

    render(<FrameSelectScreen />);

    const frameBCard = await screen.findByRole('radio', { name: /Beta Frame/i });
    fireEvent.click(frameBCard);

    await waitFor(() => {
      expect(frameBCard.getAttribute('aria-checked')).toBe('true');
    });
  });

  it('invokes onBack when Back button is clicked', async () => {
    const onBackMock = vi.fn();
    vi.spyOn(boothApi, 'listFrames').mockResolvedValue([
      { id: 'frame-a', name: 'Alpha Frame', type: 'flipbook', isActive: true },
    ]);

    render(<FrameSelectScreen onBack={onBackMock} />);

    const backButton = await screen.findByRole('button', { name: /Back/i });
    fireEvent.click(backButton);

    expect(onBackMock).toHaveBeenCalledTimes(1);
  });

  it('confirms selection and advances when clicking "I LIKE THIS"', async () => {
    const mockFrames: FrameItem[] = [
      { id: 'frame-a', name: 'Alpha Frame', type: 'flipbook', isActive: true },
    ];
    vi.spyOn(boothApi, 'listFrames').mockResolvedValue(mockFrames);
    const selectFrameSpy = vi.spyOn(boothApi, 'selectFrame').mockResolvedValue(undefined);

    render(<FrameSelectScreen />);

    const confirmButton = await screen.findByRole('button', { name: /I LIKE THIS/i });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      const state = useFlipbookStore.getState();
      expect(state.selectedFrame?.id).toBe('frame-a');
      expect(state.currentStep).toBe('instructions');
    });

    expect(selectFrameSpy).toHaveBeenCalledWith('session-flip-101', 'frame-a');
  });
});
