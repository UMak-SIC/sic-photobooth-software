import { useState, useEffect, useMemo, useCallback } from 'react';
import { fetchAnalytics, exportAnalyticsToCsv } from './api';
import type { AnalyticsData, DateRangePreset, TemplateRanking } from './types';

interface EventItem {
  id: string;
  name: string;
  date: string;
  operatorName?: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export function AdminAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('all');
  const [preset, setPreset] = useState<DateRangePreset>('all_time');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Template Table Search & Format Filter
  const [templateSearch, setTemplateSearch] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'photo_strip' | 'flipbook'>('all');

  // Table sorting
  const [sortField, setSortField] = useState<keyof TemplateRanking>('totalPrints');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  // 1. Fetch available events for filtering
  useEffect(() => {
    let isMounted = true;
    fetch(`${API_BASE_URL}/api/events`)
      .then((res) => res.json())
      .then((json) => {
        if (isMounted && json.success && Array.isArray(json.data)) {
          setEvents(json.data);
        }
      })
      .catch(() => {
        // Safe fallback
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Compute start/end dates from preset
  const dateRange = useMemo(() => {
    const now = new Date();
    if (preset === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { startDate: start.toISOString(), endDate: undefined };
    }
    if (preset === 'last_7_days') {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { startDate: start.toISOString(), endDate: undefined };
    }
    if (preset === 'last_30_days') {
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { startDate: start.toISOString(), endDate: undefined };
    }
    return { startDate: undefined, endDate: undefined };
  }, [preset]);

  // 3. Load analytics
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAnalytics({
        eventId: selectedEventId,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      });
      setData(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [selectedEventId, dateRange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtered & Sorted templates
  const processedTemplates = useMemo(() => {
    if (!data?.templates) return [];
    let list = [...data.templates];

    // Filter by type
    if (typeFilter !== 'all') {
      list = list.filter((t) => t.type === typeFilter);
    }

    // Filter by search query
    if (templateSearch.trim()) {
      const q = templateSearch.toLowerCase().trim();
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.layoutLabel.toLowerCase().includes(q) ||
          t.type.toLowerCase().includes(q)
      );
    }

    // Sort
    return list.sort((a, b) => {
      const valA = a[sortField];
      const valB = b[sortField];
      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortAsc ? valA - valB : valB - valA;
      }
      return sortAsc
        ? String(valA).localeCompare(String(valB))
        : String(valB).localeCompare(String(valA));
    });
  }, [data?.templates, typeFilter, templateSearch, sortField, sortAsc]);

  // Maximum print count for relative visual bars in table
  const maxTemplatePrints = useMemo(() => {
    if (!data?.templates || data.templates.length === 0) return 1;
    return Math.max(...data.templates.map((t) => t.totalPrints), 1);
  }, [data?.templates]);

  // Maximum daily prints for timeseries visual scale
  const maxDailyPrints = useMemo(() => {
    if (!data?.timeseries || data.timeseries.length === 0) return 1;
    return Math.max(...data.timeseries.map((t) => t.totalPrints), 1);
  }, [data?.timeseries]);

  const handleSort = (field: keyof TemplateRanking) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const selectedEventName = useMemo(() => {
    if (selectedEventId === 'all') return 'All Events';
    const found = events.find((e) => e.id === selectedEventId);
    return found ? found.name : 'Selected Event';
  }, [selectedEventId, events]);

  const topReprintDriver = useMemo(() => {
    if (!data?.layoutBreakdown || data.layoutBreakdown.length === 0) return null;
    return data.layoutBreakdown[0];
  }, [data?.layoutBreakdown]);

  const photoStripShare = useMemo(() => {
    return data?.typeComparison.find((t) => t.type === 'photo_strip')?.sharePercent ?? 0;
  }, [data?.typeComparison]);

  const flipbookShare = useMemo(() => {
    return data?.typeComparison.find((t) => t.type === 'flipbook')?.sharePercent ?? 0;
  }, [data?.typeComparison]);

  return (
    <div className="admin-page flex flex-col gap-8 text-[#143a32]">
      {/* ========================================================================= */}
      {/* 1. Standard Admin Page Header Matching Other Admin Pages                  */}
      {/* ========================================================================= */}
      <header className="admin-page-header flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-[#cde7dd]">
        <div>
          <p className="admin-eyebrow">KPI &amp; ANALYTICS</p>
          <h1>Performance dashboard</h1>
          <p className="admin-muted">
            Real-time print volumes, template performance, reprint drivers, and customer group sizes.
          </p>
        </div>

        {/* Action Controls & Filters */}
        <div className="editor-header-actions flex flex-wrap items-center gap-3">
          {/* Event Filter Dropdown */}
          <div className="flex items-center gap-2 bg-white border border-[#9bcbbb] rounded-[9px] px-3 py-2 shadow-xs transition">
            <svg className="size-4 text-[#64877d] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.253 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" />
            </svg>
            <label htmlFor="analytics-event-select" className="text-[11px] font-bold text-[#64877d] uppercase tracking-wider">
              Event:
            </label>
            <select
              id="analytics-event-select"
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="text-xs font-bold text-[#143a32] bg-transparent outline-none cursor-pointer pr-1"
            >
              <option value="all">All Events ({events.length})</option>
              {events.map((evt) => (
                <option key={evt.id} value={evt.id}>
                  {evt.name} ({evt.date})
                </option>
              ))}
            </select>
          </div>

          {/* Date Range Presets */}
          <div className="flex items-center bg-[#e8f6f1] p-1 rounded-[9px] border border-[#cde7dd] text-xs font-bold shadow-2xs">
            {(
              [
                ['today', 'Today'],
                ['last_7_days', '7 Days'],
                ['last_30_days', '30 Days'],
                ['all_time', 'All Time'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setPreset(key)}
                className={`px-3 py-1.5 rounded-[7px] transition-all duration-150 cursor-pointer ${
                  preset === key
                    ? 'bg-white text-[#146a56] font-extrabold shadow-xs'
                    : 'text-[#587c72] hover:text-[#143a32] font-semibold'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Export CSV Button */}
          <button
            type="button"
            onClick={() => data && exportAnalyticsToCsv(data, selectedEventName)}
            disabled={!data || loading || data.summary.totalSessions === 0}
            className="admin-button flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            title="Download full analytics report as CSV"
          >
            <svg className="size-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            <span>Export CSV</span>
          </button>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 2. Loading Skeleton & Error States                                       */}
      {/* ========================================================================= */}
      {loading && !data && (
        <div className="flex flex-col gap-6 animate-pulse">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-36 bg-emerald-950/10 rounded-2xl" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-64 bg-emerald-950/10 rounded-2xl" />
            <div className="h-64 bg-emerald-950/10 rounded-2xl" />
          </div>
          <div className="h-72 bg-emerald-950/10 rounded-2xl" />
        </div>
      )}

      {error && (
        <p className="admin-error flex items-center justify-between" role="alert">
          <span>{error}</span>
          <button
            type="button"
            onClick={loadData}
            className="secondary-button !py-1 !px-3"
          >
            Retry
          </button>
        </p>
      )}

      {data && (
        <>
          {/* ========================================================================= */}
          {/* 3. Executive KPI 4-Card Cockpit Grid                                     */}
          {/* ========================================================================= */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Metric 1: Total Physical Prints */}
            <div className="bg-white border border-[#cde7dd] hover:border-[#9bcbbb] rounded-2xl p-5 shadow-xs flex flex-col justify-between transition-all duration-200">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#64877d] uppercase tracking-wider">
                    Total Prints Sold
                  </span>
                  <span className="size-9 rounded-xl bg-[#ddf7ee] text-[#146a56] flex items-center justify-center border border-[#b5ddd1]">
                    <svg className="size-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24-1.04-.37-2.12-.37-3.229 0-4.418 3.582-8 8-8s8 3.582 8 8c0 1.109-.13 2.189-.37 3.229M3.75 19.5h16.5m-16.5-6h16.5M6 19.5v3h12v-3" />
                    </svg>
                  </span>
                </div>
                <div className="text-3xl sm:text-4xl font-extrabold text-[#143a32] mt-3 tracking-tight font-mono">
                  {data.summary.totalPrints.toLocaleString()}
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-[#eaf6f2] text-xs text-[#64877d] flex items-center justify-between font-medium">
                <span className="inline-flex items-center gap-1">
                  <span className="size-2 rounded-full bg-[#146a56]" />
                  {data.summary.photoStripPrints} strip prints
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="size-2 rounded-full bg-purple-600" />
                  {data.summary.flipbookPrints} flipbook prints
                </span>
              </div>
            </div>

            {/* Metric 2: Average Copies per Session / Group Dynamics */}
            <div className="bg-white border border-[#cde7dd] hover:border-[#9bcbbb] rounded-2xl p-5 shadow-xs flex flex-col justify-between transition-all duration-200">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#64877d] uppercase tracking-wider">
                    Avg Copies / Session
                  </span>
                  <span className="size-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center border border-blue-100">
                    <svg className="size-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                    </svg>
                  </span>
                </div>
                <div className="text-3xl sm:text-4xl font-extrabold text-[#143a32] mt-3 tracking-tight flex items-baseline gap-2 font-mono">
                  <span>{data.summary.averageCopiesPerSession}</span>
                  <span className="text-xs font-bold text-[#64877d] uppercase tracking-wider font-sans">copies / group</span>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-[#eaf6f2] flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-[#64877d]">
                  <span>Reprint Conversion:</span>
                  <span className="text-[#146a56] font-bold">{data.summary.overallReprintRate}% of sessions</span>
                </div>
                <div className="w-full bg-[#e8f6f1] h-2 rounded-full overflow-hidden flex" title="1 Copy vs 2+ Copies (Reprints)">
                  <div
                    className="bg-gray-300 h-full transition-all duration-500"
                    style={{ width: `${data.copiesDistribution.oneCopyPercent}%` }}
                  />
                  <div
                    className="bg-[#146a56] h-full transition-all duration-500"
                    style={{ width: `${100 - data.copiesDistribution.oneCopyPercent}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Metric 3: Format Battle (Photo Strips vs Flipbooks) */}
            <div className="bg-white border border-[#cde7dd] hover:border-[#9bcbbb] rounded-2xl p-5 shadow-xs flex flex-col justify-between transition-all duration-200">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#64877d] uppercase tracking-wider">
                    Which Sells Better?
                  </span>
                  <span className="size-9 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center border border-purple-100">
                    <svg className="size-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                    </svg>
                  </span>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl sm:text-3xl font-extrabold text-[#146a56] tracking-tight">
                    {data.summary.photoStripPrints >= data.summary.flipbookPrints ? 'Photo Strips' : 'Flipbooks'}
                  </span>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-[#eaf6f2] flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-[#64877d]">
                  <span className="text-[#146a56] font-bold">Strips ({photoStripShare}%)</span>
                  <span className="text-purple-800 font-bold">Flipbooks ({flipbookShare}%)</span>
                </div>
                <div className="w-full bg-[#e8f6f1] h-2 rounded-full overflow-hidden flex">
                  <div
                    className="bg-[#146a56] h-full transition-all duration-500"
                    style={{ width: `${photoStripShare}%` }}
                  />
                  <div
                    className="bg-purple-600 h-full transition-all duration-500"
                    style={{ width: `${flipbookShare}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Metric 4: Top Reprint Driver */}
            <div className="bg-white border border-[#cde7dd] hover:border-[#9bcbbb] rounded-2xl p-5 shadow-xs flex flex-col justify-between transition-all duration-200">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#64877d] uppercase tracking-wider">
                    Top Reprint Driver
                  </span>
                  <span className="size-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-100">
                    <svg className="size-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                    </svg>
                  </span>
                </div>
                <div className="text-base sm:text-lg font-bold text-[#143a32] mt-3 truncate" title={topReprintDriver?.label}>
                  {topReprintDriver ? topReprintDriver.label : 'N/A'}
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-[#eaf6f2] text-xs text-[#64877d] flex items-center justify-between">
                <span className="text-[#64877d]">Reprint Conversion:</span>
                <span className="text-[#146a56] font-extrabold font-mono">
                  {topReprintDriver ? `${topReprintDriver.reprintRate}%` : '0%'}
                </span>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* 4. Comparative Deep Dives: Format Economics & Layout Reprint Drivers     */}
          {/* ========================================================================= */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Card: Format Economics & Customer Copies Distribution */}
            <div className="bg-white border border-[#cde7dd] rounded-2xl p-6 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-[#eaf6f2]">
                  <div>
                    <h3 className="text-base font-bold text-[#143a32]">
                      Format Sales Comparison
                    </h3>
                    <p className="text-xs text-[#64877d] mt-0.5">
                      Photo Strips vs Flipbooks volume and reprint metrics
                    </p>
                  </div>
                  <span className="text-xs font-mono font-bold text-[#146a56] bg-[#ddf7ee] px-2.5 py-1 rounded-md">
                    {data.summary.totalSessions} Total Sessions
                  </span>
                </div>

                {/* Side-by-Side Format Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
                  {data.typeComparison.map((item) => {
                    const isStrip = item.type === 'photo_strip';
                    return (
                      <div
                        key={item.type}
                        className={`p-4 rounded-xl border flex flex-col justify-between transition ${
                          isStrip
                            ? 'bg-[#f5fffb] border-[#cde7dd]'
                            : 'bg-[#faf5ff] border-purple-200'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between">
                            <span
                              className={`text-xs font-extrabold uppercase tracking-wider ${
                                isStrip ? 'text-[#146a56]' : 'text-purple-800'
                              }`}
                            >
                              {item.label}
                            </span>
                            <span
                              className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full ${
                                isStrip ? 'bg-[#ddf7ee] text-[#146a56]' : 'bg-purple-100 text-purple-900'
                              }`}
                            >
                              {item.sharePercent}% Share
                            </span>
                          </div>
                          <div className="text-2xl font-extrabold text-[#143a32] mt-3 font-mono">
                            {item.totalPrints} <span className="text-xs font-medium text-[#64877d] font-sans">prints</span>
                          </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-black/5 text-xs flex flex-col gap-1.5 text-[#64877d]">
                          <div className="flex justify-between">
                            <span>Sessions:</span>
                            <strong className="text-[#143a32] font-mono">{item.sessions}</strong>
                          </div>
                          <div className="flex justify-between">
                            <span>Avg Copies:</span>
                            <strong className="text-[#143a32] font-mono">{item.averageCopies}</strong>
                          </div>
                          <div className="flex justify-between">
                            <span>Reprint Rate:</span>
                            <strong className="text-[#146a56] font-mono font-bold">{item.reprintRate}%</strong>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Group Size Distribution Histogram */}
              <div className="mt-6 pt-5 border-t border-[#eaf6f2]">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-bold text-[#64877d] uppercase tracking-wider">
                    Customer Group Print Distribution
                  </span>
                  <span className="text-[11px] text-[#64877d] font-medium">
                    Copies purchased per group
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2.5 text-center">
                  <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-200">
                    <span className="text-[10px] text-[#64877d] font-bold uppercase block">1 Copy</span>
                    <strong className="text-base text-[#143a32] font-mono block mt-0.5">{data.copiesDistribution.oneCopy}</strong>
                    <span className="text-[10px] text-[#64877d] font-medium block">{data.copiesDistribution.oneCopyPercent}%</span>
                  </div>
                  <div className="p-2.5 bg-[#ddf7ee]/70 rounded-xl border border-[#b5ddd1]">
                    <span className="text-[10px] text-[#146a56] font-bold uppercase block">2 Copies (Couples)</span>
                    <strong className="text-base text-[#143a32] font-mono block mt-0.5">{data.copiesDistribution.twoCopies}</strong>
                    <span className="text-[10px] text-[#146a56] font-bold block">{data.copiesDistribution.twoCopiesPercent}%</span>
                  </div>
                  <div className="p-2.5 bg-[#ddf7ee]/70 rounded-xl border border-[#b5ddd1]">
                    <span className="text-[10px] text-[#146a56] font-bold uppercase block">3 Copies (Trios)</span>
                    <strong className="text-base text-[#143a32] font-mono block mt-0.5">{data.copiesDistribution.threeCopies}</strong>
                    <span className="text-[10px] text-[#146a56] font-bold block">{data.copiesDistribution.threeCopiesPercent}%</span>
                  </div>
                  <div className="p-2.5 bg-[#ddf7ee]/70 rounded-xl border border-[#b5ddd1]">
                    <span className="text-[10px] text-[#146a56] font-bold uppercase block">4+ Copies (Groups)</span>
                    <strong className="text-base text-[#143a32] font-mono block mt-0.5">{data.copiesDistribution.fourPlusCopies}</strong>
                    <span className="text-[10px] text-[#146a56] font-bold block">{data.copiesDistribution.fourPlusCopiesPercent}%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Card: Layout Reprint Driver Breakdown */}
            <div className="bg-white border border-[#cde7dd] rounded-2xl p-6 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-[#eaf6f2]">
                  <div>
                    <h3 className="text-base font-bold text-[#143a32]">
                      Reprint Driver Architecture
                    </h3>
                    <p className="text-xs text-[#64877d] mt-0.5">
                      Layout structures ranked by probability of driving extra copy sales
                    </p>
                  </div>
                  <span className="text-[11px] font-bold text-[#146a56] bg-[#ddf7ee] px-2.5 py-1 rounded-md">
                    Sorted by Reprint %
                  </span>
                </div>

                <div className="flex flex-col gap-3 mt-4">
                  {data.layoutBreakdown.map((l, idx) => (
                    <div
                      key={l.category}
                      className="p-3.5 rounded-xl border border-[#cde7dd] bg-[#f5fffb] hover:bg-[#ebf8f3] transition flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="size-5 rounded-full bg-white border border-[#9bcbbb] text-[10px] font-bold text-[#146a56] flex items-center justify-center font-mono">
                            {idx + 1}
                          </span>
                          <div>
                            <span className="text-xs font-bold text-[#143a32] block">
                              {l.label}
                            </span>
                            <span className="text-[11px] text-[#64877d] block">
                              {l.description}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-black text-[#146a56] block">
                            {l.reprintRate}% Reprint Rate
                          </span>
                          <span className="text-[11px] text-[#64877d] font-mono">
                            {l.totalPrints} prints ({l.sharePercent}%)
                          </span>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full bg-[#e8f6f1] h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-[#146a56] h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, Math.max(5, l.reprintRate))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Operator Insight Callout */}
              <div className="mt-5 p-3.5 rounded-xl bg-amber-50/80 border border-amber-200/80 flex items-start gap-2.5">
                <svg className="size-5 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.516 0c.85.493 1.508 1.333 1.508 2.316V18" />
                </svg>
                <p className="text-[11px] text-amber-900 leading-relaxed font-medium">
                  <strong>Couple &amp; Split Design Insight:</strong> Layouts with duplicate shots across 2 split strips (e.g. 4 shots across 8 slots) consistently show higher multi-copy sales because each partner retains an identical keepsake strip.
                </p>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* 5. Interactive Template Print Leaderboard                                */}
          {/* ========================================================================= */}
          <div className="bg-white border border-[#cde7dd] rounded-2xl shadow-xs overflow-hidden">
            <div className="p-6 border-b border-[#cde7dd] flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-[#143a32]">
                  Prints Made per Frame Template
                </h3>
                <p className="text-xs text-[#64877d] mt-0.5">
                  Granular performance metrics, copy volume, and reprint conversion for all active templates
                </p>
              </div>

              {/* Template Search & Format Filters */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Search Bar */}
                <div className="flex items-center gap-2 bg-[#f5fffb] border border-[#9bcbbb] focus-within:border-[#146a56] focus-within:bg-white rounded-xl px-3 py-1.5 shadow-2xs transition">
                  <svg className="size-3.5 text-[#64877d]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                  <input
                    type="text"
                    value={templateSearch}
                    onChange={(e) => setTemplateSearch(e.target.value)}
                    placeholder="Search templates..."
                    className="text-xs text-[#143a32] bg-transparent outline-none w-36 sm:w-48 placeholder-[#64877d]"
                  />
                  {templateSearch && (
                    <button
                      type="button"
                      onClick={() => setTemplateSearch('')}
                      className="text-[#64877d] hover:text-[#143a32] cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Type Filter Buttons */}
                <div className="flex items-center bg-[#e8f6f1] p-1 rounded-xl text-xs font-bold border border-[#cde7dd]">
                  <button
                    type="button"
                    onClick={() => setTypeFilter('all')}
                    className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                      typeFilter === 'all' ? 'bg-white text-[#143a32] shadow-2xs font-extrabold' : 'text-[#64877d] hover:text-[#143a32]'
                    }`}
                  >
                    All ({data.templates.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setTypeFilter('photo_strip')}
                    className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                      typeFilter === 'photo_strip' ? 'bg-white text-[#146a56] shadow-2xs font-extrabold' : 'text-[#64877d] hover:text-[#143a32]'
                    }`}
                  >
                    Strips
                  </button>
                  <button
                    type="button"
                    onClick={() => setTypeFilter('flipbook')}
                    className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                      typeFilter === 'flipbook' ? 'bg-white text-purple-800 shadow-2xs font-extrabold' : 'text-[#64877d] hover:text-[#143a32]'
                    }`}
                  >
                    Flipbooks
                  </button>
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#f5fffb] border-b border-[#cde7dd] text-[#64877d] font-bold uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-4 w-12 text-center">Rank</th>
                    <th
                      className="py-3 px-4 cursor-pointer hover:text-[#143a32]"
                      onClick={() => handleSort('name')}
                    >
                      <div className="flex items-center gap-1">
                        <span>Template Name</span>
                        {sortField === 'name' && (
                          <span className="text-[#146a56] font-black">{sortAsc ? '▲' : '▼'}</span>
                        )}
                      </div>
                    </th>
                    <th
                      className="py-3 px-4 cursor-pointer hover:text-[#143a32]"
                      onClick={() => handleSort('type')}
                    >
                      <div className="flex items-center gap-1">
                        <span>Type</span>
                        {sortField === 'type' && (
                          <span className="text-[#146a56] font-black">{sortAsc ? '▲' : '▼'}</span>
                        )}
                      </div>
                    </th>
                    <th className="py-3 px-4">Layout Category</th>
                    <th
                      className="py-3 px-4 text-right cursor-pointer hover:text-[#143a32]"
                      onClick={() => handleSort('totalSessions')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Sessions</span>
                        {sortField === 'totalSessions' && (
                          <span className="text-[#146a56] font-black">{sortAsc ? '▲' : '▼'}</span>
                        )}
                      </div>
                    </th>
                    <th
                      className="py-3 px-4 text-right cursor-pointer hover:text-[#143a32] min-w-[160px]"
                      onClick={() => handleSort('totalPrints')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Total Prints</span>
                        {sortField === 'totalPrints' && (
                          <span className="text-[#146a56] font-black">{sortAsc ? '▲' : '▼'}</span>
                        )}
                      </div>
                    </th>
                    <th
                      className="py-3 px-4 text-right cursor-pointer hover:text-[#143a32]"
                      onClick={() => handleSort('averageCopies')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Avg Copies</span>
                        {sortField === 'averageCopies' && (
                          <span className="text-[#146a56] font-black">{sortAsc ? '▲' : '▼'}</span>
                        )}
                      </div>
                    </th>
                    <th
                      className="py-3 px-4 text-right cursor-pointer hover:text-[#143a32]"
                      onClick={() => handleSort('reprintRate')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Reprint %</span>
                        {sortField === 'reprintRate' && (
                          <span className="text-[#146a56] font-black">{sortAsc ? '▲' : '▼'}</span>
                        )}
                      </div>
                    </th>
                    <th
                      className="py-3 px-4 text-right cursor-pointer hover:text-[#143a32]"
                      onClick={() => handleSort('shareOfPrintsPercent')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Share</span>
                        {sortField === 'shareOfPrintsPercent' && (
                          <span className="text-[#146a56] font-black">{sortAsc ? '▲' : '▼'}</span>
                        )}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eaf6f2]">
                  {processedTemplates.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-[#64877d]">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <svg className="size-8 text-[#9bcbbb]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                          </svg>
                          <span className="font-semibold text-[#64877d]">No matching templates found</span>
                          {templateSearch && (
                            <button
                              type="button"
                              onClick={() => {
                                setTemplateSearch('');
                                setTypeFilter('all');
                              }}
                              className="text-xs font-bold text-[#146a56] hover:underline cursor-pointer"
                            >
                              Reset filters
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    processedTemplates.map((t, index) => {
                      const isFlip = t.type === 'flipbook';
                      const relativeWidth = Math.round((t.totalPrints / maxTemplatePrints) * 100);

                      return (
                        <tr key={t.templateId || index} className="hover:bg-[#f5fffb] transition-colors">
                          <td className="py-3.5 px-4 text-center">
                            <span
                              className={`inline-flex items-center justify-center size-5.5 rounded-md text-[10px] font-mono font-extrabold ${
                                index === 0
                                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                  : index === 1
                                  ? 'bg-slate-200 text-slate-800 border border-slate-300'
                                  : index === 2
                                  ? 'bg-orange-100 text-orange-800 border border-orange-200'
                                  : 'text-[#64877d]'
                              }`}
                            >
                              #{index + 1}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="font-bold text-[#143a32] block text-xs">{t.name}</span>
                            <span className="text-[10px] text-[#64877d] font-mono block mt-0.5">{t.templateId}</span>
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-md text-[10px] font-extrabold ${
                                isFlip
                                  ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                  : 'bg-[#ddf7ee] text-[#21745f] border border-[#b5ddd1]'
                              }`}
                            >
                              {isFlip ? 'Flipbook' : 'Photo Strip'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-[#64877d] font-medium">
                            {t.layoutLabel}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono text-[#143a32]">
                            {t.totalSessions}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex flex-col items-end gap-1">
                              <span className="font-mono font-bold text-[#143a32] text-xs">
                                {t.totalPrints}
                              </span>
                              <div className="w-24 bg-[#e8f6f1] h-1.5 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${isFlip ? 'bg-purple-600' : 'bg-[#146a56]'}`}
                                  style={{ width: `${Math.max(6, relativeWidth)}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-semibold text-[#143a32]">
                            {t.averageCopies}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-bold text-[#146a56]">
                            {t.reprintRate}%
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-semibold text-[#64877d]">
                            {t.shareOfPrintsPercent}%
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Table Footer */}
            <div className="px-6 py-3 bg-[#f5fffb] border-t border-[#cde7dd] flex items-center justify-between text-[11px] text-[#64877d] font-medium">
              <span>Showing {processedTemplates.length} of {data.templates.length} templates</span>
              <span>Sorted by {String(sortField)} ({sortAsc ? 'Ascending' : 'Descending'})</span>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* 6. Daily Print Volume & Timeline Visualization                           */}
          {/* ========================================================================= */}
          {data.timeseries.length > 0 && (
            <div className="bg-white border border-[#cde7dd] rounded-2xl p-6 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-[#eaf6f2]">
                <div>
                  <h3 className="text-base font-bold text-[#143a32]">
                    Daily Print Volume Timeline
                  </h3>
                  <p className="text-xs text-[#64877d] mt-0.5">
                    Print volume progression and format mix over time
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs font-semibold text-[#64877d]">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2.5 rounded-xs bg-[#146a56]" />
                    Photo Strips
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2.5 rounded-xs bg-purple-600" />
                    Flipbooks
                  </span>
                </div>
              </div>

              {/* Visual Daily Volume Cards / Bar Graph */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3 mt-5">
                {data.timeseries.map((pt) => {
                  const stripHeight = Math.round((pt.photoStripPrints / maxDailyPrints) * 100);
                  const flipHeight = Math.round((pt.flipbookPrints / maxDailyPrints) * 100);

                  return (
                    <div
                      key={pt.date}
                      className="p-3.5 bg-[#f5fffb] hover:bg-[#ebf8f3] border border-[#cde7dd] rounded-xl flex flex-col justify-between transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-[#64877d] uppercase tracking-wider">
                          {pt.date}
                        </span>
                        <span className="text-[10px] font-mono text-[#64877d]">
                          {pt.totalSessions} sess
                        </span>
                      </div>

                      {/* Mini visual volume bar */}
                      <div className="my-3 h-12 flex items-end gap-1.5 bg-white p-1 rounded-md border border-[#cde7dd]">
                        <div
                          className="w-1/2 bg-[#146a56] rounded-xs transition-all duration-500"
                          style={{ height: `${Math.max(10, stripHeight)}%` }}
                          title={`Strips: ${pt.photoStripPrints}`}
                        />
                        <div
                          className="w-1/2 bg-purple-600 rounded-xs transition-all duration-500"
                          style={{ height: `${Math.max(10, flipHeight)}%` }}
                          title={`Flipbooks: ${pt.flipbookPrints}`}
                        />
                      </div>

                      <div className="pt-2 border-t border-[#cde7dd] flex items-baseline justify-between">
                        <strong className="text-lg font-extrabold text-[#143a32] font-mono">
                          {pt.totalPrints}
                        </strong>
                        <span className="text-[10px] text-[#64877d]">
                          {pt.photoStripPrints}s / {pt.flipbookPrints}f
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
