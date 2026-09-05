import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { StatusBanner } from '../src/StatusBanner.js';

describe('StatusBanner', () => {
  it('renders processing message for processing variant', () => {
    render(<StatusBanner variant="processing" />);

    expect(screen.getByTestId('status-title').textContent).toBe('Processing Media');
    expect(screen.getByTestId('status-message').textContent).toBe(
      'Your photos are still processing. Please wait a moment.',
    );
  });

  it('renders exact local 404 message and default "Scan Another" action button', () => {
    const onAction = vi.fn();
    render(<StatusBanner variant="not_found_local" onAction={onAction} />);

    expect(screen.getByTestId('status-title').textContent).toBe('Photo Not Found');
    expect(screen.getByTestId('status-message').textContent).toBe(
      'Photo not found. Check the QR code or enter the full link/code again.',
    );

    const actionBtn = screen.getByTestId('status-action-button');
    expect(actionBtn.textContent).toBe('Scan Another');

    fireEvent.click(actionBtn);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('renders exact public 404 message for not_found_public variant', () => {
    render(<StatusBanner variant="not_found_public" />);

    expect(screen.getByTestId('status-title').textContent).toBe('Media Unavailable');
    expect(screen.getByTestId('status-message').textContent).toBe(
      'This photo has not been published or is no longer available.',
    );
  });

  it('renders exact expired message for expired variant', () => {
    render(<StatusBanner variant="expired" />);

    expect(screen.getByTestId('status-title').textContent).toBe('Media Expired');
    expect(screen.getByTestId('status-message').textContent).toBe(
      'This photo has expired and is no longer available.',
    );
  });

  it('renders custom messageOverride and actionLabel when provided', () => {
    const onAction = vi.fn();
    render(
      <StatusBanner
        variant="error"
        messageOverride="Custom connection failure occurred."
        actionLabel="Retry Now"
        onAction={onAction}
      />,
    );

    expect(screen.getByTestId('status-message').textContent).toBe(
      'Custom connection failure occurred.',
    );
    expect(screen.getByTestId('status-action-button').textContent).toBe('Retry Now');
  });
});
