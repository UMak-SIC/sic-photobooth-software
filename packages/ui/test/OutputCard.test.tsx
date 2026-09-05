import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { OutputCard } from '../src/OutputCard.js';
import type { PublicOutputMetadata } from '@photobooth/public-output';

describe('OutputCard', () => {
  const mockOutput: PublicOutputMetadata = {
    publicId: '7fK92pQ',
    sessionType: 'photo_strip',
    mediaType: 'image/png',
    mediaUrl: 'https://myphotobooth.com/photos/7fK92pQ.png',
    eventName: 'Graduation 2026',
    eventDate: '2026-09-04',
    createdAt: '2026-09-04T12:00:00Z',
    expiresAt: '2026-11-04T12:00:00Z',
    status: 'uploaded',
  };

  it('renders media preview, event info, expiration date, and download button', () => {
    render(<OutputCard output={mockOutput} />);

    expect(screen.getByTestId('output-card')).toBeDefined();
    expect(screen.getByText('Graduation 2026')).toBeDefined();
    expect(screen.getByText('2026-11-04')).toBeDefined();
    expect(screen.getByTestId('download-button')).toBeDefined();
  });

  it('renders offline message when expiresAt is null', () => {
    const offlineOutput: PublicOutputMetadata = {
      ...mockOutput,
      expiresAt: null,
      status: 'queued',
    };

    render(<OutputCard output={offlineOutput} />);

    expect(screen.getByText('Offline local retrieval copy')).toBeDefined();
  });
});
