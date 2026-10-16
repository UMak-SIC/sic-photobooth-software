/**
 * Persistence contracts. HTTP routes and workers depend only on these shapes;
 * the SQLite repositories implement them behind the provider in `provider.ts`.
 */
import type { SessionType } from '@photobooth/public-output';
import type { SessionData, SessionState } from '../services/session-state-machine.js';
import type { Template, TemplateDraft } from '../templates/types.js';

export type DatabaseEngine = 'sqlite';

export interface EventData {
  id: string;
  name: string;
  description?: string | null;
  date: string;
  operatorName: string;
  createdAt: Date;
}

export interface TemplatePlacement {
  captureIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  borderRadius?: number;
  zIndex?: number;
}

export interface TemplateOverlay {
  id?: string;
  label: string;
  assetPath?: string;
  path?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  zIndex?: number;
}

export interface FrameItem {
  id: string;
  name: string;
  overlayPath: string;
  isActive: boolean;
  placements?: TemplatePlacement[];
}

export interface TemplateItem {
  id: string;
  name: string;
  orientation: 'landscape' | 'portrait';
  outputWidth: number;
  outputHeight: number;
  backgroundPath: string;
  isActive: boolean;
  requiredCaptureCount: number;
  countdownSeconds: 3 | 5 | 10;
  placements: TemplatePlacement[];
  overlays?: TemplateOverlay[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CaptureItem {
  id: string;
  sessionId: string;
  captureIndex: number;
  filePath: string;
  isCover: boolean;
  isSelected: boolean;
  createdAt: Date;
}

export interface FlipbookCaptures {
  covers: Array<{ id: string; captureIndex: number; filePath: string; isSelected: boolean }>;
  videos: Array<{
    id: string;
    videoIndex: number;
    filePath: string;
    durationSeconds: number;
    isSelected: boolean;
  }>;
}

export interface OutputItem {
  id: string;
  sessionId: string;
  publicId: string;
  mediaType: string;
  filePath: string;
  width: number;
  height: number;
  createdAt: Date;
  eventName: string;
  eventDate: string;
}

export type PublicationStatus = 'queued' | 'in_progress' | 'uploaded' | 'failed';

export interface QueuedPublication {
  id: string;
  publicId: string;
  filePath: string;
  mediaType: string;
  eventName: string;
  eventDate: string;
  copiesPrinted: number;
  retryCount: number;
}

export interface PublicationRecord {
  id: string;
  publicId: string;
  status: PublicationStatus;
  retryCount: number;
  lastAttemptAt: Date | null;
  nextAttemptAt: Date | null;
  lastError: string | null;
  cloudFinalizedAt: Date | null;
  cloudinaryUrl: string | null;
  cloudinaryPublicId: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  mediaType: string;
  eventName: string;
  eventDate: string;
}

export interface LocalPublicationOutput {
  publicId: string;
  filePath: string;
  mediaType: string;
  sessionId?: string;
}

export type PrintJobStatus =
  | 'queued'
  | 'submitting'
  | 'pending'
  | 'processing'
  | 'stopped'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'needs_attention';

export interface PrintJob {
  id: string;
  sessionId: string;
  outputId: string | null;
  publicId: string;
  outputType: 'photo_strip' | 'flipbook';
  artifactType: 'image/png' | 'application/pdf';
  copiesRequested: number;
  copiesCompleted: number;
  copiesWaiting: number;
  printerName: string;
  mediaSize: string;
  mode: 'cups' | 'simulation';
  status: PrintJobStatus;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PrintJobAttempt {
  id: string;
  printJobId: string;
  attemptNumber: number;
  title: string;
  cupsJobId: string | null;
  state: PrintJobStatus;
  error: string | null;
  isCurrent: boolean;
  supersededAt: Date | null;
}

export type ActivePrintAttempt = PrintJob & { cupsJobId: string | null; attemptId: string };

export interface SupersededPrintAttempt {
  jobId: string;
  attemptId: string;
  cupsJobId: string;
}

export interface CreatePrintJobInput {
  output: OutputItem;
  requestKey: string;
  artifactPath: string;
  artifactType: 'image/png' | 'application/pdf';
  printerName: string;
  mediaSize: string;
  copies: number;
  mode: 'cups' | 'simulation';
  reprintOfId?: string;
  rejectAfterInitialCompletion?: boolean;
}

export interface AnalyticsFilters {
  eventId?: string;
  startDate?: string;
  endDate?: string;
}

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

/** Workflow, publication, and print persistence. Every failure rejects; nothing is buffered in memory. */
export interface CoreRepository {
  listEvents(): Promise<EventData[]>;
  getEventById(id: string): Promise<EventData | null>;
  createEvent(
    name: string,
    date: string,
    operatorName: string,
    description?: string,
  ): Promise<EventData>;
  deleteEvent(id: string): Promise<boolean>;
  getOrCreateEvent(name: string, date: string, operatorName: string): Promise<EventData>;

  createSession(eventId: string, type: SessionType, token: string): Promise<SessionData>;
  getSessionById(sessionId: string): Promise<SessionData | null>;
  updateSessionState(sessionId: string, state: SessionState): Promise<SessionData | null>;
  cancelSession(sessionId: string): Promise<SessionData | null>;

  listActiveFrames(): Promise<FrameItem[]>;
  getFrameById(frameId: string): Promise<FrameItem | null>;
  createFrame(name: string, overlayPath: string): Promise<FrameItem>;
  setSessionFrame(
    sessionId: string,
    frameId: string,
    resolvedTemplate?: any,
  ): Promise<SessionData | null>;

  saveCoverCapture(sessionId: string, captureIndex: number, filePath: string): Promise<void>;
  savePhotoCapture(
    sessionId: string,
    captureIndex: number,
    filePath: string,
    isRetake?: boolean,
  ): Promise<{ captureCount: number; retakeCount: number }>;
  saveVideoCapture(
    sessionId: string,
    videoIndex: number,
    filePath: string,
    durationSeconds?: number,
  ): Promise<void>;
  getFlipbookCaptures(sessionId: string): Promise<FlipbookCaptures>;
  recordFlipbookSelection(sessionId: string, coverIndex: number, videoIndex: number): Promise<void>;
  resetFlipbookToCoverCapture(sessionId: string): Promise<void>;
  getPhotoCaptures(sessionId: string): Promise<CaptureItem[]>;

  saveGeneratedOutput(
    sessionId: string,
    publicId: string,
    mediaType: 'image/png' | 'image/gif',
    filePath: string,
    width: number,
    height: number,
  ): Promise<string>;
  getApprovedOutputByPublicId(publicId: string): Promise<OutputItem | null>;
  getLatestOutputForSession(sessionId: string): Promise<OutputItem | null>;
  getOutputByPublicId(publicId: string): Promise<OutputItem | null>;

  listPublications(): Promise<PublicationRecord[]>;
  getPublicationOutput(id: string): Promise<LocalPublicationOutput | null>;
  retryPublication(id: string): Promise<PublicationRecord | null>;
  deleteLocalPublication(id: string): Promise<LocalPublicationOutput | null>;
  removeCloudPublication(id: string): Promise<PublicationRecord | null>;
  claimQueuedPublications(limit: number, now?: Date): Promise<QueuedPublication[]>;
  markPublicationUploaded(
    id: string,
    cloudinaryUrl: string,
    cloudinaryPublicId: string,
    cloudFinalizedAt: Date,
    expiresAt: Date,
  ): Promise<boolean>;
  markPublicationFailed(id: string, error: string, nextAttemptAt: Date | null): Promise<void>;
  recoverStalledPublications(staleBefore: Date, maxAttempts: number): Promise<void>;

  createPrintJob(input: CreatePrintJobInput): Promise<PrintJob | null>;
  getPrintJob(id: string): Promise<PrintJob | null>;
  getPrintJobArtifact(id: string): Promise<string | null>;
  listPrintJobs(limit: number, before?: Date): Promise<PrintJob[]>;
  claimQueuedPrintJobs(limit: number): Promise<PrintJob[]>;
  listActivePrintAttempts(): Promise<ActivePrintAttempt[]>;
  listSupersededPrintAttempts(): Promise<SupersededPrintAttempt[]>;
  createPrintAttempt(jobId: string): Promise<PrintJobAttempt>;
  updatePrintAttempt(
    attemptId: string,
    state: PrintJobStatus,
    cupsJobId?: string,
    error?: string,
  ): Promise<void>;
  updatePrintJobStatus(
    id: string,
    status: PrintJobStatus,
    error?: string,
    expectedStatus?: PrintJobStatus,
  ): Promise<PrintJob | null>;
  getCurrentCupsJobId(id: string): Promise<string | null>;
  cancelPrintJob(id: string): Promise<PrintJob | null>;
  retryPrintJob(id: string): Promise<PrintJob | null>;
  reprintPrintJob(id: string, requestKey: string): Promise<PrintJob | null>;
  completePrintJob(id: string, attemptId: string): Promise<PrintJob | null>;
  recordPrintStatus(sessionId: string, copiesPrinted: number): Promise<SessionData | null>;

  listActiveTemplates(): Promise<TemplateItem[]>;
  getTemplateById(templateId: string): Promise<TemplateItem | null>;
  createTemplate(
    name: string,
    orientation: 'landscape' | 'portrait',
    outputWidth: number,
    outputHeight: number,
    backgroundPath: string,
    requiredCaptureCount: number,
    countdownSeconds: 3 | 5 | 10,
    placements?: TemplatePlacement[],
    overlays?: TemplateOverlay[],
  ): Promise<TemplateItem>;
  updateTemplateLayout(
    templateId: string,
    placements: TemplatePlacement[],
    overlays?: TemplateOverlay[],
  ): Promise<boolean>;
  selectTemplate(sessionId: string, template: TemplateItem): Promise<SessionData | null>;

  getAnalyticsData(filters?: AnalyticsFilters): Promise<AnalyticsData>;
}

/** Canonical admin template library persistence. */
export interface TemplateStore {
  list(type?: Template['type']): Promise<Template[]>;
  get(id: string): Promise<Template | null>;
  create(draft: TemplateDraft): Promise<Template>;
  update(id: string, draft: TemplateDraft): Promise<Template | null>;
  setActive(id: string, active: boolean): Promise<Template | null>;
  setBackgroundPath(id: string, path: string): Promise<Template | null>;
  setCoverPath(id: string, path: string): Promise<Template | null>;
  reorder(orderedIds: string[]): Promise<Template[]>;
  addOverlayPath(id: string, overlayId: string, path: string): Promise<Template | null>;
  delete(id: string): Promise<Template | null>;
}

export interface DatabaseHealth {
  ok: boolean;
  error?: string;
}

export interface MigrationSummary {
  applied: string[];
  total: number;
}

/** The single selected persistence engine for this process. */
export interface DatabaseProvider {
  readonly engine: DatabaseEngine;
  readonly repository: CoreRepository;
  readonly templates: TemplateStore;
  checkHealth(): Promise<DatabaseHealth>;
  migrate(): Promise<MigrationSummary>;
  /** Releases the engine; SQLite also checkpoints its WAL. Idempotent. */
  close(): Promise<void>;
}

/** True for a unique-constraint violation from either engine. */
export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  const code = (error as { code?: unknown }).code;
  return (
    code === '23505' || code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY'
  );
}
