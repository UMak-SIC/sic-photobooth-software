// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FlipbookWorkflow } from './FlipbookWorkflow';
import { useFlipbookStore } from '../../store/flipbook-store';
import { useSessionStore } from '../../store/session-store';
import { boothApi, type SessionInfo, type EventItem } from '../../services/api';

describe('FlipbookWorkflow event selection and navigation', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();

    useFlipbookStore.setState({
      currentStep: 'setup',
      sessionId: null,
      sessionToken: null,
      selectedEvent: null,
      selectedFrame: null,
      coverUrls: [],
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

    useSessionStore.setState({
      activeSession: {
        id: '',
        type: 'flipbook',
      },
    });
  });

  it('renders EventSelectScreen on setup step and handles onBack', async () => {
    vi.spyOn(boothApi, 'listEvents').mockResolvedValue([
      { id: '1', name: 'SIC General Assembly', date: 'May 24, 2026', operatorName: 'Mika Santos' },
    ]);

    render(<FlipbookWorkflow />);

    expect(screen.getByText('SIC PHOTOBOOTH')).toBeDefined();
    expect(screen.getByText('Which event are you operating?')).toBeDefined();

    const backButton = screen.getByRole('button', { name: /Back to experience choice/i });
    expect(backButton).toBeDefined();

    fireEvent.click(backButton);

    const flipbookState = useFlipbookStore.getState();
    expect(flipbookState.currentStep).toBe('welcome');
    const sessionState = useSessionStore.getState();
    expect(sessionState.activeSession).toBeNull();
  });

  it('creates backend session and advances to frame_select on Continue from EventSelectScreen', async () => {
    const mockEvents: EventItem[] = [
      { id: 'evt-2', name: 'College Week 2026', date: '2026-06-18', operatorName: 'J. Domingo' },
    ];
    vi.spyOn(boothApi, 'listEvents').mockResolvedValue(mockEvents);

    const createdSession: SessionInfo = {
      sessionId: 'session-flip-999',
      token: 'token-flip-999',
      type: 'flipbook',
      state: 'created',
      eventId: 'evt-2',
      eventName: 'College Week 2026',
      eventDate: '2026-06-18',
      createdAt: new Date().toISOString(),
    };

    const createSessionSpy = vi
      .spyOn(boothApi, 'createSession')
      .mockResolvedValue(createdSession);

    render(<FlipbookWorkflow />);

    const continueButton = await screen.findByRole('button', { name: /Continue/i });
    fireEvent.click(continueButton);

    await waitFor(() => {
      const flipbookState = useFlipbookStore.getState();
      expect(flipbookState.currentStep).toBe('frame_select');
      expect(flipbookState.sessionId).toBe('session-flip-999');
      expect(flipbookState.sessionToken).toBe('token-flip-999');
      expect(flipbookState.selectedEvent?.name).toBe('College Week 2026');
    });

    expect(createSessionSpy).toHaveBeenCalledWith(
      'College Week 2026',
      '2026-06-18',
      'J. Domingo',
      'flipbook',
    );

    const sessionState = useSessionStore.getState();
    expect(sessionState.activeSession).toEqual({
      id: 'session-flip-999',
      type: 'flipbook',
      token: 'token-flip-999',
    });
  });

  it('navigates from instructions to cover_capture on start button click', async () => {
    vi.spyOn(boothApi, 'acknowledgeInstructions').mockResolvedValue(undefined);

    useFlipbookStore.setState({
      currentStep: 'instructions',
      sessionId: 'session-flip-123',
      sessionToken: 'token-flip-123',
    });

    render(<FlipbookWorkflow />);

    const startButton = screen.getByRole('button', { name: /LET'S GO|Start/i });
    expect(startButton).toBeDefined();

    fireEvent.click(startButton);

    await waitFor(() => {
      const flipbookState = useFlipbookStore.getState();
      expect(flipbookState.currentStep).toBe('cover_capture');
    });
  });

  it('navigates back to experience choice from frame_select screen', async () => {
    vi.spyOn(boothApi, 'listFrames').mockResolvedValue([
      {
        id: 'frame-1',
        name: 'Retro Bloom',
        coverPath: '/frames/frame-1.png',
        type: 'flipbook',
        isActive: true,
      },
    ]);

    useFlipbookStore.setState({
      currentStep: 'frame_select',
      sessionId: 'session-flip-123',
      sessionToken: 'token-flip-123',
    });

    render(<FlipbookWorkflow />);

    const backButton = await screen.findByRole('button', { name: /Back/i });
    expect(backButton).toBeDefined();

    fireEvent.click(backButton);

    const sessionState = useSessionStore.getState();
    expect(sessionState.activeSession).toBeNull();
    expect(sessionState.stage).toBe('choose_experience');
  });
});
