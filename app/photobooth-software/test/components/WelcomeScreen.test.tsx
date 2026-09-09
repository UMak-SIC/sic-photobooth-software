// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WelcomeScreen } from '../../src/components/WelcomeScreen';
import { useFlipbookStore } from '../../src/store/flipbook-store';
import { usePhotoStripStore } from '../../src/store/photostrip-store';
import { useSessionStore } from '../../src/store/session-store';
import { boothApi, type SessionInfo, type EventItem } from '../../src/services/api';

describe('WelcomeScreen revised flow: Event Selection before Experience Choice', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();

    useFlipbookStore.setState({
      currentStep: 'welcome',
      sessionId: null,
      sessionToken: null,
      selectedEvent: null,
    });

    usePhotoStripStore.setState({
      currentStep: 'setup',
      sessionId: null,
      sessionToken: null,
      selectedEvent: null,
    });

    useSessionStore.setState({
      activeSession: null,
      stage: 'welcome',
      selectedEvent: null,
    });

    const mockStream = {
      getTracks: () => [{ stop: vi.fn() }],
      getVideoTracks: () => [{ getSettings: () => ({ deviceId: 'cam-1' }) }],
      active: true,
    };

    Object.defineProperty(global.navigator, 'mediaDevices', {
      writable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
        enumerateDevices: vi.fn().mockResolvedValue([
          { deviceId: 'cam-1', kind: 'videoinput', label: 'USB Camera' },
        ]),
      },
    });
  });

  it('renders welcome screen initially and advances to event selection upon touching the screen', async () => {
    render(<WelcomeScreen />);

    expect(screen.getAllByText('SIC PHOTOBOOTH').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Touch the screen')).toBeDefined();

    const welcomeButton = screen.getByRole('button', { name: /Touch the screen to begin/i });
    fireEvent.click(welcomeButton);

    expect(screen.getAllByText('SIC PHOTOBOOTH').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Which event are you operating?')).toBeDefined();
    expect(screen.getByRole('button', { name: /Back/i })).toBeDefined();
  });

  it('returns to welcome splash when clicking back from event selection', async () => {
    render(<WelcomeScreen />);

    const welcomeButton = screen.getByRole('button', { name: /Touch the screen to begin/i });
    fireEvent.click(welcomeButton);

    const backButton = screen.getByRole('button', { name: /Back/i });
    fireEvent.click(backButton);

    expect(screen.getByText('Touch the screen')).toBeDefined();
  });

  it('advances to experience choice after selecting an event and clicking Continue', async () => {
    const mockEvents: EventItem[] = [
      { id: 'evt-1', name: 'SIC Gala 2026', date: '2026-09-08', operatorName: 'Test Operator' },
    ];
    vi.spyOn(boothApi, 'listEvents').mockResolvedValue(mockEvents);

    render(<WelcomeScreen />);

    const welcomeButton = screen.getByRole('button', { name: /Touch the screen to begin/i });
    fireEvent.click(welcomeButton);

    const continueButton = await screen.findByRole('button', { name: /Continue/i });
    fireEvent.click(continueButton);

    expect(screen.getByText('What are we creating today?')).toBeDefined();
    expect(screen.getAllByText(/PHOTO STRIP/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/FLIPBOOK/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Back/i })).toBeDefined();
  });

  it('returns from experience choice to event selection when clicking Back to Event Selection', async () => {
    render(<WelcomeScreen />);

    fireEvent.click(screen.getByRole('button', { name: /Touch the screen to begin/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Continue/i }));

    const backToEventsBtn = screen.getByRole('button', { name: /Back/i });
    fireEvent.click(backToEventsBtn);

    expect(screen.getByText('Which event are you operating?')).toBeDefined();
  });

  it('creates a photo_strip session and advances store directly to template_select', async () => {
    const createdSession: SessionInfo = {
      sessionId: 'sess-ps-123',
      token: 'tok-ps-123',
      type: 'photo_strip',
      state: 'created',
      eventId: '1',
      eventName: 'SIC General Assembly',
      eventDate: 'May 24, 2026',
      createdAt: new Date().toISOString(),
    };

    const createSessionSpy = vi
      .spyOn(boothApi, 'createSession')
      .mockResolvedValue(createdSession);

    render(<WelcomeScreen />);

    fireEvent.click(screen.getByRole('button', { name: /Touch the screen to begin/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Continue/i }));

    // Click Photo Strip
    const photoStripBtn = screen.getByRole('button', { name: /PHOTO STRIP/i });
    fireEvent.click(photoStripBtn);

    // Should immediately transition without blocking with camera modal
    await waitFor(() => {
      const psState = usePhotoStripStore.getState();
      expect(psState.currentStep).toBe('template_select');
      expect(psState.sessionId).toBe('sess-ps-123');
      expect(psState.sessionToken).toBe('tok-ps-123');

      const sessState = useSessionStore.getState();
      expect(sessState.activeSession?.type).toBe('photo_strip');
      expect(sessState.activeSession?.id).toBe('sess-ps-123');
    });

    expect(createSessionSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      'photo_strip',
    );
  });

  it('creates a flipbook session and advances store directly to frame_select', async () => {
    const createdSession: SessionInfo = {
      sessionId: 'sess-fb-123',
      token: 'tok-fb-123',
      type: 'flipbook',
      state: 'created',
      eventId: '1',
      eventName: 'SIC General Assembly',
      eventDate: 'May 24, 2026',
      createdAt: new Date().toISOString(),
    };

    const createSessionSpy = vi
      .spyOn(boothApi, 'createSession')
      .mockResolvedValue(createdSession);

    render(<WelcomeScreen />);

    fireEvent.click(screen.getByRole('button', { name: /Touch the screen to begin/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Continue/i }));

    // Click Flipbook
    const flipbookBtn = screen.getByRole('button', { name: /FLIPBOOK/i });
    fireEvent.click(flipbookBtn);

    // Should immediately transition without blocking with camera modal
    await waitFor(() => {
      const fbState = useFlipbookStore.getState();
      expect(fbState.currentStep).toBe('frame_select');
      expect(fbState.sessionId).toBe('sess-fb-123');
      expect(fbState.sessionToken).toBe('tok-fb-123');

      const sessState = useSessionStore.getState();
      expect(sessState.activeSession?.type).toBe('flipbook');
      expect(sessState.activeSession?.id).toBe('sess-fb-123');
    });

    expect(createSessionSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      'flipbook',
    );
  });

  it('opens camera setup modal when clicking Change Camera and allows applying or cancelling', async () => {
    render(<WelcomeScreen />);

    fireEvent.click(screen.getByRole('button', { name: /Touch the screen to begin/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Continue/i }));

    // Check Change Camera button exists
    const changeCamBtn = screen.getByRole('button', { name: /Change Camera/i });
    expect(changeCamBtn).toBeDefined();

    // Click Change Camera button
    fireEvent.click(changeCamBtn);

    // Camera setup modal appears
    expect(screen.getByText(/Choose your/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Apply Camera/i })).toBeDefined();

    // Click Cancel
    const cancelBtn = screen.getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelBtn);

    // Modal closes
    expect(screen.queryByText(/Choose your/i)).toBeNull();
  });

  it('renders ExperienceChoiceScreen directly when stage is choose_experience and preserves chosenEvent', async () => {
    useSessionStore.setState({
      activeSession: null,
      stage: 'choose_experience',
      selectedEvent: {
        id: 'evt-99',
        name: 'Tech Expo 2026',
        date: '2026-10-10',
        operatorName: 'Alex Cruz',
      },
    });

    render(<WelcomeScreen />);

    expect(screen.getByText('What are we creating today?')).toBeDefined();
    expect(screen.getAllByText(/PHOTO STRIP/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/FLIPBOOK/i).length).toBeGreaterThan(0);
  });
});


