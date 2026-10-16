/**
 * Repository logic that does not touch SQL: built-in read-only defaults,
 * template snapshots, and analytics aggregation. Nothing here stores state.
 */
import { classifyTemplateLayout } from '../services/layout-classifier.js';
import type {
  AnalyticsData,
  FrameItem,
  LayoutCategoryBreakdown,
  TemplateItem,
  TemplatePlacement,
  TemplateRanking,
  TypeComparison,
} from './contracts.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: string): boolean => UUID_PATTERN.test(value);

/** Default 4-strip placements for canonical flipbook templates/frames. */
export const DEFAULT_FLIPBOOK_PLACEMENTS: readonly TemplatePlacement[] = Object.freeze(
  [150, 540, 930, 1320].map((y, index) => ({
    captureIndex: index + 1,
    x: 290,
    y,
    width: 620,
    height: 348.75,
    rotation: 0,
    borderRadius: 0,
    zIndex: index + 1,
  })),
);

const flipbookPlacements = (): TemplatePlacement[] =>
  DEFAULT_FLIPBOOK_PLACEMENTS.map((placement) => ({ ...placement }));

/** Built-in frames offered when the database has none. They are never written back. */
const BUILT_IN_FRAMES: readonly Omit<FrameItem, 'placements'>[] = [
  { id: '1', name: 'SIC Seal', overlayPath: 'frames/sic-seal.png', isActive: true },
  { id: '2', name: 'Emerald Motion', overlayPath: 'frames/emerald-motion.png', isActive: true },
  { id: '3', name: 'Pioneer Grid', overlayPath: 'frames/pioneer-grid.png', isActive: true },
];

const gridPlacement = (captureIndex: number, x: number, y: number): TemplatePlacement => ({
  captureIndex,
  x,
  y,
  width: 720,
  height: 450,
  rotation: 0,
  borderRadius: 8,
  zIndex: 1,
});

/** Built-in photo-strip template offered when the database has none. */
const builtInTemplates = (): TemplateItem[] => [
  {
    id: 'grid-landscape',
    name: 'Grid 2x2 Landscape',
    orientation: 'landscape',
    outputWidth: 1800,
    outputHeight: 1200,
    backgroundPath: 'templates/grid-landscape.png',
    isActive: true,
    requiredCaptureCount: 4,
    countdownSeconds: 5,
    placements: [
      gridPlacement(1, 120, 120),
      gridPlacement(2, 960, 120),
      gridPlacement(3, 120, 630),
      gridPlacement(4, 960, 630),
    ],
    overlays: [],
  },
];

export function builtInFrames(): FrameItem[] {
  return BUILT_IN_FRAMES.map((frame) => ({ ...frame, placements: flipbookPlacements() }));
}

export function withDefaultFramePlacements(frame: FrameItem): FrameItem {
  return {
    ...frame,
    placements:
      frame.placements && frame.placements.length > 0 ? frame.placements : flipbookPlacements(),
  };
}

/** Resolves a built-in frame by id, 1-based position, or loose name match. */
export function findBuiltInFrame(frameId: string): FrameItem | null {
  const frames = builtInFrames();
  const byId = frames.find((frame) => frame.id === frameId);
  if (byId) return byId;
  const index = parseInt(frameId, 10) - 1;
  if (index >= 0 && index < frames.length) return frames[index];
  const needle = frameId.toLowerCase();
  return (
    frames.find(
      (frame) =>
        frame.name.toLowerCase().includes(needle) || needle.includes(frame.name.toLowerCase()),
    ) ?? null
  );
}

export function activeBuiltInTemplates(): TemplateItem[] {
  return builtInTemplates().filter((template) => template.isActive);
}

export function findBuiltInTemplate(templateId: string): TemplateItem | null {
  const needle = templateId.toLowerCase();
  return (
    builtInTemplates().find(
      (template) => template.id === templateId || template.name.toLowerCase().includes(needle),
    ) ?? null
  );
}

/** Immutable flipbook snapshot stored on the session when a frame is chosen. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy template/frame union
export function buildFlipbookSnapshot(frameId: string, resolvedTemplate?: any) {
  if (!resolvedTemplate) {
    return { id: frameId, type: 'flipbook', placements: flipbookPlacements(), overlays: [] };
  }
  return {
    id: resolvedTemplate.id || frameId,
    name: resolvedTemplate.name,
    type: 'flipbook',
    coverPath: resolvedTemplate.coverPath || null,
    backgroundPath: resolvedTemplate.backgroundPath || null,
    placements:
      resolvedTemplate.placements && resolvedTemplate.placements.length > 0
        ? resolvedTemplate.placements
        : flipbookPlacements(),
    overlays: resolvedTemplate.overlays || [],
  };
}

/** Immutable photo-strip snapshot stored on the session when a template is chosen. */
export function buildTemplateSnapshot(template: TemplateItem, snapshottedAt: Date = new Date()) {
  return {
    id: template.id,
    name: template.name,
    orientation: template.orientation,
    outputWidth: template.outputWidth,
    outputHeight: template.outputHeight,
    backgroundPath: template.backgroundPath,
    requiredCaptureCount: template.requiredCaptureCount,
    countdownSeconds: template.countdownSeconds,
    placements: template.placements,
    overlays: template.overlays || [],
    snapshottedAt: snapshottedAt.toISOString(),
  };
}

export interface AnalyticsSessionRow {
  id: string;
  eventId: string;
  type: 'photo_strip' | 'flipbook';
  state: string;
  templateId?: string | null;
  frameId?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- snapshot JSON is untyped
  templateSnapshot?: any;
  isPrinted: boolean;
  copiesPrinted: number;
  createdAt: Date | string;
  templateName?: string | null;
  templateType?: string | null;
}

const ratio = (part: number, whole: number, digits: number, scale = 1): number =>
  whole > 0 ? Number(((part / whole) * scale).toFixed(digits)) : 0;

/** Aggregates confirmed/printed session rows into the analytics dashboard payload. */
export function buildAnalyticsData(rows: AnalyticsSessionRow[]): AnalyticsData {
  let totalSessions = 0;
  let printedSessions = 0;
  let totalPrints = 0;
  let photoStripSessions = 0;
  let photoStripPrints = 0;
  let flipbookSessions = 0;
  let flipbookPrints = 0;
  let totalReprintSessions = 0;
  let oneCopyCount = 0;
  let twoCopiesCount = 0;
  let threeCopiesCount = 0;
  let fourPlusCopiesCount = 0;

  type Tally = { totalSessions: number; totalPrints: number; reprintSessions: number };
  const templateMap = new Map<
    string,
    Omit<TemplateRanking, 'averageCopies' | 'reprintRate' | 'shareOfPrintsPercent'>
  >();
  const layoutMap = new Map<
    string,
    { category: string; label: string; description: string } & Tally
  >();
  const timeseriesMap = new Map<
    string,
    {
      date: string;
      totalSessions: number;
      totalPrints: number;
      photoStripPrints: number;
      flipbookPrints: number;
    }
  >();

  for (const row of rows) {
    totalSessions++;
    const copies = row.copiesPrinted || 0;
    totalPrints += copies;
    if (row.isPrinted || copies > 0) printedSessions++;
    const isReprint = copies > 1;
    if (isReprint) totalReprintSessions++;

    if (copies === 1) oneCopyCount++;
    else if (copies === 2) twoCopiesCount++;
    else if (copies === 3) threeCopiesCount++;
    else if (copies >= 4) fourPlusCopiesCount++;

    if (row.type === 'photo_strip') {
      photoStripSessions++;
      photoStripPrints += copies;
    } else {
      flipbookSessions++;
      flipbookPrints += copies;
    }

    const snap = row.templateSnapshot || {};
    const templateName =
      row.templateName ||
      snap.name ||
      (row.type === 'flipbook' ? 'Flipbook Frame' : 'Photo Strip Template');
    const templateId = row.templateId || row.frameId || snap.id || templateName;
    const layoutInfo = classifyTemplateLayout(
      row.type,
      snap.placements || [],
      snap.outputWidth || 1200,
      snap.outputHeight || 1800,
    );

    let templateStat = templateMap.get(templateId);
    if (!templateStat) {
      templateStat = {
        templateId,
        name: templateName,
        type: row.type,
        layoutCategory: layoutInfo.category,
        layoutLabel: layoutInfo.label,
        totalSessions: 0,
        totalPrints: 0,
        reprintSessions: 0,
      };
      templateMap.set(templateId, templateStat);
    }
    templateStat.totalSessions++;
    templateStat.totalPrints += copies;
    if (isReprint) templateStat.reprintSessions++;

    let layoutStat = layoutMap.get(layoutInfo.category);
    if (!layoutStat) {
      layoutStat = {
        category: layoutInfo.category,
        label: layoutInfo.label,
        description: layoutInfo.description,
        totalSessions: 0,
        totalPrints: 0,
        reprintSessions: 0,
      };
      layoutMap.set(layoutInfo.category, layoutStat);
    }
    layoutStat.totalSessions++;
    layoutStat.totalPrints += copies;
    if (isReprint) layoutStat.reprintSessions++;

    const created = new Date(row.createdAt);
    const dateKey = !isNaN(created.getTime()) ? created.toISOString().split('T')[0] : 'Unknown';
    let point = timeseriesMap.get(dateKey);
    if (!point) {
      point = { date: dateKey, totalSessions: 0, totalPrints: 0, photoStripPrints: 0, flipbookPrints: 0 };
      timeseriesMap.set(dateKey, point);
    }
    point.totalSessions++;
    point.totalPrints += copies;
    if (row.type === 'photo_strip') point.photoStripPrints += copies;
    else point.flipbookPrints += copies;
  }

  const templates: TemplateRanking[] = Array.from(templateMap.values())
    .map((t) => ({
      ...t,
      averageCopies: ratio(t.totalPrints, t.totalSessions, 2),
      reprintRate: ratio(t.reprintSessions, t.totalSessions, 1, 100),
      shareOfPrintsPercent: ratio(t.totalPrints, totalPrints, 1, 100),
    }))
    .sort((a, b) => b.totalPrints - a.totalPrints);

  const layoutBreakdown: LayoutCategoryBreakdown[] = Array.from(layoutMap.values())
    .map((l) => ({
      ...l,
      averageCopies: ratio(l.totalPrints, l.totalSessions, 2),
      reprintRate: ratio(l.reprintSessions, l.totalSessions, 1, 100),
      sharePercent: ratio(l.totalPrints, totalPrints, 1, 100),
    }))
    .sort((a, b) => b.reprintRate - a.reprintRate || b.totalPrints - a.totalPrints);

  const typeStats = (
    type: 'photo_strip' | 'flipbook',
    label: string,
    sessions: number,
    prints: number,
  ): TypeComparison => ({
    type,
    label,
    sessions,
    totalPrints: prints,
    sharePercent: ratio(prints, totalPrints, 1, 100),
    averageCopies: ratio(prints, sessions, 2),
    reprintRate: ratio(
      rows.filter((r) => r.type === type && r.copiesPrinted > 1).length,
      sessions,
      1,
      100,
    ),
  });

  return {
    summary: {
      totalSessions,
      completedSessions: totalSessions,
      printedSessions,
      totalPrints,
      averageCopiesPerSession: ratio(totalPrints, totalSessions, 2),
      overallReprintRate: ratio(totalReprintSessions, totalSessions, 1, 100),
      photoStripSessions,
      photoStripPrints,
      flipbookSessions,
      flipbookPrints,
    },
    typeComparison: [
      typeStats('photo_strip', 'Photo Strips', photoStripSessions, photoStripPrints),
      typeStats('flipbook', 'Flipbooks', flipbookSessions, flipbookPrints),
    ],
    templates,
    layoutBreakdown,
    copiesDistribution: {
      oneCopy: oneCopyCount,
      twoCopies: twoCopiesCount,
      threeCopies: threeCopiesCount,
      fourPlusCopies: fourPlusCopiesCount,
      oneCopyPercent: ratio(oneCopyCount, totalSessions, 1, 100),
      twoCopiesPercent: ratio(twoCopiesCount, totalSessions, 1, 100),
      threeCopiesPercent: ratio(threeCopiesCount, totalSessions, 1, 100),
      fourPlusCopiesPercent: ratio(fourPlusCopiesCount, totalSessions, 1, 100),
    },
    timeseries: Array.from(timeseriesMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
  };
}
