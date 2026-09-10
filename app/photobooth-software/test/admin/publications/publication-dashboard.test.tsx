// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicationDashboard } from '../../../src/admin/publications/publication-dashboard';

vi.mock('../../../src/services/flipbook-pdf', () => ({
  generateFlipbookPdf: vi.fn().mockResolvedValue({ blob: new Blob([]), url: 'blob:mock-pdf', filename: 'flipbook-mock.pdf' }),
  generatePhotoStripPdf: vi.fn().mockResolvedValue({ blob: new Blob([]), url: 'blob:mock-pdf', filename: 'photostrip-mock.pdf' }),
  uploadPdfBlob: vi.fn().mockResolvedValue(true),
  printPdfBlobUrl: vi.fn().mockResolvedValue(undefined),
}));

const failedPublication = {
  id: 'd0b692d8-ef13-4b79-922d-c5bb31056d67',
  publicId: 'AbC1234',
  status: 'failed',
  retryCount: 5,
  lastAttemptAt: null,
  nextAttemptAt: null,
  lastError: 'Cloud service unavailable.',
  cloudFinalizedAt: null,
  cloudinaryUrl: null,
  cloudinaryPublicId: null,
  expiresAt: null,
  createdAt: '2026-09-05T00:00:00.000Z',
  mediaType: 'image/png',
  eventName: 'SIC General Assembly',
  eventDate: '2026-09-05',
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('PublicationDashboard', () => {
  it('shows failed jobs and requeues one after a successful retry', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [failedPublication] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { ...failedPublication, status: 'queued', retryCount: 0, lastError: null },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetch);

    render(<PublicationDashboard />);
    expect(await screen.findByText('AbC1234', { exact: false })).toBeTruthy();
    fireEvent.click(screen.getByLabelText('More actions for AbC1234'));
    fireEvent.click(screen.getByRole('button', { name: 'Retry upload' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Retry upload' })).toBeNull());
    expect(screen.getAllByText('Not uploaded')).toHaveLength(1);
  });

  it('does not show a prior error for a queued retry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ data: [{ ...failedPublication, status: 'queued', retryCount: 1, nextAttemptAt: '2026-09-05T00:00:00.000Z' }] }),
          { status: 200 },
        ),
      ),
    );

    render(<PublicationDashboard />);

    expect(await screen.findByText('Next retry scheduled')).toBeTruthy();
    expect(screen.queryByText('Cloud service unavailable.')).toBeNull();
  });

  it('shows 20 publications per page', async () => {
    const publications = Array.from({ length: 21 }, (_, index) => ({
      ...failedPublication,
      id: `d0b692d8-ef13-4b79-922d-c5bb31056d${String(index).padStart(2, '0')}`,
      publicId: `Photo${String(index).padStart(2, '0')}`,
      eventName: `Event ${index}`,
    }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: publications }), { status: 200 })));

    render(<PublicationDashboard />);

    expect(await screen.findByText('Page 1 of 2', { exact: false })).toBeTruthy();
    expect(screen.queryByText('Photo20')).toBeNull();
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Publication pages' })).getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Photo20')).toBeTruthy();
  });

  it('allows printing photo strips, opens copies prompt modal, and records copies', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [failedPublication] }), { status: 200 }),
      )
      // GET /pdf -> 404
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      // POST /pdf -> 200
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))
      // POST /print -> 200
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { jobId: 'job-123', copiesPrinted: 2 } }), {
          status: 200,
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    render(<PublicationDashboard />);

    const printButton = await screen.findByRole('button', { name: /^Print$/i });
    fireEvent.click(printButton);

    // Modal should appear
    expect(await screen.findByRole('dialog', { name: /Record printed copies/i })).toBeTruthy();
    expect(screen.getByText(/After printing, record the printed copy count/i)).toBeTruthy();

    // Select 2 copies and click Record copies
    const select = screen.getByLabelText(/Copies printed/i);
    fireEvent.change(select, { target: { value: '2' } });

    const recordBtn = screen.getByRole('button', { name: /Record copies/i });
    fireEvent.click(recordBtn);

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Record printed copies/i })).toBeNull();
      expect(screen.getByText('2 copies recorded.')).toBeTruthy();
    });
  });

  it('allows printing flipbooks, fetches flipbook data, and records copies', async () => {
    const flipbookPub = {
      ...failedPublication,
      id: 'e1b692d8-ef13-4b79-922d-c5bb31056d99',
      publicId: 'Flip123',
      mediaType: 'image/gif',
      eventName: 'Flipbook Event',
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [flipbookPub] }), { status: 200 }),
      )
      // GET /pdf -> 404
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      // GET /flipbook-data -> 200
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              publicId: 'Flip123',
              mediaType: 'image/gif',
              frame: null,
              coverUrl: '/frames/cover',
              motionFrameUrls: ['/frames/1', '/frames/2'],
            },
          }),
          { status: 200 },
        ),
      )
      // POST /pdf -> 200
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))
      // POST /print -> 200
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { jobId: 'job-fb', copiesPrinted: 3 } }), {
          status: 200,
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    render(<PublicationDashboard />);

    const printButton = await screen.findByRole('button', { name: /^Print$/i });
    fireEvent.click(printButton);

    // Modal should appear
    expect(await screen.findByRole('dialog', { name: /Record printed copies/i })).toBeTruthy();

    const select = screen.getByLabelText(/Copies printed/i);
    fireEvent.change(select, { target: { value: '3' } });

    const recordBtn = screen.getByRole('button', { name: /Record copies/i });
    fireEvent.click(recordBtn);

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Record printed copies/i })).toBeNull();
      expect(screen.getByText('3 copies recorded.')).toBeTruthy();
    });
  });

  it('uses cached 4R PDF when available in storage', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [failedPublication] }), { status: 200 }),
      )
      // GET /pdf -> 200 (PDF blob)
      .mockResolvedValueOnce(new Response(new Blob(['%PDF-1.4']), { status: 200, headers: { 'Content-Type': 'application/pdf' } }))
      // POST /print -> 200
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { jobId: 'job-cached', copiesPrinted: 1 } }), {
          status: 200,
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    // Mock URL.createObjectURL
    const origCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = vi.fn().mockReturnValue('blob:cached-pdf-url');

    render(<PublicationDashboard />);

    const printButton = await screen.findByRole('button', { name: /^Print$/i });
    fireEvent.click(printButton);

    expect(await screen.findByRole('dialog', { name: /Record printed copies/i })).toBeTruthy();

    const recordBtn = screen.getByRole('button', { name: /Record copies/i });
    fireEvent.click(recordBtn);

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Record printed copies/i })).toBeNull();
      expect(screen.getByText('1 copy recorded.')).toBeTruthy();
    });

    URL.createObjectURL = origCreateObjectURL;
  });
});
