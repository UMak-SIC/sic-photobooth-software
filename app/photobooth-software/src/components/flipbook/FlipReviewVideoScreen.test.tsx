// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FlipReviewVideoScreen } from './FlipReviewVideoScreen';
import { useFlipbookStore } from '../../store/flipbook-store';
import { boothApi } from '../../services/api';

describe('FlipReviewVideoScreen layout and selection', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();

    useFlipbookStore.setState({
      sessionId: 'session-flip-456',
      currentStep: 'review_video',
      selectedCoverIndex: 2,
      selectedVideoIndex: 1,
      videoUrls: [
        'blob:http://localhost/video1',
        'blob:http://localhost/video2',
        'blob:http://localhost/video3',
      ],
      selectedFrame: {
        id: 'gensic-arcade',
        name: 'GenSIC Arcade',
        type: 'flipbook',
        isActive: true,
      },
    });
  });

  it('renders title, 3 video card columns with numbers 1, 2, 3, and I LIKE THIS button', () => {
    render(<FlipReviewVideoScreen />);

    expect(screen.getByText('Pick the one you like as your GIF')).toBeDefined();
    expect(screen.getByText('1')).toBeDefined();
    expect(screen.getByText('2')).toBeDefined();
    expect(screen.getByText('3')).toBeDefined();
    expect(screen.getByRole('button', { name: /I LIKE THIS/i })).toBeDefined();

    const radios = screen.getAllByRole('radio');
    expect(radios.length).toBe(3);
    expect(radios[0].getAttribute('aria-checked')).toBe('true');
  });

  it('allows clicking video 3 to select it', async () => {
    render(<FlipReviewVideoScreen />);

    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios[2]);

    await waitFor(() => {
      const state = useFlipbookStore.getState();
      expect(state.selectedVideoIndex).toBe(3);
      expect(radios[2].getAttribute('aria-checked')).toBe('true');
    });
  });

  it('submits selection and transitions to processing on clicking I LIKE THIS', async () => {
    const submitSpy = vi
      .spyOn(boothApi, 'submitFlipbookSelection')
      .mockResolvedValue(undefined as any);

    render(<FlipReviewVideoScreen />);

    const button = screen.getByRole('button', { name: /I LIKE THIS/i });
    fireEvent.click(button);

    await waitFor(() => {
      const state = useFlipbookStore.getState();
      expect(state.currentStep).toBe('processing');
      expect(state.isProcessing).toBe(true);
    });

    expect(submitSpy).toHaveBeenCalledWith('session-flip-456', 2, 1);
  });
  it('does not render check mark icon to avoid distraction', () => {
    render(<FlipReviewVideoScreen />);

    const checkmarks = screen.queryByAltText('Selected');
    expect(checkmarks).toBeNull();
  });
});

