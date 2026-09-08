// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicationDashboard } from './publication-dashboard';

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
});
