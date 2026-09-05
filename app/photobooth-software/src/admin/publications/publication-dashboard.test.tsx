// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

afterEach(() => vi.unstubAllGlobals());

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
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull());
    expect(screen.getAllByText('queued')).toHaveLength(2);
  });
});
