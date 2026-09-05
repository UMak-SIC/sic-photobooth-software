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
  /** Output GIF render width in pixels */
  gifOutputWidth: number;
  /** Output GIF render height in pixels */
  gifOutputHeight: number;
  /** Rendering watchdog timeout in milliseconds (2 minutes) */
  gifTimeoutMs: number;
  /** Render both PRD default and custom instances for side-by-side comparison testing */
  enableComparisonVariants: boolean;
}

export const flipbookConfig: FlipbookConfig = {
  // =========================================================================
  // ACTIVE SETTINGS: Instance A (5.0s Video, 20 Frames @ 250ms delay, 3s Hold)
  // =========================================================================
  videoRecordingDurationSeconds: 5.0,
  videoDurationMinSeconds: 4.0,
  videoDurationMaxSeconds: 6.5,
  gifFrameCount: 20, // 20 video motion frames (21 total frames including cover)
  gifCoverHoldMs: 3000, // 3.0 seconds cover hold
  gifFrameDelayMs: 250, // 250ms per frame (4 fps real-time playback matching 5s recording)
  gifOutputWidth: 600,
  gifOutputHeight: 400,
  gifTimeoutMs: 120000, // 2-minute safety watchdog
  enableComparisonVariants: false,

  // =========================================================================
  // PRD DEFAULT SPECIFICATION (Preserved for easy reference & rollback):
  // =========================================================================
  // videoRecordingDurationSeconds: 6.0,
  // videoDurationMinSeconds: 4.5,
  // videoDurationMaxSeconds: 8.0,
  // gifFrameCount: 21, // 21 video motion frames (22 total frames including cover)
  // gifCoverHoldMs: 3000, // 3.0 seconds cover hold
  // gifFrameDelayMs: 500, // 500ms per frame (2 fps slow-motion playback)
  // gifOutputWidth: 600,
  // gifOutputHeight: 400,
  // gifTimeoutMs: 120000,
  // enableComparisonVariants: false,
};
