import dns from 'node:dns/promises';
import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config.js';
import { dbRepository } from '../db/repository.js';
import {
  isSupabaseConfigured,
  publicOutputExists,
  removePublicOutput,
  registerPublicOutput,
} from './supabase-publication.js';

const ONLINE_CHECK_TIMEOUT_MS = 2000;
const CLOUDINARY_PATH = 'photobooth';
const MAX_ATTEMPTS = 5;
const RETRY_BASE_MS = 5000;
const RETRY_MAX_MS = 15 * 60 * 1000;
const UPLOAD_TIMEOUT_MS = 30 * 1000;
const STALLED_UPLOAD_MS = 5 * 60 * 1000;

const configured =
  Boolean(config.cloudinary.cloudName) &&
  Boolean(config.cloudinary.apiKey) &&
  Boolean(config.cloudinary.apiSecret);

if (configured) {
  cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret,
  });
}

let warnedAboutMissingPublicAppUrl = false;

/**
 * Online gate: only attempt uploads while PUBLIC_APP_URL resolves (PRD Publishing Contract).
 * Skipped entirely when PUBLIC_APP_URL is not configured (local dev).
 */
async function isOnline(): Promise<boolean> {
  if (!config.publicAppUrl) {
    if (config.nodeEnv === 'production' && !warnedAboutMissingPublicAppUrl) {
      console.error('Publishing paused: PUBLIC_APP_URL must be configured in production.');
      warnedAboutMissingPublicAppUrl = true;
    }
    return config.nodeEnv !== 'production';
  }
  try {
    const hostname = new URL(config.publicAppUrl).hostname;
    await Promise.race([
      dns.lookup(hostname),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('PUBLIC_APP_URL lookup timed out')),
          ONLINE_CHECK_TIMEOUT_MS,
        ),
      ),
    ]);
    return true;
  } catch {
    return false;
  }
}

async function uploadToCloudinary(
  filePath: string,
  publicId: string,
): Promise<{ url: string; cloudinaryPublicId: string }> {
  const result = await cloudinary.uploader.upload(filePath, {
    public_id: publicId,
    folder: CLOUDINARY_PATH,
    resource_type: 'image',
    overwrite: true,
    timeout: UPLOAD_TIMEOUT_MS,
  });
  return { url: result.secure_url, cloudinaryPublicId: result.public_id };
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export function retryDelayMs(attempt: number, random: () => number = Math.random): number {
  const cap = Math.min(RETRY_BASE_MS * 2 ** (attempt - 1), RETRY_MAX_MS);
  return Math.floor(cap / 2 + random() * (cap / 2));
}

export async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Publishing provider request timed out.')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function deleteCloudPublication(publicId: string, cloudinaryPublicId: string): Promise<void> {
  if (!configured || !isSupabaseConfigured()) {
    throw new Error('Cloud publishing is not configured.');
  }
  await withTimeout(
    cloudinary.uploader.destroy(cloudinaryPublicId, { resource_type: 'image', invalidate: true }),
    UPLOAD_TIMEOUT_MS,
  );
  await withTimeout(removePublicOutput(publicId), UPLOAD_TIMEOUT_MS);
}

async function processPublication(
  publication: {
    id: string;
    publicId: string;
    filePath: string;
    mediaType: string;
    eventName: string;
    eventDate: string;
    retryCount: number;
  },
  now: Date,
): Promise<void> {
  let cloudinaryUrl: string | null = null;
  let cloudinaryPublicId: string | null = null;
  let cloudFinalizedAt: Date | null = null;
  let expiresAt: Date | null = null;
  try {
    const upload = await withTimeout(
      uploadToCloudinary(publication.filePath, publication.publicId),
      UPLOAD_TIMEOUT_MS,
    );
    cloudinaryUrl = upload.url;
    cloudinaryPublicId = upload.cloudinaryPublicId;
    cloudFinalizedAt = new Date();
    expiresAt = addMonths(cloudFinalizedAt, config.publishing.retentionMonths);
    await withTimeout(
      registerPublicOutput({
        publicId: publication.publicId,
        cloudinaryUrl,
        cloudinaryPublicId,
        mediaType: publication.mediaType,
        eventName: publication.eventName,
        eventDate: publication.eventDate,
        cloudFinalizedAt,
        expiresAt,
      }),
      UPLOAD_TIMEOUT_MS,
    );
    const markedUploaded = await dbRepository.markPublicationUploaded(
      publication.id,
      cloudinaryUrl,
      cloudinaryPublicId,
      cloudFinalizedAt,
      expiresAt,
    );
    if (!markedUploaded) throw new Error('Local publication record could not be finalized.');
  } catch (error) {
    let message = error instanceof Error ? error.message : String(error);
    const attempt = publication.retryCount + 1;
    if (cloudinaryPublicId) {
      try {
        if (await publicOutputExists(publication.publicId)) {
          if (
            await dbRepository.markPublicationUploaded(
              publication.id,
              cloudinaryUrl!,
              cloudinaryPublicId,
              cloudFinalizedAt!,
              expiresAt!,
            )
          ) {
            return;
          }
          message = `${message} Supabase record exists but the local job could not be finalized.`;
        } else if (attempt >= MAX_ATTEMPTS) {
          await cloudinary.uploader.destroy(cloudinaryPublicId, {
            resource_type: 'image',
            invalidate: true,
          });
        }
      } catch (cleanupError) {
        const cleanupMessage =
          cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
        message = `${message} Cleanup failed: ${cleanupMessage}`;
      }
    }
    const nextAttemptAt =
      attempt >= MAX_ATTEMPTS ? null : new Date(now.getTime() + retryDelayMs(attempt));
    await dbRepository.markPublicationFailed(publication.id, message, nextAttemptAt);
  }
}

/**
 * Processes queued publications: claims up to `concurrency` jobs and uploads each.
 */
export async function processQueuedPublications(now: Date = new Date()): Promise<void> {
  await dbRepository.recoverStalledPublications(
    new Date(now.getTime() - STALLED_UPLOAD_MS),
    MAX_ATTEMPTS,
  );
  if (!configured || !isSupabaseConfigured()) return;
  if (!(await isOnline())) return;
  const publications = await dbRepository.claimQueuedPublications(
    config.publishing.concurrency,
    now,
  );
  await Promise.all(publications.map((publication) => processPublication(publication, now)));
}

let timer: NodeJS.Timeout | null = null;
let running = false;

/**
 * Polls the publication queue every pollIntervalMs.
 */
export function startPublishingWorker(): void {
  if (timer) return;
  timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await processQueuedPublications();
    } catch (error) {
      console.error('Publishing worker tick failed:', error);
    } finally {
      running = false;
    }
  }, config.publishing.pollIntervalMs);
}

export function stopPublishingWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
