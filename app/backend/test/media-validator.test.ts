import { describe, it, expect } from 'vitest';
import { MediaValidator, MAX_PHOTO_SIZE_BYTES } from '../src/services/media-validator.js';

describe('MediaValidator', () => {
  const validator = new MediaValidator();

  // Valid Magic Byte Buffers
  const validPngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
  const validJpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  const validMkvHeader = Buffer.from([
    0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81,
  ]);
  const validMp4Header = Buffer.from([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
  ]);

  it('detects valid image formats from magic bytes', () => {
    expect(validator.detectImageFormat(validPngHeader)).toBe('png');
    expect(validator.detectImageFormat(validJpegHeader)).toBe('jpeg');
    expect(validator.detectImageFormat(Buffer.from('fake-text-file'))).toBeNull();
  });

  it('detects valid video formats from magic bytes', () => {
    expect(validator.detectVideoFormat(validMkvHeader)).toBe('mkv');
    expect(validator.detectVideoFormat(validMp4Header)).toBe('mp4');
    expect(validator.detectVideoFormat(Buffer.from('fake-text-file'))).toBeNull();
  });

  it('validates uploaded image buffers and rejects oversized payloads', () => {
    const pngResult = validator.validateImage(validPngHeader);
    expect(pngResult.isValid).toBe(true);
    expect(pngResult.format).toBe('png');

    const oversizedBuffer = Buffer.alloc(MAX_PHOTO_SIZE_BYTES + 1024);
    const oversizedResult = validator.validateImage(oversizedBuffer);
    expect(oversizedResult.isValid).toBe(false);
    expect(oversizedResult.error).toContain('File size exceeds maximum');
  });

  it('validates video buffers and enforces duration bounds', () => {
    const videoResult = validator.validateVideo(validMp4Header, { reportedDuration: 6.0 });
    expect(videoResult.isValid).toBe(true);
    expect(videoResult.format).toBe('mp4');
    expect(videoResult.durationSeconds).toBe(6.0);

    const invalidDurationResult = validator.validateVideo(validMp4Header, {
      reportedDuration: 12.0,
    });
    expect(invalidDurationResult.isValid).toBe(false);
    expect(invalidDurationResult.error).toContain('Flipbook recordings must be 6 seconds');
  });

  it('rejects malformed or empty image/video files', () => {
    expect(validator.validateImage(Buffer.alloc(0)).isValid).toBe(false);
    expect(validator.validateVideo(Buffer.alloc(0)).isValid).toBe(false);
    expect(validator.validateImage(Buffer.from('not an image')).isValid).toBe(false);
  });
});
