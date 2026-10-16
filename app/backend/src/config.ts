import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

export interface SupabaseConfig {
  url: string;
  serviceRoleKey: string;
}

export interface PublishingConfig {
  pollIntervalMs: number;
  concurrency: number;
  retentionMonths: number;
}

export interface AppConfig {
  port: number;
  host: string;
  sqliteDatabasePath: string;
  storageDir: string;
  nodeEnv: string;
  /** Empty when unset: the publishing worker then skips the online gate and attempts uploads. */
  publicAppUrl: string;
  corsOrigins: string[];
  cloudinary: CloudinaryConfig;
  supabase: SupabaseConfig;
  publishing: PublishingConfig;
  /** Phase 5 validation hold: rejects mutation routes and keeps workers stopped. */
  databaseCutoverHold: boolean;
}

const defaultStorageDir = path.resolve(__dirname, '../../storage');

function cutoverHoldFlag(value: string | undefined): boolean {
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized === '' || normalized === '0' || normalized === 'false') return false;
  if (normalized === '1' || normalized === 'true') return true;
  // Fail closed on typos so an operator never believes the hold is active when it is not.
  throw new Error('DATABASE_CUTOVER_HOLD must be one of "1", "true", "0", or "false".');
}

function isTestRun(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.VITEST) || env.NODE_ENV === 'test';
}

/**
 * Resolves the SQLite database file. Under Vitest or NODE_ENV=test the path must be
 * set explicitly and must not be the default production file, so a test can never
 * open the booth's database.
 */
export function resolveSqliteDatabasePath(env: NodeJS.ProcessEnv = process.env): string {
  const productionDefault = path.join(defaultStorageDir, 'database', 'photobooth.sqlite');
  const resolved = path.resolve(env.SQLITE_DATABASE_PATH || productionDefault);
  if (isTestRun(env) && (!env.SQLITE_DATABASE_PATH || resolved === productionDefault)) {
    throw new Error(
      'Refusing to open the booth SQLite database under test. Set SQLITE_DATABASE_PATH to a temporary file.',
    );
  }
  return resolved;
}

/** Resolves STORAGE_DIR; under test it must be set and must not be the booth's storage. */
export function resolveStorageDir(env: NodeJS.ProcessEnv = process.env): string {
  const resolved = env.STORAGE_DIR || defaultStorageDir;
  if (isTestRun(env) && (!env.STORAGE_DIR || path.resolve(resolved) === defaultStorageDir)) {
    throw new Error(
      'Refusing to use the booth storage directory under test. Set STORAGE_DIR to a temporary directory.',
    );
  }
  return resolved;
}

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  sqliteDatabasePath: resolveSqliteDatabasePath(),
  storageDir: resolveStorageDir(),
  nodeEnv: process.env.NODE_ENV || 'development',
  publicAppUrl: process.env.PUBLIC_APP_URL || '',
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
  },
  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },
  publishing: {
    pollIntervalMs: 5000,
    concurrency: 2,
    retentionMonths: 2,
  },
  corsOrigins: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim())
    : [
        'http://localhost:5173', // photobooth-software (dev)
        'http://localhost:5174', // captive-website (dev)
        'http://192.168.4.1', // captive portal gateway (prod)
        'http://127.0.0.1:5173',
        'http://127.0.0.1:5174',
      ],
  databaseCutoverHold: cutoverHoldFlag(process.env.DATABASE_CUTOVER_HOLD),
};

export interface FlipbookConfig {
  /** Video recording duration target in seconds */
  videoRecordingDurationSeconds: number;
  /** Minimum accepted video clip duration for validation */
  videoDurationMinSeconds: number;
  /** Maximum accepted video clip duration for validation */
  videoDurationMaxSeconds: number;
  /** Number of motion frames extracted from the video for the GIF / booklet */
  gifFrameCount: number;
  /** Static hold duration for the front cover photo in milliseconds */
  gifCoverHoldMs: number;
  /** Display duration for each animated motion frame in milliseconds */
  gifFrameDelayMs: number;
  /** Output GIF render width in pixels (4.0 inches @ 8:3 aspect ratio) */
  gifOutputWidth: number;
  /** Output GIF render height in pixels (1.5 inches @ 8:3 aspect ratio) */
  gifOutputHeight: number;
  /** Photo slot width in pixels (2.41 inches) */
  slotWidthPx: number;
  /** Photo slot height in pixels (1.32 inches) */
  slotHeightPx: number;
  /** Photo slot X offset in pixels (Right-aligned, leaving left binding margin) */
  slotXPx: number;
  /** Photo slot Y offset in pixels (Centered vertically) */
  slotYPx: number;
  /** Background canvas color for motion frames */
  motionCanvasBgColor: string;
  /** Rendering watchdog timeout in milliseconds (2 minutes) */
  gifTimeoutMs: number;
  /** Render both PRD default and custom instances for side-by-side comparison testing */
  enableComparisonVariants: boolean;
}

export const flipbookConfig: FlipbookConfig = {
  // =========================================================================
  // ACTIVE SETTINGS: 2.41" x 1.32" (482x264) Motion GIF Output
  // =========================================================================
  videoRecordingDurationSeconds: 5.0,
  videoDurationMinSeconds: 3.5,
  videoDurationMaxSeconds: 6.5,
  gifFrameCount: 15, // 15 video motion frames (Frame 01 is cover photo, Frames 02-16 are video frames)
  gifCoverHoldMs: 3000, // 3 seconds static cover photo hold in GIF
  gifFrameDelayMs: 333, // 333ms per frame (~3 fps real-time playback matching 5s recording)
  gifOutputWidth: 482, // 2.41" photo slot width (482px)
  gifOutputHeight: 264, // 1.32" photo slot height (264px)
  slotWidthPx: 482, // 2.41" photo slot width (482px)
  slotHeightPx: 264, // 1.32" photo slot height (264px)
  slotXPx: 298, // Right-aligned (800 - 482 - 20 = 298px on 4"x1.5" print sheet)
  slotYPx: 18, // Centered vertically ((300 - 264) / 2 = 18px on print sheet)
  motionCanvasBgColor: '#c2ffe1', // Mint canvas background
  gifTimeoutMs: 120000, // 2-minute safety watchdog
  enableComparisonVariants: false,
};

export interface PrinterConfig {
  printerName: string;
  mediaSize: string;
  /** Printer-driver media type passed to CUPS, such as PMPHOTO_HIGH. */
  printQuality: string;
  fitToPage: boolean;
  enableHardwarePrint: boolean;
  cupsServer: string;
  pollIntervalMs: number;
}

export const printerConfig: PrinterConfig = {
  printerName: process.env.PRINTER_NAME || 'Epson_L3250',
  mediaSize: process.env.PRINTER_MEDIA_SIZE || 'Custom.4x6in',
  printQuality: process.env.PRINT_QUALITY || 'PMPHOTO_HIGH',
  fitToPage: true,
  enableHardwarePrint:
    process.env.ENABLE_HARDWARE_PRINT !== 'false' && process.env.NODE_ENV !== 'test',
  cupsServer: process.env.CUPS_SERVER || 'localhost:631',
  pollIntervalMs: Number.parseInt(process.env.PRINT_POLL_INTERVAL_MS || '5000', 10),
};
