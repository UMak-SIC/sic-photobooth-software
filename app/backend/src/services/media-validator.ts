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
    if (!buffer || buffer.length < 8) {
      return null;
    }

    // 1. MKV / WebM: EBML Header [1A 45 DF A3] in the first 32 bytes
    for (let i = 0; i <= Math.min(32, buffer.length - 4); i++) {
      if (
        buffer[i] === 0x1a &&
        buffer[i + 1] === 0x45 &&
        buffer[i + 2] === 0xdf &&
        buffer[i + 3] === 0xa3
      ) {
        const headerSlice = buffer.slice(0, Math.min(128, buffer.length)).toString('latin1');
        if (headerSlice.includes('webm')) {
          return 'webm';
        }
        return 'mkv';
      }
    }

    const headerString = buffer.slice(0, Math.min(128, buffer.length)).toString('latin1');
    if (headerString.includes('webm')) {
      return 'webm';
    }
    if (headerString.includes('matroska')) {
      return 'mkv';
    }

    // 2. MP4 / QuickTime: 'ftyp', 'moov', 'mdat', 'wide', 'free' boxes
    if (buffer.length >= 8) {
      const boxType = buffer.toString('ascii', 4, 8);
      if (['ftyp', 'moov', 'mdat', 'wide', 'free'].includes(boxType)) {
        return 'mp4';
      }
    }

    // Check for common MP4 brand signatures (isom, mp41, mp42, avc1, qt  )
    if (
      headerString.includes('ftyp') ||
      headerString.includes('isom') ||
      headerString.includes('mp4')
    ) {
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
   * Extracts duration in seconds from an MP4 buffer by reading the mvhd box.
   */
  public parseMp4Duration(buffer: Buffer): number | null {
    if (!buffer || buffer.length < 16) {
      return null;
    }

    let offset = 0;
    while (offset + 8 <= buffer.length) {
      const boxSize = buffer.readUInt32BE(offset);
      const boxType = buffer.toString('ascii', offset + 4, offset + 8);

      const actualSize = boxSize === 0 ? buffer.length - offset : boxSize;
      if (actualSize < 8 || offset + actualSize > buffer.length) {
        break;
      }

      if (boxType === 'moov') {
        let moovOffset = offset + 8;
        const moovEnd = offset + actualSize;
        while (moovOffset + 8 <= moovEnd) {
          const childSize = buffer.readUInt32BE(moovOffset);
          const childType = buffer.toString('ascii', moovOffset + 4, moovOffset + 8);
          if (childSize < 8 || moovOffset + childSize > moovEnd) {
            break;
          }

          if (childType === 'mvhd') {
            const version = buffer.readUInt8(moovOffset + 8);
            if (version === 0 && moovOffset + 28 <= moovEnd) {
              const timescale = buffer.readUInt32BE(moovOffset + 20);
              const duration = buffer.readUInt32BE(moovOffset + 24);
              if (timescale > 0) {
                return duration / timescale;
              }
            } else if (version === 1 && moovOffset + 40 <= moovEnd) {
              const timescale = buffer.readUInt32BE(moovOffset + 28);
              const durationHigh = buffer.readUInt32BE(moovOffset + 32);
              const durationLow = buffer.readUInt32BE(moovOffset + 36);
              const duration = durationHigh * 2 ** 32 + durationLow;
              if (timescale > 0) {
                return duration / timescale;
              }
            }
          }
          moovOffset += childSize;
        }
      }

      offset += actualSize;
    }

    return null;
  }

  /**
   * Extracts duration in seconds from a WebM / MKV buffer by reading EBML Info Duration.
   */
  public parseWebmDuration(buffer: Buffer): number | null {
    if (!buffer || buffer.length < 8) {
      return null;
    }

    let timecodeScaleNs = 1000000;

    for (let i = 0; i < Math.min(buffer.length - 6, 65536); i++) {
      // TimecodeScale: [0x2A, 0xD7, 0xB1]
      if (
        buffer[i] === 0x2a &&
        buffer[i + 1] === 0xd7 &&
        buffer[i + 2] === 0xb1 &&
        i + 4 < buffer.length
      ) {
        const lengthByte = buffer[i + 3];
        const valLen = lengthByte & 0x7f;
        if (valLen === 4 && i + 8 <= buffer.length) {
          timecodeScaleNs = buffer.readUInt32BE(i + 4);
        }
      }

      // Duration: [0x44, 0x89]
      if (buffer[i] === 0x44 && buffer[i + 1] === 0x89 && i + 3 < buffer.length) {
        const lengthByte = buffer[i + 2];
        const valLen = lengthByte & 0x7f;
        if (valLen === 4 && i + 7 <= buffer.length) {
          const rawDuration = buffer.readFloatBE(i + 3);
          return (rawDuration * timecodeScaleNs) / 1000000000;
        } else if (valLen === 8 && i + 11 <= buffer.length) {
          const rawDuration = buffer.readDoubleBE(i + 3);
          return (rawDuration * timecodeScaleNs) / 1000000000;
        }
      }
    }

    return null;
  }

  /**
   * Extracts video duration directly from container binary headers.
   */
  public extractVideoDuration(buffer: Buffer): number | null {
    const format = this.detectVideoFormat(buffer);
    if (format === 'mp4') {
      return this.parseMp4Duration(buffer);
    }
    if (format === 'webm' || format === 'mkv') {
      return this.parseWebmDuration(buffer);
    }
    return null;
  }

  /**
   * Validates an uploaded video buffer.
   */
  public validateVideo(
    buffer: Buffer,
    options?: {
      maxSizeBytes?: number;
      minDurationSeconds?: number;
      maxDurationSeconds?: number;
      requireDuration?: boolean;
    },
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

    const requireDuration = options?.requireDuration ?? true;
    if (requireDuration) {
      const duration = this.extractVideoDuration(buffer);
      if (duration === null) {
        return {
          isValid: false,
          format,
          sizeBytes,
          error:
            'Could not determine video duration from media headers. Corrupted or incomplete video stream.',
        };
      }

      const minDuration = options?.minDurationSeconds ?? 5.0;
      const maxDuration = options?.maxDurationSeconds ?? 7.0;

      if (duration < minDuration || duration > maxDuration) {
        return {
          isValid: false,
          format,
          sizeBytes,
          durationSeconds: duration,
          error: `Invalid video duration (${duration.toFixed(1)}s). Flipbook recordings must be 6 seconds (allowed: ${minDuration.toFixed(1)}s-${maxDuration.toFixed(1)}s).`,
        };
      }

      return {
        isValid: true,
        format,
        sizeBytes,
        durationSeconds: duration,
      };
    }

    return {
      isValid: true,
      format,
      sizeBytes,
    };
  }
}

export const mediaValidator = new MediaValidator();
