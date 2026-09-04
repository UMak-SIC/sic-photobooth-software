import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MediaPreview } from '../src/MediaPreview.js';

describe('MediaPreview', () => {
  it('renders session badge, event name, and event date', () => {
    render(
      <MediaPreview
        src="https://example.com/photo.png"
        sessionType="photo_strip"
        eventName="Annual Gala 2026"
        eventDate="2026-09-04"
      />,
    );

    expect(screen.getByTestId('session-type-badge').textContent).toBe('Photo Strip');
    expect(screen.getByText('Annual Gala 2026')).toBeDefined();
    expect(screen.getByText('2026-09-04')).toBeDefined();
  });

  it('renders flipbook badge when sessionType is flipbook', () => {
    render(<MediaPreview src="https://example.com/flipbook.gif" sessionType="flipbook" />);

    expect(screen.getByTestId('session-type-badge').textContent).toBe('Flipbook');
  });

  it('shows loading skeleton initially and hides it once image loads', () => {
    render(<MediaPreview src="https://example.com/photo.png" sessionType="photo_strip" />);

    expect(screen.getByTestId('media-skeleton')).toBeDefined();

    const img = screen.getByTestId('media-image');
    fireEvent.load(img);

    expect(screen.queryByTestId('media-skeleton')).toBeNull();
  });

  it('shows error fallback when image fails to load', () => {
    render(<MediaPreview src="https://example.com/broken.png" sessionType="photo_strip" />);

    const img = screen.getByTestId('media-image');
    fireEvent.error(img);

    expect(screen.getByTestId('media-error-state')).toBeDefined();
    expect(screen.getByText('Unable to load media preview')).toBeDefined();
  });
});
