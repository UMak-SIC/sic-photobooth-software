// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PrintModal } from '../../../src/components/photostrip/PrintModal';
import * as flipbookPdf from '../../../src/services/flipbook-pdf';

vi.mock('../../../src/services/flipbook-pdf', () => ({
  generatePhotoStripPdf: vi.fn().mockResolvedValue({ blob: new Blob(['mock-pdf']), url: 'blob:mock-pdf', filename: 'photostrip-mock.pdf' }),
  uploadPdfBlob: vi.fn().mockResolvedValue(true),
  printPdfBlobUrl: vi.fn().mockResolvedValue(undefined),
}));

describe('PrintModal completion & print screen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders logo, SIC PHOTOBOOTH branding, headline, QR section, public code, and action buttons', async () => {
    render(
      <PrintModal
        publicId="M7P4XAV"
        qrUrl="https://myphotobooth.com/M7P4XAV"
        outputImageUrl="blob:output-image"
      />
    );

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
    expect(screen.getByText('M7P4XAV')).toBeDefined();

    // Action buttons
    expect(screen.getByRole('button', { name: /Session Done!/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Print/i })).toBeDefined();
  });

  it('generates 300 DPI 4R PDF and opens record prompt on clicking Print button without immediately recording copies', async () => {
    const onPrintConfirmedMock = vi.fn();

    render(
      <PrintModal
        publicId="M7P4XAV"
        qrUrl="https://myphotobooth.com/M7P4XAV"
        outputImageUrl="blob:output-image"
        onPrintConfirmed={onPrintConfirmedMock}
      />
    );

    const printButton = screen.getByRole('button', { name: /Print/i });
    fireEvent.click(printButton);

    await waitFor(() => {
      expect(flipbookPdf.generatePhotoStripPdf).toHaveBeenCalledWith('blob:output-image', 'M7P4XAV', 1);
      expect(flipbookPdf.printPdfBlobUrl).toHaveBeenCalledWith('blob:mock-pdf');
    });

    expect(onPrintConfirmedMock).not.toHaveBeenCalled();
    expect(screen.getByText(/After printing, record the printed copy count/i)).toBeDefined();
  });

  it('calls onFinishSession when clicking Session Done! after printing', () => {
    const onFinishSessionMock = vi.fn();

    render(
      <PrintModal
        publicId="M7P4XAV"
        qrUrl="https://myphotobooth.com/M7P4XAV"
        outputImageUrl="blob:output-image"
        isPrinted={true}
        onFinishSession={onFinishSessionMock}
      />
    );

    const doneButton = screen.getByRole('button', { name: /Session Done!/i });
    fireEvent.click(doneButton);

    expect(onFinishSessionMock).toHaveBeenCalled();
  });

  it('shows unprinted warning modal when clicking Session Done before printing and allows exit anyway or print now', () => {
    const onFinishSessionMock = vi.fn();
    vi.spyOn(window, 'print').mockImplementation(() => {});

    render(
      <PrintModal
        publicId="M7P4XAV"
        qrUrl="https://myphotobooth.com/M7P4XAV"
        outputImageUrl="blob:output-image"
        isPrinted={false}
        onFinishSession={onFinishSessionMock}
      />
    );

    // Clicking Session Done! when not printed should show modal
    const doneButton = screen.getByRole('button', { name: /Session Done!/i });
    fireEvent.click(doneButton);

    expect(onFinishSessionMock).not.toHaveBeenCalled();
    expect(screen.getByText('Not printed yet?')).toBeDefined();
    expect(screen.getByRole('button', { name: /Exit Anyway/i })).toBeDefined();

    // Clicking Exit Anyway forces finish
    const exitAnywayBtn = screen.getByRole('button', { name: /Exit Anyway/i });
    fireEvent.click(exitAnywayBtn);

    expect(onFinishSessionMock).toHaveBeenCalled();
  });

  it('renders record printed copies modal after print and allows recording manual copies', async () => {
    const onPrintConfirmedMock = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(window, 'print').mockImplementation(() => {});

    render(
      <PrintModal
        publicId="M7P4XAV"
        qrUrl="https://myphotobooth.com/M7P4XAV"
        outputImageUrl="blob:output-image"
        onPrintConfirmed={onPrintConfirmedMock}
      />
    );

    const printButton = screen.getByRole('button', { name: /Print/i });
    fireEvent.click(printButton);

    // After clicking print, showPrintRecord is set to true -> banner appears
    expect(await screen.findByText(/After printing, record the printed copy count/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Record copies/i })).toBeDefined();

    const recordBtn = screen.getByRole('button', { name: /Record copies/i });
    fireEvent.click(recordBtn);

    await waitFor(() => {
      expect(onPrintConfirmedMock).toHaveBeenCalledWith(1, true);
    });
  });
});

