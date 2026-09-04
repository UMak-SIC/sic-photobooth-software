export type SupportedImageFormat = 'png' | 'jpeg';
export type SupportedVideoFormat = 'mp4' | 'mkv' | 'webm';

export interface ImageValidationResult {
  isValid: boolean;
  format?: SupportedImageFormat;
  width?: number;
  height?: number;
  sizeBytes: number;
  error?: string;
}

export interface VideoValidationResult {
  isValid: boolean;
  format?: SupportedVideoFormat;
  sizeBytes: number;
  durationSeconds?: number;
  error?: string;
}

export const MAX_PHOTO_SIZE_BYTES = 15 * 1024 * 1024; // 15MB
export const MAX_VIDEO_SIZE_BYTES = 100 * 1024 * 1024; // 100MB
export const EXPECTED_VIDEO_DURATION_SECONDS = 6.0;

export class MediaValidator {
  /**
   * Detects image format based on magic byte headers.
   */
  public detectImageFormat(buffer: Buffer): SupportedImageFormat | null {
    if (!buffer || buffer.length < 8) {
      return null;
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return 'png';
    }

    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'jpeg';
    }

    return null;
  }

  /**
   * Detects video container format based on magic byte headers.
   */
  public detectVideoFormat(buffer: Buffer): SupportedVideoFormat | null {
    if (!buffer || buffer.length < 12) {
      return null;
    }

    // MKV / WebM: EBML Header 1A 45 DF A3
    if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
      return 'mkv';
    }

    // MP4: 'ftyp' box signature at offset 4..7
    const ftyp = buffer.toString('ascii', 4, 8);
    if (ftyp === 'ftyp') {
      return 'mp4';
    }

    return null;
  }

  /**
   * Extracts PNG width and height from IHDR chunk.
   */
  public parsePngDimensions(buffer: Buffer): { width: number; height: number } | null {
    if (buffer.length < 24 || this.detectImageFormat(buffer) !== 'png') {
      return null;
    }
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height };
  }

  /**
   * Validates an uploaded photo buffer.
   */
  public validateImage(
    buffer: Buffer,
    options?: { maxSizeBytes?: number; require16x9?: boolean },
  ): ImageValidationResult {
    const sizeBytes = buffer?.length ?? 0;
    const maxSizeBytes = options?.maxSizeBytes ?? MAX_PHOTO_SIZE_BYTES;

    if (!buffer || sizeBytes === 0) {
      return { isValid: false, sizeBytes: 0, error: 'Empty file buffer' };
    }

    if (sizeBytes > maxSizeBytes) {
      return {
        isValid: false,
        sizeBytes,
        error: `File size exceeds maximum allowed of ${Math.round(maxSizeBytes / (1024 * 1024))}MB`,
      };
    }

    const format = this.detectImageFormat(buffer);
    if (!format) {
      return {
        isValid: false,
        sizeBytes,
        error: 'Unsupported or malformed image format. Only valid PNG and JPEG files are accepted.',
      };
    }

    let width: number | undefined;
    let height: number | undefined;

    if (format === 'png') {
      const dims = this.parsePngDimensions(buffer);
      if (dims) {
        width = dims.width;
        height = dims.height;
      }
    }

    return {
      isValid: true,
      format,
      width,
      height,
      sizeBytes,
    };
  }

  /**
   * Validates an uploaded video buffer.
   */
  public validateVideo(
    buffer: Buffer,
    options?: { maxSizeBytes?: number; reportedDuration?: number },
  ): VideoValidationResult {
    const sizeBytes = buffer?.length ?? 0;
    const maxSizeBytes = options?.maxSizeBytes ?? MAX_VIDEO_SIZE_BYTES;

    if (!buffer || sizeBytes === 0) {
      return { isValid: false, sizeBytes: 0, error: 'Empty file buffer' };
    }

    if (sizeBytes > maxSizeBytes) {
      return {
        isValid: false,
        sizeBytes,
        error: `File size exceeds maximum allowed of ${Math.round(maxSizeBytes / (1024 * 1024))}MB`,
      };
    }

    const format = this.detectVideoFormat(buffer);
    if (!format) {
      return {
        isValid: false,
        sizeBytes,
        error:
          'Unsupported or malformed video format. Only valid MP4, MKV, and WebM recordings are accepted.',
      };
    }

    // Duration validation if provided
    if (options?.reportedDuration !== undefined) {
      const duration = options.reportedDuration;
      if (duration < 5.0 || duration > 7.5) {
        return {
          isValid: false,
          format,
          sizeBytes,
          durationSeconds: duration,
          error: `Invalid video duration (${duration.toFixed(1)}s). Flipbook recordings must be 6 seconds.`,
        };
      }
    }

    return {
      isValid: true,
      format,
      sizeBytes,
      durationSeconds: options?.reportedDuration ?? EXPECTED_VIDEO_DURATION_SECONDS,
    };
  }
}

export const mediaValidator = new MediaValidator();
