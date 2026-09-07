// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FlipbookCompletionScreen } from './FlipbookCompletionScreen';
import { useFlipbookStore } from '../../store/flipbook-store';
import { useSessionStore } from '../../store/session-store';
import { boothApi, type SessionInfo } from '../../services/api';

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,mockqr'),
  },
}));

describe('FlipbookCompletionScreen finish session lifecycle', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();

    useFlipbookStore.setState({
      currentStep: 'complete',
      sessionId: 'old-session-123',
      sessionToken: 'old-token-abc',
      publicId: 'k9X2bQ1',
      qrUrl: 'https://myphotobooth.com/k9X2bQ1',
      outputGifUrl: 'http://localhost:3000/photos/k9X2bQ1',
      coverUrls: ['blob:http://localhost/cover1'],
      videoUrls: ['blob:http://localhost/video1'],
      videoFrames: [['blob:http://localhost/frame1']],
      selectedCoverIndex: 1,
      selectedVideoIndex: 1,
    });

    useSessionStore.setState({
      activeSession: {
        id: 'old-session-123',
        type: 'flipbook',
        token: 'old-token-abc',
      },
    });

    boothApi.setToken('old-token-abc');
  });

  it('resets previous session assets, creates a new flipbook session, and transitions to instructions step', async () => {
    const newSession: SessionInfo = {
      sessionId: 'new-session-456',
      token: 'new-token-xyz',
      type: 'flipbook',
      state: 'created',
      eventId: 'evt-1',
      eventName: 'SIC General Assembly',
      eventDate: '2026-09-06',
      createdAt: new Date().toISOString(),
    };

    const createSessionSpy = vi
      .spyOn(boothApi, 'createSession')
      .mockResolvedValue(newSession);

    render(<FlipbookCompletionScreen />);

    const finishButton = screen.getByRole('button', { name: /Finish session/i });
    expect(finishButton).toBeDefined();

    fireEvent.click(finishButton);

    await waitFor(() => {
      const flipbookState = useFlipbookStore.getState();
      expect(flipbookState.currentStep).toBe('instructions');
      expect(flipbookState.sessionId).toBe('new-session-456');
      expect(flipbookState.sessionToken).toBe('new-token-xyz');
      expect(flipbookState.publicId).toBeNull();
      expect(flipbookState.outputGifUrl).toBeNull();
      expect(flipbookState.coverUrls).toEqual([]);
      expect(flipbookState.videoUrls).toEqual([]);
    });

    expect(createSessionSpy).toHaveBeenCalledWith(
      'SIC General Assembly',
      expect.any(String),
      'Operator',
      'flipbook',
    );

    const sessionState = useSessionStore.getState();
    expect(sessionState.activeSession).toEqual({
      id: 'new-session-456',
      type: 'flipbook',
      token: 'new-token-xyz',
    });
  });

  it('falls back to a new local session and still transitions to instructions if backend fails', async () => {
    vi.spyOn(boothApi, 'createSession').mockRejectedValue(new Error('Network error'));

    render(<FlipbookCompletionScreen />);

    const finishButton = screen.getByRole('button', { name: /Finish session/i });
    fireEvent.click(finishButton);

    await waitFor(() => {
      const flipbookState = useFlipbookStore.getState();
      expect(flipbookState.currentStep).toBe('instructions');
      expect(flipbookState.sessionId).toMatch(/^mock-flipbook-/);
      expect(flipbookState.publicId).toBeNull();
      expect(flipbookState.coverUrls).toEqual([]);
    });

    const sessionState = useSessionStore.getState();
    expect(sessionState.activeSession?.type).toBe('flipbook');
    expect(sessionState.activeSession?.id).toMatch(/^mock-flipbook-/);
  });
});
