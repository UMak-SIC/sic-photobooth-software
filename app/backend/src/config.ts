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
  databaseUrl: string;
  storageDir: string;
  nodeEnv: string;
  /** Empty when unset: the publishing worker then skips the online gate and attempts uploads. */
  publicAppUrl: string;
  corsOrigins: string[];
  cloudinary: CloudinaryConfig;
  supabase: SupabaseConfig;
  publishing: PublishingConfig;
}

const defaultStorageDir = path.resolve(__dirname, '../../storage');

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  databaseUrl:
    process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/photobooth',
  storageDir: process.env.STORAGE_DIR || defaultStorageDir,
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
  videoDurationMinSeconds: 4.0,
  videoDurationMaxSeconds: 6.5,
  gifFrameCount: 19, // 19 video motion frames (Frame 01 is cover photo, Frames 02-20 are video frames)
  gifCoverHoldMs: 3000, // 3 seconds static cover photo hold in GIF
  gifFrameDelayMs: 250, // 250ms per frame (4 fps real-time playback matching 5s recording)
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
  fitToPage: boolean;
  enableHardwarePrint: boolean;
}

export const printerConfig: PrinterConfig = {
  printerName: process.env.PRINTER_NAME || 'Epson_L3250',
  mediaSize: process.env.PRINTER_MEDIA_SIZE || 'Custom.4x6in',
  fitToPage: true,
  enableHardwarePrint: process.env.ENABLE_HARDWARE_PRINT !== 'false' && process.env.NODE_ENV !== 'test',
};

