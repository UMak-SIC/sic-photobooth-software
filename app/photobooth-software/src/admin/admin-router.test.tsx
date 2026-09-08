// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminRouter } from './admin-router';

vi.mock('./templates/api', () => ({
  templateApi: { list: vi.fn().mockResolvedValue([]) },
  assetUrl: () => null,
}));

afterEach(() => {
  window.history.replaceState({}, '', '/admin/templates');
  vi.unstubAllGlobals();
});

describe('AdminRouter navigation', () => {
  it('navigates to every sidebar destination without a page reload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ data: [] })))),
    );
    render(<AdminRouter />);

    fireEvent.click(screen.getByRole('link', { name: 'Events' }));
    expect(await screen.findByRole('heading', { name: 'Current events' })).toBeTruthy();

    fireEvent.click(screen.getByRole('link', { name: 'Flipbook frames' }));
    expect(await screen.findByRole('heading', { name: 'Frame library' })).toBeTruthy();

    fireEvent.click(screen.getByRole('link', { name: 'Publications' }));
    expect(await screen.findByRole('heading', { name: 'Online delivery' })).toBeTruthy();
  });
});
