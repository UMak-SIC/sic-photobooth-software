import type { PublicOutputMetadata } from '@photobooth/public-output';

type PublicOutputRow = {
  public_id: string;
  cloudinary_url: string;
  media_type: string;
  event_name: string;
  event_date: string;
  status: string;
  created_at: string;
  expires_at: string;
};

function isSafeDeliveryUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export function toPublicOutputMetadata(value: unknown): PublicOutputMetadata | null {
  if (!value || typeof value !== 'object') return null;

  const row = value as Partial<PublicOutputRow>;
  if (
    typeof row.public_id !== 'string' ||
    typeof row.cloudinary_url !== 'string' ||
    typeof row.media_type !== 'string' ||
    typeof row.event_name !== 'string' ||
    typeof row.event_date !== 'string' ||
    typeof row.status !== 'string' ||
    typeof row.created_at !== 'string' ||
    typeof row.expires_at !== 'string' ||
    !isSafeDeliveryUrl(row.cloudinary_url) ||
    (row.media_type !== 'image/png' && row.media_type !== 'image/gif') ||
    row.status !== 'uploaded'
  ) {
    return null;
  }

  const expiresAt = new Date(row.expires_at);
  const createdAt = new Date(row.created_at);
  if (Number.isNaN(expiresAt.valueOf()) || Number.isNaN(createdAt.valueOf()) || expiresAt <= new Date()) {
    return null;
  }

  return {
    publicId: row.public_id,
    sessionType: row.media_type === 'image/gif' ? 'flipbook' : 'photo_strip',
    mediaType: row.media_type,
    mediaUrl: row.cloudinary_url,
    eventName: row.event_name,
    eventDate: row.event_date,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    status: 'uploaded',
  };
}
