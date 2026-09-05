import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DownloadButton } from '../src/DownloadButton.js';

describe('DownloadButton', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  it('renders default button text and download icon', () => {
    render(<DownloadButton mediaUrl="https://example.com/photo.png" />);

    expect(screen.getByRole('button')).toBeDefined();
    expect(screen.getByText('Download')).toBeDefined();
  });

  it('renders custom label when provided', () => {
    render(<DownloadButton mediaUrl="https://example.com/photo.png" label="Save Photo" />);

    expect(screen.getByText('Save Photo')).toBeDefined();
  });

  it('triggers download process on click', async () => {
    const onStart = vi.fn();
    const onComplete = vi.fn();

    // Mock fetch for blob
    globalThis.fetch = vi.fn().mockResolvedValue({
      blob: () => Promise.resolve(new Blob(['mock-data'], { type: 'image/png' })),
    });

    // Mock anchor click to prevent jsdom navigation warning
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(
      <DownloadButton
        mediaUrl="https://example.com/photo.png"
        fileName="my-photo.png"
        enableShare={false}
        onDownloadStart={onStart}
        onDownloadComplete={onComplete}
      />,
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await waitFor(() => {
      expect(onStart).toHaveBeenCalled();
      expect(onComplete).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
    });

    clickSpy.mockRestore();
  });
});
