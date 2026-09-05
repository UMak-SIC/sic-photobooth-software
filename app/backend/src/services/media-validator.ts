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
   * Extracts duration in seconds from an MP4 buffer by reading the mvhd, mehd, or tfdt boxes.
   */
  public parseMp4Duration(buffer: Buffer): number | null {
    if (!buffer || buffer.length < 16) {
      return null;
    }

    let timescale: number | null = null;
    let explicitDuration: number | null = null;

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
              const ts = buffer.readUInt32BE(moovOffset + 20);
              const dur = buffer.readUInt32BE(moovOffset + 24);
              if (ts > 0) timescale = ts;
              if (ts > 0 && dur > 0) {
                explicitDuration = dur / ts;
              }
            } else if (version === 1 && moovOffset + 40 <= moovEnd) {
              const ts = buffer.readUInt32BE(moovOffset + 28);
              const durationHigh = buffer.readUInt32BE(moovOffset + 32);
              const durationLow = buffer.readUInt32BE(moovOffset + 36);
              const dur = durationHigh * 2 ** 32 + durationLow;
              if (ts > 0) timescale = ts;
              if (ts > 0 && dur > 0) {
                explicitDuration = dur / ts;
              }
            }
          }
          moovOffset += childSize;
        }
      }

      offset += actualSize;
    }

    if (explicitDuration !== null && explicitDuration > 0) {
      return explicitDuration;
    }

    // Fragmented MP4 fallback (mehd / tfdt boxes)
    const effectiveTimescale = timescale ?? 1000;
    let maxDecodeTime = -1;

    for (let i = 0; i <= buffer.length - 8; i++) {
      const boxType = buffer.toString('ascii', i + 4, i + 8);

      if (boxType === 'mehd' && i + 16 <= buffer.length) {
        const version = buffer.readUInt8(i + 8);
        const mehdDur = version === 0 ? buffer.readUInt32BE(i + 12) : buffer.readUInt32BE(i + 20);
        if (mehdDur > 0 && effectiveTimescale > 0) {
          return mehdDur / effectiveTimescale;
        }
      }

      if (boxType === 'tfdt' && i + 16 <= buffer.length) {
        const version = buffer.readUInt8(i + 8);
        let decodeTime = 0;
        if (version === 0) {
          decodeTime = buffer.readUInt32BE(i + 12);
        } else if (version === 1 && i + 20 <= buffer.length) {
          const high = buffer.readUInt32BE(i + 12);
          const low = buffer.readUInt32BE(i + 16);
          decodeTime = high * 2 ** 32 + low;
        }
        if (decodeTime > maxDecodeTime) {
          maxDecodeTime = decodeTime;
        }
      }
    }

    if (maxDecodeTime > 0 && effectiveTimescale > 0) {
      return maxDecodeTime / effectiveTimescale;
    }

    return null;
  }

  /**
   * Extracts duration in seconds from a WebM / MKV buffer by reading EBML Info Duration,
   * or by traversing cluster/block timecodes when duration is omitted by MediaRecorder.
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
          if (rawDuration > 0) {
            return (rawDuration * timecodeScaleNs) / 1000000000;
          }
        } else if (valLen === 8 && i + 11 <= buffer.length) {
          const rawDuration = buffer.readDoubleBE(i + 3);
          if (rawDuration > 0) {
            return (rawDuration * timecodeScaleNs) / 1000000000;
          }
        }
      }
    }

    // Fallback for MediaRecorder WebM streams (which omit Segment Info Duration [0x44, 0x89]):
    // Traverse Cluster headers ([0x1F, 0x43, 0xB6, 0x75]) and Timecodes ([0xE7]).
    let maxClusterTimestamp = -1;
    let maxBlockTimestamp = -1;

    for (let i = 0; i <= buffer.length - 8; i++) {
      if (
        buffer[i] === 0x1f &&
        buffer[i + 1] === 0x43 &&
        buffer[i + 2] === 0xb6 &&
        buffer[i + 3] === 0x75
      ) {
        let pos = i + 4;
        if (pos >= buffer.length) continue;

        // Skip Cluster size VINT
        const firstByte = buffer[pos];
        let mask = 0x80;
        let vintLen = 1;
        while ((firstByte & mask) === 0 && vintLen <= 8) {
          mask >>= 1;
          vintLen++;
        }
        pos += vintLen;

        let clusterTimecode = -1;
        // Search ONLY within the immediate first 16 bytes of the cluster body for Timecode (0xE7)
        const headerLimit = Math.min(pos + 16, buffer.length);
        while (pos < headerLimit) {
          if (buffer[pos] === 0xe7 && pos + 2 <= buffer.length) {
            pos++;
            const tcLenByte = buffer[pos];
            const tcLen = tcLenByte & 0x7f;
            pos++;
            if (tcLen >= 1 && tcLen <= 8 && pos + tcLen <= buffer.length) {
              let val = 0;
              for (let b = 0; b < tcLen; b++) {
                val = val * 256 + buffer[pos + b];
              }
              clusterTimecode = val;
              if (val > maxClusterTimestamp) {
                maxClusterTimestamp = val;
              }
              pos += tcLen;
            }
            break;
          }
          pos++;
        }

        if (clusterTimecode >= 0) {
          // Parse child elements (SimpleBlocks 0xA3) by jumping element lengths
          const blockScanLimit = Math.min(i + 2097152, buffer.length - 4);
          while (pos < blockScanLimit) {
            const elemId = buffer[pos];
            if (
              pos + 4 <= buffer.length &&
              buffer[pos] === 0x1f &&
              buffer[pos + 1] === 0x43 &&
              buffer[pos + 2] === 0xb6 &&
              buffer[pos + 3] === 0x75
            ) {
              // Next cluster
              break;
            }

            if (elemId === 0xa3 && pos + 4 < buffer.length) {
              let bPos = pos + 1;
              const bFirst = buffer[bPos];
              let bMask = 0x80;
              let bVintLen = 1;
              while ((bFirst & bMask) === 0 && bVintLen <= 8) {
                bMask >>= 1;
                bVintLen++;
              }
              let bSize = bFirst & (bMask - 1);
              for (let b = 1; b < bVintLen; b++) {
                bSize = bSize * 256 + buffer[bPos + b];
              }
              bPos += bVintLen;

              if (bPos + 3 <= buffer.length) {
                const tFirst = buffer[bPos];
                let tMask = 0x80;
                let tVintLen = 1;
                while ((tFirst & tMask) === 0 && tVintLen <= 8) {
                  tMask >>= 1;
                  tVintLen++;
                }
                bPos += tVintLen;

                if (bPos + 2 <= buffer.length) {
                  const relTimecode = buffer.readInt16BE(bPos);
                  const blockTotalTime = clusterTimecode + relTimecode;
                  if (
                    relTimecode >= -1000 &&
                    relTimecode <= 5000 &&
                    blockTotalTime > maxBlockTimestamp
                  ) {
                    maxBlockTimestamp = blockTotalTime;
                  }
                }
              }

              if (bSize > 0 && pos + 1 + bVintLen + bSize <= buffer.length) {
                pos += 1 + bVintLen + bSize;
                continue;
              }
            }
            pos++;
          }
        }
      }
    }

    if (maxBlockTimestamp >= 0) {
      return ((maxBlockTimestamp + 33) * timecodeScaleNs) / 1000000000;
    } else if (maxClusterTimestamp >= 0) {
      // Add standard 100ms cluster frame window for the final cluster
      return ((maxClusterTimestamp + 100) * timecodeScaleNs) / 1000000000;
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

      const minDuration = options?.minDurationSeconds ?? 4.5;
      const maxDuration = options?.maxDurationSeconds ?? 8.0;

      // Allow 0.05s epsilon tolerance for floating-point duration boundaries
      if (duration < minDuration - 0.05 || duration > maxDuration + 0.05) {
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
