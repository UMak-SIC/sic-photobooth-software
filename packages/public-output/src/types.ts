/**
 * Supported photobooth session workflows.
 */
export type SessionType = 'photo_strip' | 'flipbook';

/**
 * Lifecycle status for cloud publishing.
 */
export type PublicationStatus = 'queued' | 'in_progress' | 'uploaded' | 'failed';

/**
 * Public output delivery metadata schema.
 */
export interface PublicOutputMetadata {
  /**
   * 7-character base-62 public identifier.
   */
  publicId: string;

  /**
   * Photobooth session workflow type.
   */
  sessionType: SessionType;

  /**
   * MIME type of the finalized media.
   */
  mediaType: 'image/png' | 'image/gif';

  /**
   * Public delivery URL (Cloudinary or local backend asset endpoint).
   */
  mediaUrl: string;

  /**
   * Optional thumbnail URL for fast preview.
   */
  thumbnailUrl?: string;

  /**
   * Associated event name.
   */
  eventName: string;

  /**
   * Associated event date string (YYYY-MM-DD).
   */
  eventDate: string;

  /**
   * ISO 8601 creation timestamp.
   */
  createdAt: string;

  /**
   * ISO 8601 expiry timestamp (2 months after cloud finalization), or null if unpublished.
   */
  expiresAt: string | null;

  /**
   * Current publication state.
   */
  status: PublicationStatus;
}

/**
 * API response structure for public output retrieval endpoints.
 */
export interface PublicOutputResponse {
  success: boolean;
  data?: PublicOutputMetadata;
  error?: {
    code: string;
    message: string;
  };
}
