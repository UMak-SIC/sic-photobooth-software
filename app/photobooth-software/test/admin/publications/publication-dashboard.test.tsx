// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicationDashboard } from '../../../src/admin/publications/publication-dashboard';

vi.mock('../../../src/services/flipbook-pdf', () => ({
  renderGangSheetToPng: vi.fn().mockResolvedValue('data:image/png;base64,mock-sheet'),
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

  it('retries every failed job and keeps successful requeues', async () => {
    const secondFailedPublication = {
      ...failedPublication,
      id: 'e0b692d8-ef13-4b79-922d-c5bb31056d67',
      publicId: 'DeF5678',
    };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [failedPublication, secondFailedPublication] }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { ...failedPublication, status: 'queued', lastError: null } }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { ...secondFailedPublication, status: 'queued', lastError: null },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetch);

    render(<PublicationDashboard />);
    expect(await screen.findByText('DeF5678', { exact: false })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry all failed (2)' }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Retry all failed/ })).toBeNull(),
    );
    expect(screen.getAllByText('Not uploaded')).toHaveLength(2);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/publications/d0b692d8-ef13-4b79-922d-c5bb31056d67/retry',
      { method: 'POST' },
    );
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/publications/e0b692d8-ef13-4b79-922d-c5bb31056d67/retry',
      { method: 'POST' },
    );
  });

  it('does not show a prior error for a queued retry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [
              {
                ...failedPublication,
                status: 'queued',
                retryCount: 1,
                nextAttemptAt: '2026-09-05T00:00:00.000Z',
              },
            ],
          }),
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
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ data: publications }), { status: 200 })),
    );

    render(<PublicationDashboard />);

    expect(await screen.findByText('Page 1 of 2', { exact: false })).toBeTruthy();
    expect(screen.queryByText('Photo20')).toBeNull();
    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Publication pages' })).getByRole('button', {
        name: 'Next',
      }),
    );
    expect(screen.getByText('Photo20')).toBeTruthy();
  });

  it('previews a photo strip and queues the selected number of copies', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [failedPublication] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { id: 'job-123', status: 'queued' } }), {
          status: 200,
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    render(<PublicationDashboard />);

    const printButton = await screen.findByRole('button', { name: /^Print$/i });
    fireEvent.click(printButton);

    const printDialog = await screen.findByRole('dialog', { name: /Print output/i });
    expect(screen.getByRole('img', { name: /Print preview for AbC1234/i })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Copies to print'), { target: { value: '2' } });
    fireEvent.click(within(printDialog).getByRole('button', { name: /^Print$/i }));

    await waitFor(() => {
      expect(screen.getByText('2 copies queued for printing.')).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenLastCalledWith('http://localhost:3000/api/print-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: expect.stringMatching(/"publicId":"AbC1234".*"copies":2/),
    });
  });

  it('renders print sheets before queueing a flipbook', async () => {
    const flipbookPub = {
      ...failedPublication,
      id: 'e1b692d8-ef13-4b79-922d-c5bb31056d99',
      publicId: 'Flip123',
      mediaType: 'image/gif',
      eventName: 'Flipbook Event',
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [flipbookPub] }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              coverUrl: '/frames/cover',
              motionFrameUrls: ['/frames/1', '/frames/2'],
              motionSheetUrl: '/templates/frame/background',
              frame: { placements: [{ x: 0, y: 0, width: 1, height: 1 }] },
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { id: 'job-fb', status: 'queued' } }), {
          status: 200,
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    render(<PublicationDashboard />);

    const printButton = await screen.findByRole('button', { name: /^Print$/i });
    fireEvent.click(printButton);
    const printDialog = await screen.findByRole('dialog', { name: /Print output/i });
    expect(await screen.findByRole('img', { name: /Print sheet 1 for Flip123/i })).toBeTruthy();
    fireEvent.click(
      within(printDialog).getByRole('button', {
        name: /^Print$/i,
      }),
    );

    await waitFor(() => {
      expect(screen.getByText('1 copy queued for printing.')).toBeTruthy();
    });
  });

});
