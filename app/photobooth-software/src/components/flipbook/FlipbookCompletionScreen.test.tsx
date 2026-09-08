// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FlipbookCompletionScreen } from './FlipbookCompletionScreen';
import { useFlipbookStore } from '../../store/flipbook-store';
import { useSessionStore } from '../../store/session-store';
import { boothApi } from '../../services/api';

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,mockqr'),
  },
}));

vi.mock('../../services/flipbook-pdf', () => ({
  generateFlipbookPdf: vi.fn().mockResolvedValue('blob:mock-pdf'),
  printPdfBlobUrl: vi.fn(),
}));

describe('FlipbookCompletionScreen layout and session lifecycle', () => {
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

  it('renders logo, SIC PHOTOBOOTH branding, headline, QR section, public code, and action buttons matching PrintModal layout', async () => {
    render(<FlipbookCompletionScreen />);

    // Logo
    const logoImg = screen.getByAltText(/SIC Photobooth Logo/i);
    expect(logoImg).toBeDefined();
    expect(logoImg.getAttribute('src')).toBe('/assets/images/logo.svg');

    // Branding & Headline
    expect(screen.getByText('SIC PHOTOBOOTH')).toBeDefined();
    expect(screen.getByText(/Your masterpiece/i)).toBeDefined();
    expect(screen.getByText(/is ready!/i)).toBeDefined();

    // QR Code helper & Public ID
    expect(screen.getByText('Scan to see your copy!')).toBeDefined();
    expect(screen.getByText('K9X2BQ1')).toBeDefined();

    // Action buttons
    expect(screen.getByRole('button', { name: /Session Done!/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Print/i })).toBeDefined();
  });

  it('shows unprinted warning modal when clicking Session Done! before printing and allows exit anyway to experience choice', async () => {
    render(<FlipbookCompletionScreen />);

    const doneButton = screen.getByRole('button', { name: /Session Done!/i });
    fireEvent.click(doneButton);

    // Warning dialog should appear
    expect(screen.getByText('Not printed yet?')).toBeDefined();
    expect(screen.getByRole('button', { name: /Exit Anyway/i })).toBeDefined();

    // Clicking Exit Anyway resets flipbook and returns to experience screen
    const exitAnywayBtn = screen.getByRole('button', { name: /Exit Anyway/i });
    fireEvent.click(exitAnywayBtn);

    await waitFor(() => {
      const flipbookState = useFlipbookStore.getState();
      expect(flipbookState.sessionId).toBeNull();
      expect(flipbookState.publicId).toBeNull();
      expect(flipbookState.outputGifUrl).toBeNull();
      expect(flipbookState.coverUrls).toEqual([]);
      expect(flipbookState.videoUrls).toEqual([]);
    });

    const sessionState = useSessionStore.getState();
    expect(sessionState.activeSession).toBeNull();
    expect(sessionState.stage).toBe('choose_experience');
  });

  it('opens print modal on clicking Print button', async () => {
    render(<FlipbookCompletionScreen />);

    const printButton = screen.getByRole('button', { name: /Print/i });
    fireEvent.click(printButton);

    expect(screen.getByText(/Flipbook Print Layout/i)).toBeDefined();
  });

  it('finishes session directly after print and returns to experience choice', async () => {
    vi.spyOn(boothApi, 'recordPrint').mockResolvedValue(undefined);

    render(<FlipbookCompletionScreen />);

    // Open print modal
    const printButton = screen.getByRole('button', { name: /Print/i });
    fireEvent.click(printButton);

    expect(screen.getByText(/Flipbook Print Layout/i)).toBeDefined();

    // Trigger Print inside modal
    const printPdfBtn = screen.getByRole('button', { name: /Print.*PDF/i });
    fireEvent.click(printPdfBtn);

    await waitFor(() => {
      expect(boothApi.recordPrint).toHaveBeenCalled();
    });

    // Close modal
    const doneModalBtn = screen.getByRole('button', { name: /^Done$/i });
    fireEvent.click(doneModalBtn);

    // Click Session Done!
    const doneButton = screen.getByRole('button', { name: /^Session Done!$/i });
    fireEvent.click(doneButton);

    const sessionState = useSessionStore.getState();
    expect(sessionState.activeSession).toBeNull();
    expect(sessionState.stage).toBe('choose_experience');
  });
});
