import type { AnalyticsData } from './types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export async function fetchAnalytics(params: {
  eventId?: string;
  startDate?: string;
  endDate?: string;
} = {}): Promise<AnalyticsData> {
  const searchParams = new URLSearchParams();
  if (params.eventId && params.eventId !== 'all') {
    searchParams.set('eventId', params.eventId);
  }
  if (params.startDate) {
    searchParams.set('startDate', params.startDate);
  }
  if (params.endDate) {
    searchParams.set('endDate', params.endDate);
  }

  const query = searchParams.toString();
  const url = `${API_BASE_URL}/api/admin/analytics${query ? `?${query}` : ''}`;

  const res = await fetch(url);
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to load analytics: ${res.statusText} (${errorText})`);
  }

  const json = await res.json();
  if (!json.success) {
    throw new Error(json.error?.message || 'Analytics query returned an error');
  }

  return json.data;
}

export function exportAnalyticsToCsv(data: AnalyticsData, eventName: string = 'All Events'): void {
  const lines: string[] = [];

  // Header & Summary
  lines.push(`"SIC PHOTOBOOTH - KPI & ANALYTICS REPORT"`);
  lines.push(`"Generated At:","${new Date().toLocaleString()}"`);
  lines.push(`"Event Scope:","${eventName}"`);
  lines.push('');

  // 1. Overall Summary
  lines.push('"1. EXECUTIVE KPI SUMMARY"');
  lines.push('"Metric","Value"');
  lines.push(`"Total Sessions","${data.summary.totalSessions}"`);
  lines.push(`"Total Prints / Copies Sold","${data.summary.totalPrints}"`);
  lines.push(`"Average Copies per Session","${data.summary.averageCopiesPerSession}"`);
  lines.push(`"Overall Reprint Rate (%)","${data.summary.overallReprintRate}%"`);
  lines.push(`"Photo Strip Sessions","${data.summary.photoStripSessions}"`);
  lines.push(`"Photo Strip Prints","${data.summary.photoStripPrints}"`);
  lines.push(`"Flipbook Sessions","${data.summary.flipbookSessions}"`);
  lines.push(`"Flipbook Prints","${data.summary.flipbookPrints}"`);
  lines.push('');

  // 2. Type Comparison (Photo Strip vs Flipbook)
  lines.push('"2. PHOTO STRIP VS FLIPBOOK PERFORMANCE"');
  lines.push('"Type","Sessions","Total Prints","Share of Prints (%)","Avg Copies/Session","Reprint Rate (%)"');
  for (const item of data.typeComparison) {
    lines.push(`"${item.label}","${item.sessions}","${item.totalPrints}","${item.sharePercent}%","${item.averageCopies}","${item.reprintRate}%"`);
  }
  lines.push('');

  // 3. Layout / Reprint Driver Breakdown
  lines.push('"3. REPRINT DRIVERS BY LAYOUT CATEGORY"');
  lines.push('"Layout Category","Description","Total Sessions","Total Prints","Avg Copies/Session","Reprint Rate (%)","Share of Prints (%)"');
  for (const l of data.layoutBreakdown) {
    lines.push(`"${l.label}","${l.description}","${l.totalSessions}","${l.totalPrints}","${l.averageCopies}","${l.reprintRate}%","${l.sharePercent}%"`);
  }
  lines.push('');

  // 4. Template Print Leaderboard
  lines.push('"4. TEMPLATE PRINT LEADERBOARD"');
  lines.push('"Template Name","Type","Layout Category","Total Sessions","Total Prints","Avg Copies/Session","Reprint Sessions","Reprint Rate (%)","Share of Prints (%)"');
  for (const t of data.templates) {
    lines.push(`"${t.name}","${t.type === 'flipbook' ? 'Flipbook' : 'Photo Strip'}","${t.layoutLabel}","${t.totalSessions}","${t.totalPrints}","${t.averageCopies}","${t.reprintSessions}","${t.reprintRate}%","${t.shareOfPrintsPercent}%"`);
  }
  lines.push('');

  // 5. Copies Distribution
  lines.push('"5. COPIES PRINTED PER SESSION DISTRIBUTION"');
  lines.push('"Copies Category","Session Count","Percentage (%)"');
  lines.push(`"1 Copy Only","${data.copiesDistribution.oneCopy}","${data.copiesDistribution.oneCopyPercent}%"`);
  lines.push(`"2 Copies (Reprint)","${data.copiesDistribution.twoCopies}","${data.copiesDistribution.twoCopiesPercent}%"`);
  lines.push(`"3 Copies (Reprint)","${data.copiesDistribution.threeCopies}","${data.copiesDistribution.threeCopiesPercent}%"`);
  lines.push(`"4+ Copies (Reprint)","${data.copiesDistribution.fourPlusCopies}","${data.copiesDistribution.fourPlusCopiesPercent}%"`);
  lines.push('');

  // 6. Daily Timeline
  lines.push('"6. DAILY PRINT TIMELINE"');
  lines.push('"Date","Total Sessions","Total Prints","Photo Strip Prints","Flipbook Prints"');
  for (const ts of data.timeseries) {
    lines.push(`"${ts.date}","${ts.totalSessions}","${ts.totalPrints}","${ts.photoStripPrints}","${ts.flipbookPrints}"`);
  }

  const csvContent = lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `sic_booth_kpi_report_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
