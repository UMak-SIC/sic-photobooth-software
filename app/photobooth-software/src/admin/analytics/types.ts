export interface AnalyticsSummary {
  totalSessions: number;
  completedSessions: number;
  printedSessions: number;
  totalPrints: number;
  averageCopiesPerSession: number;
  overallReprintRate: number;
  photoStripSessions: number;
  photoStripPrints: number;
  flipbookSessions: number;
  flipbookPrints: number;
}

export interface TypeComparison {
  type: 'photo_strip' | 'flipbook';
  label: string;
  sessions: number;
  totalPrints: number;
  sharePercent: number;
  averageCopies: number;
  reprintRate: number;
}

export interface TemplateRanking {
  templateId: string;
  name: string;
  type: 'photo_strip' | 'flipbook';
  layoutCategory: string;
  layoutLabel: string;
  totalSessions: number;
  totalPrints: number;
  averageCopies: number;
  reprintSessions: number;
  reprintRate: number;
  shareOfPrintsPercent: number;
}

export interface LayoutCategoryBreakdown {
  category: string;
  label: string;
  description: string;
  totalSessions: number;
  totalPrints: number;
  averageCopies: number;
  reprintSessions: number;
  reprintRate: number;
  sharePercent: number;
}

export interface CopiesDistribution {
  oneCopy: number;
  twoCopies: number;
  threeCopies: number;
  fourPlusCopies: number;
  oneCopyPercent: number;
  twoCopiesPercent: number;
  threeCopiesPercent: number;
  fourPlusCopiesPercent: number;
}

export interface TimeseriesPoint {
  date: string;
  totalSessions: number;
  totalPrints: number;
  photoStripPrints: number;
  flipbookPrints: number;
}

export interface AnalyticsData {
  summary: AnalyticsSummary;
  typeComparison: TypeComparison[];
  templates: TemplateRanking[];
  layoutBreakdown: LayoutCategoryBreakdown[];
  copiesDistribution: CopiesDistribution;
  timeseries: TimeseriesPoint[];
}

export type DateRangePreset = 'today' | 'last_7_days' | 'last_30_days' | 'all_time';

export interface AnalyticsFilterState {
  eventId: string;
  preset: DateRangePreset;
  startDate?: string;
  endDate?: string;
}
