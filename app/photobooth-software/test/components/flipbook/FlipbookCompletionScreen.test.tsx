// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FlipbookCompletionScreen } from '../../../src/components/flipbook/FlipbookCompletionScreen';
import { useFlipbookStore } from '../../../src/store/flipbook-store';
import { useSessionStore } from '../../../src/store/session-store';
import { boothApi } from '../../../src/services/api';
import * as flipbookPdf from '../../../src/services/flipbook-pdf';

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,mockqr'),
  },
}));

vi.mock('../../../src/services/flipbook-pdf', () => ({
  generateFlipbookPdf: vi.fn().mockResolvedValue({ blob: new Blob(['mock-pdf']), url: 'blob:mock-pdf', filename: 'flipbook-k9X2bQ1.pdf' }),
  printPdfBlobUrl: vi.fn().mockResolvedValue(undefined),
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
    expect(screen.getByText('k9X2bQ1')).toBeDefined();

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

  it('directly generates 300 DPI PDF, opens print dialog, and shows copies recovery dialog on clicking Print button', async () => {
    vi.spyOn(boothApi, 'recordPrint').mockResolvedValue(undefined);

    render(<FlipbookCompletionScreen />);

    const printButton = screen.getByRole('button', { name: /Print/i });
    fireEvent.click(printButton);

    // Check PDF generation and print dialog called directly without intermediate preview modal
    await waitFor(() => {
      expect(flipbookPdf.generateFlipbookPdf).toHaveBeenCalledWith(
        expect.objectContaining({
          publicId: 'k9X2bQ1',
          scope: 'all',
          copies: 1,
        }),
        expect.any(Function)
      );
      expect(flipbookPdf.printPdfBlobUrl).toHaveBeenCalledWith('blob:mock-pdf');
    });

    // Record prompt should appear asking for copies printed
    await waitFor(() => {
      expect(
        screen.getByText(/After printing, record the printed copy count if needed/i)
      ).toBeDefined();
      expect(screen.getByLabelText(/Copies printed/i)).toBeDefined();
      expect(screen.getByRole('button', { name: /Record copies/i })).toBeDefined();
    });

    // Ensure recordPrint was NOT called immediately on Print button click
    expect(boothApi.recordPrint).not.toHaveBeenCalled();

    // Change copies to 2 and click Record copies
    const selectElem = screen.getByLabelText(/Copies printed/i);
    fireEvent.change(selectElem, { target: { value: '2' } });

    const recordCopiesBtn = screen.getByRole('button', { name: /Record copies/i });
    fireEvent.click(recordCopiesBtn);

    await waitFor(() => {
      expect(boothApi.recordPrint).toHaveBeenCalledTimes(1);
      expect(boothApi.recordPrint).toHaveBeenCalledWith('old-session-123', 2, true);
      expect(useFlipbookStore.getState().copiesPrinted).toBe(2);
    });

    // Toast appears
    expect(screen.getByText('2 copies recorded.')).toBeDefined();
  });

  it('finishes session after printing and returns to experience choice', async () => {
    vi.spyOn(boothApi, 'recordPrint').mockResolvedValue(undefined);

    render(<FlipbookCompletionScreen />);

    // Click Print
    const printButton = screen.getByRole('button', { name: /Print/i });
    fireEvent.click(printButton);

    await waitFor(() => {
      expect(flipbookPdf.generateFlipbookPdf).toHaveBeenCalled();
    });

    // Dismiss copies dialog if present
    const dismissBtn = screen.getByRole('button', { name: /Dismiss/i });
    fireEvent.click(dismissBtn);

    // Click Session Done!
    const doneButton = screen.getByRole('button', { name: /^Session Done!$/i });
    fireEvent.click(doneButton);

    const sessionState = useSessionStore.getState();
    expect(sessionState.activeSession).toBeNull();
    expect(sessionState.stage).toBe('choose_experience');
  });
});
