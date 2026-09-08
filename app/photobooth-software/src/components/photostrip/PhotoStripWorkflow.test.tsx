// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PhotoStripWorkflow } from './PhotoStripWorkflow';
import { usePhotoStripStore } from '../../store/photostrip-store';
import { useSessionStore } from '../../store/session-store';
import { boothApi } from '../../services/api';

describe('PhotoStripWorkflow flow: layout confirmation and instructions screen', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();

    usePhotoStripStore.setState({
      currentStep: 'setup',
      sessionId: null,
      sessionToken: null,
      selectedEvent: null,
      selectedTemplate: null,
      captures: [],
      retakeCount: 0,
      activeSlotIndex: 1,
      isRetaking: false,
      isCountingDown: false,
      countdownSeconds: 5,
      publicId: null,
      qrUrl: null,
      outputImageUrl: null,
      isConfirming: false,
      errorMessage: null,
      isPrinted: false,
      copiesPrinted: 0,
    });

    useSessionStore.setState({
      activeSession: {
        id: '',
        type: 'photo_strip',
      },
    });
  });

  it('selects layout card and advances to instructions on clicking I LIKE THIS', async () => {
    vi.spyOn(boothApi, 'listTemplates').mockResolvedValue([
      {
        id: 'test-template-1',
        name: 'Retro Strip',
        orientation: 'portrait',
        outputWidth: 1200,
        outputHeight: 1800,
        countdownSeconds: 5,
        requiredCaptureCount: 3,
        placements: [
          { captureIndex: 1, x: 100, y: 100, width: 1000, height: 400, zIndex: 1 },
          { captureIndex: 2, x: 100, y: 600, width: 1000, height: 400, zIndex: 1 },
          { captureIndex: 3, x: 100, y: 1100, width: 1000, height: 400, zIndex: 1 },
        ],
      },
    ]);

    usePhotoStripStore.setState({
      currentStep: 'template_select',
      sessionId: 'session-photo-123',
      sessionToken: 'token-photo-123',
    });

    render(<PhotoStripWorkflow />);

    const templateCard = await screen.findByText('Retro Strip');
    fireEvent.click(templateCard);

    const confirmButton = screen.getByRole('button', { name: /I LIKE THIS/i });
    fireEvent.click(confirmButton);

    // Should now be on instructions step
    await waitFor(() => {
      const state = usePhotoStripStore.getState();
      expect(state.currentStep).toBe('instructions');
      expect(state.selectedTemplate?.id).toBe('test-template-1');
    });

    expect(screen.getByText(/Get ready to strike a pose/i)).toBeDefined();
    expect(screen.getByText('Hands-Free Capture')).toBeDefined();
    expect(screen.getByText('Keep Best Shots')).toBeDefined();
    expect(screen.getByText(/LET'S GO/i)).toBeDefined();
  });

  it('advances from instructions to capturing when manually clicking Start camera now', async () => {
    usePhotoStripStore.setState({
      currentStep: 'instructions',
      sessionId: 'session-photo-123',
      selectedTemplate: {
        id: 'test-template-1',
        name: 'Retro Strip',
        orientation: 'portrait',
        outputWidth: 1200,
        outputHeight: 1800,
        countdownSeconds: 5,
        placements: [],
      },
    });

    const transitionSpy = vi.spyOn(boothApi, 'transition').mockResolvedValue();

    render(<PhotoStripWorkflow />);

    const startCameraBtn = screen.getByRole('button', { name: /Start camera now/i });
    fireEvent.click(startCameraBtn);

    await waitFor(() => {
      const state = usePhotoStripStore.getState();
      expect(state.currentStep).toBe('capturing');
    });

    expect(transitionSpy).toHaveBeenCalledWith('session-photo-123', 'capturing');
  });

  it('auto-advances from instructions to capturing after 6 seconds countdown', async () => {
    vi.useFakeTimers();

    usePhotoStripStore.setState({
      currentStep: 'instructions',
      sessionId: 'session-photo-123',
      selectedTemplate: {
        id: 'test-template-1',
        name: 'Retro Strip',
        orientation: 'portrait',
        outputWidth: 1200,
        outputHeight: 1800,
        countdownSeconds: 5,
        placements: [],
      },
    });

    vi.spyOn(boothApi, 'transition').mockResolvedValue();

    render(<PhotoStripWorkflow />);

    expect(screen.getByText(/Starting camera in 10s/i)).toBeDefined();

    // Fast-forward 10 seconds
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });

    const state = usePhotoStripStore.getState();
    expect(state.currentStep).toBe('capturing');
  });

  it('navigates back to experience choice from template_select screen', async () => {
    vi.spyOn(boothApi, 'listTemplates').mockResolvedValue([
      {
        id: 'test-template-1',
        name: 'Retro Strip',
        orientation: 'portrait',
        outputWidth: 1200,
        outputHeight: 1800,
        countdownSeconds: 5,
        requiredCaptureCount: 3,
        placements: [],
      },
    ]);

    usePhotoStripStore.setState({
      currentStep: 'template_select',
      sessionId: 'session-photo-123',
      sessionToken: 'token-photo-123',
    });

    render(<PhotoStripWorkflow />);

    const backButton = await screen.findByRole('button', { name: /Back/i });
    expect(backButton).toBeDefined();

    fireEvent.click(backButton);

    const sessionState = useSessionStore.getState();
    expect(sessionState.activeSession).toBeNull();
    expect(sessionState.stage).toBe('choose_experience');
  });
});
