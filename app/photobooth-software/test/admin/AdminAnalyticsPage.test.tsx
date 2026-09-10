// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AdminAnalyticsPage } from '../../src/admin/analytics/AdminAnalyticsPage';
import * as analyticsApi from '../../src/admin/analytics/api';
import type { AnalyticsData } from '../../src/admin/analytics/types';

const mockAnalyticsData: AnalyticsData = {
  summary: {
    totalSessions: 10,
    completedSessions: 10,
    printedSessions: 10,
    totalPrints: 24,
    averageCopiesPerSession: 2.4,
    overallReprintRate: 60.0,
    photoStripSessions: 7,
    photoStripPrints: 18,
    flipbookSessions: 3,
    flipbookPrints: 6,
  },
  typeComparison: [
    {
      type: 'photo_strip',
      label: 'Photo Strips',
      sessions: 7,
      totalPrints: 18,
      sharePercent: 75.0,
      averageCopies: 2.57,
      reprintRate: 71.4,
    },
    {
      type: 'flipbook',
      label: 'Flipbooks',
      sessions: 3,
      totalPrints: 6,
      sharePercent: 25.0,
      averageCopies: 2.0,
      reprintRate: 33.3,
    },
  ],
  templates: [
    {
      templateId: 'tpl-couple-heart',
      name: 'Couple Heart 8-Slot',
      type: 'photo_strip',
      layoutCategory: '2_cut_split',
      layoutLabel: '2-Cut Split (Couple / Duplicates)',
      totalSessions: 4,
      totalPrints: 12,
      averageCopies: 3.0,
      reprintSessions: 4,
      reprintRate: 100.0,
      shareOfPrintsPercent: 50.0,
    },
    {
      templateId: 'tpl-classic-3',
      name: 'Classic 3-Pose',
      type: 'photo_strip',
      layoutCategory: 'single_strip',
      layoutLabel: 'Single Strip (Uncut)',
      totalSessions: 3,
      totalPrints: 6,
      averageCopies: 2.0,
      reprintSessions: 1,
      reprintRate: 33.3,
      shareOfPrintsPercent: 25.0,
    },
    {
      templateId: 'tpl-flipbook-arcade',
      name: 'Arcade Flipbook',
      type: 'flipbook',
      layoutCategory: 'flipbook',
      layoutLabel: 'Flipbook Booklet',
      totalSessions: 3,
      totalPrints: 6,
      averageCopies: 2.0,
      reprintSessions: 1,
      reprintRate: 33.3,
      shareOfPrintsPercent: 25.0,
    },
  ],
  layoutBreakdown: [
    {
      category: '2_cut_split',
      label: '2-Cut Split (Couple / Duplicates)',
      description: '4 shots duplicated across 8 slots',
      totalSessions: 4,
      totalPrints: 12,
      averageCopies: 3.0,
      reprintSessions: 4,
      reprintRate: 100.0,
      sharePercent: 50.0,
    },
    {
      category: 'single_strip',
      label: 'Single Strip (Uncut)',
      description: '3-shot single strip',
      totalSessions: 3,
      totalPrints: 6,
      averageCopies: 2.0,
      reprintSessions: 1,
      reprintRate: 33.3,
      sharePercent: 25.0,
    },
    {
      category: 'flipbook',
      label: 'Flipbook Booklet',
      description: '16-frame animated booklet',
      totalSessions: 3,
      totalPrints: 6,
      averageCopies: 2.0,
      reprintSessions: 1,
      reprintRate: 33.3,
      sharePercent: 25.0,
    },
  ],
  copiesDistribution: {
    oneCopy: 4,
    twoCopies: 2,
    threeCopies: 3,
    fourPlusCopies: 1,
    oneCopyPercent: 40.0,
    twoCopiesPercent: 20.0,
    threeCopiesPercent: 30.0,
    fourPlusCopiesPercent: 10.0,
  },
  timeseries: [
    {
      date: '2026-09-10',
      totalSessions: 10,
      totalPrints: 24,
      photoStripPrints: 18,
      flipbookPrints: 6,
    },
  ],
};

describe('AdminAnalyticsPage', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/events')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              data: [
                { id: 'evt-1', name: 'UMak Foundation Day', date: '2026-09-10' },
              ],
            }),
        } as Response);
      }
      if (urlStr.includes('/api/admin/analytics')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              data: mockAnalyticsData,
            }),
        } as Response);
      }
      return Promise.reject(new Error(`Unknown endpoint: ${urlStr}`));
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders all 4 executive KPI cards answering core questions', async () => {
    render(<AdminAnalyticsPage />);

    // 1. Total prints
    await waitFor(() => {
      expect(screen.getAllByText('24').length).toBeGreaterThan(0);
      expect(screen.getByText(/18 strip prints/i)).toBeDefined();
    });

    // 2. Average copies per session
    expect(screen.getByText('2.4')).toBeDefined();
    expect(screen.getByText(/60% of sessions/i)).toBeDefined();

    // 3. Which sells better
    expect(screen.getAllByText('Photo Strips').length).toBeGreaterThan(0);

    // 4. Top reprint driver
    expect(screen.getAllByText(/2-Cut Split \(Couple \/ Duplicates\)/i).length).toBeGreaterThan(0);
  });

  it('renders template leaderboard table and allows sorting', async () => {
    render(<AdminAnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText('Couple Heart 8-Slot')).toBeDefined();
      expect(screen.getByText('Classic 3-Pose')).toBeDefined();
      expect(screen.getByText('Arcade Flipbook')).toBeDefined();
    });

    // Test sort by name header click
    const nameHeader = screen.getByText(/Template Name/i);
    fireEvent.click(nameHeader);

    // Verify sort triggered without crashing
    expect(screen.getByText('Arcade Flipbook')).toBeDefined();
  });

  it('triggers CSV export on Export CSV button click', async () => {
    const exportSpy = vi.spyOn(analyticsApi, 'exportAnalyticsToCsv').mockImplementation(() => {});

    render(<AdminAnalyticsPage />);

    await waitFor(() => {
      expect(screen.getAllByText('24').length).toBeGreaterThan(0);
    });

    const exportBtn = screen.getByRole('button', { name: /Export CSV/i });
    fireEvent.click(exportBtn);

    expect(exportSpy).toHaveBeenCalledWith(mockAnalyticsData, 'All Events');
  });

  it('handles date preset filter switching', async () => {
    render(<AdminAnalyticsPage />);

    await waitFor(() => {
      expect(screen.getAllByText('24').length).toBeGreaterThan(0);
    });

    const sevenDaysBtn = screen.getByRole('button', { name: '7 Days' });
    fireEvent.click(sevenDaysBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('startDate='),
      );
    });
  });

  it('filters templates table by search query and type filter', async () => {
    render(<AdminAnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText('Couple Heart 8-Slot')).toBeDefined();
      expect(screen.getByText('Classic 3-Pose')).toBeDefined();
    });

    // Test search filter
    const searchInput = screen.getByPlaceholderText('Search templates...');
    fireEvent.change(searchInput, { target: { value: 'Heart' } });

    expect(screen.getByText('Couple Heart 8-Slot')).toBeDefined();
    expect(screen.queryByText('Classic 3-Pose')).toBeNull();

    // Reset search
    fireEvent.change(searchInput, { target: { value: '' } });
    expect(screen.getByText('Classic 3-Pose')).toBeDefined();

    // Filter by Flipbooks
    const flipbooksBtn = screen.getByRole('button', { name: 'Flipbooks' });
    fireEvent.click(flipbooksBtn);

    expect(screen.getByText('Arcade Flipbook')).toBeDefined();
    expect(screen.queryByText('Classic 3-Pose')).toBeNull();
  });
});

