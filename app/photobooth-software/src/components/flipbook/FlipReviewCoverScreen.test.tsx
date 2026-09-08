// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FlipReviewCoverScreen } from './FlipReviewCoverScreen';
import { useFlipbookStore } from '../../store/flipbook-store';

describe('FlipReviewCoverScreen layout and selection', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();

    useFlipbookStore.setState({
      currentStep: 'review_cover',
      coverUrls: [
        'blob:http://localhost/cover1',
        'blob:http://localhost/cover2',
        'blob:http://localhost/cover3',
      ],
      selectedCoverIndex: 1,
      selectedFrame: {
        id: 'gensic-arcade',
        name: 'GenSIC Arcade',
        type: 'flipbook',
        isActive: true,
      },
    });
  });

  it('renders title, subtitle, countdown timer, and 3 cover cards', () => {
    render(<FlipReviewCoverScreen />);

    expect(screen.getByText('Pick a cover photo you like')).toBeDefined();
    expect(screen.getByText('Select the one you like')).toBeDefined();
    expect(screen.getByRole('button', { name: /I LIKE THIS/i })).toBeDefined();

    // 3 radio options
    const radios = screen.getAllByRole('radio');
    expect(radios.length).toBe(3);
    expect(radios[0].getAttribute('aria-checked')).toBe('true');
  });

  it('allows clicking a different cover to select it', async () => {
    render(<FlipReviewCoverScreen />);

    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios[1]);

    await waitFor(() => {
      const state = useFlipbookStore.getState();
      expect(state.selectedCoverIndex).toBe(2);
      expect(radios[1].getAttribute('aria-checked')).toBe('true');
    });
  });

  it('advances to review_video on clicking I LIKE THIS', async () => {
    render(<FlipReviewCoverScreen />);

    const button = screen.getByRole('button', { name: /I LIKE THIS/i });
    fireEvent.click(button);

    await waitFor(() => {
      const state = useFlipbookStore.getState();
      expect(state.currentStep).toBe('review_video');
    });
  });
});

