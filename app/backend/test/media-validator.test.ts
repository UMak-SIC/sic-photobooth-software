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
    expect(
      validator.detectImageFormat(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')),
    ).toBe('svg');
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

  it('extracts real container duration and validates within 4.0s to 6.5s bounds for MP4', () => {
    const valid5sMp4 = createSyntheticMp4(5.0);
    const result = validator.validateVideo(valid5sMp4);
    expect(result.isValid).toBe(true);
    expect(result.format).toBe('mp4');
    expect(result.durationSeconds).toBe(5.0);

    const valid4_8sMp4 = createSyntheticMp4(4.8);
    expect(validator.validateVideo(valid4_8sMp4).isValid).toBe(true);

    const tooShortMp4 = createSyntheticMp4(2.5);
    const shortResult = validator.validateVideo(tooShortMp4);
    expect(shortResult.isValid).toBe(false);
    expect(shortResult.error).toContain('Flipbook recordings must be 5 seconds');

    const tooLongMp4 = createSyntheticMp4(15.0);
    const longResult = validator.validateVideo(tooLongMp4);
    expect(longResult.isValid).toBe(false);
    expect(longResult.error).toContain('Flipbook recordings must be 5 seconds');
  });

  it('extracts real container duration and validates within bounds for WebM', () => {
    const valid5sWebm = createSyntheticWebm(5.0);
    const result = validator.validateVideo(valid5sWebm);
    expect(result.isValid).toBe(true);
    expect(result.format).toBe('webm');
    expect(Math.round(result.durationSeconds ?? 0)).toBe(5);

    const tooShortWebm = createSyntheticWebm(2.0);
    const shortResult = validator.validateVideo(tooShortWebm);
    expect(shortResult.isValid).toBe(false);
    expect(shortResult.error).toContain('Flipbook recordings must be 5 seconds');
  });

  it('extracts duration from streamed WebM clusters when explicit Duration header is omitted', () => {
    const streamedWebm = createSyntheticStreamedWebm(5.0);
    const result = validator.validateVideo(streamedWebm);
    expect(result.isValid).toBe(true);
    expect(result.format).toBe('webm');
    expect(Math.round(result.durationSeconds ?? 0)).toBe(5);
  });

  it('rejects video files with missing duration headers when duration is required', () => {
    const headerWithoutDuration = Buffer.from([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x00,
      0x00,
    ]);
    const result = validator.validateVideo(headerWithoutDuration);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Could not determine video duration');
  });

  it('rejects malformed or empty image/video files', () => {
    expect(validator.validateImage(Buffer.alloc(0)).isValid).toBe(false);
    expect(validator.validateVideo(Buffer.alloc(0)).isValid).toBe(false);
    expect(validator.validateImage(Buffer.from('not an image')).isValid).toBe(false);
  });

  it('rejects images exceeding maximum dimensions of 8192x8192 pixels', () => {
    // Construct PNG header with dimensions 10000 x 10000 (0x2710)
    const oversizedDimPng = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // PNG signature
      Buffer.from([0x00, 0x00, 0x00, 0x0d]), // IHDR length
      Buffer.from('IHDR'), // IHDR type
      Buffer.from([0x00, 0x00, 0x27, 0x10]), // Width: 10000
      Buffer.from([0x00, 0x00, 0x27, 0x10]), // Height: 10000
      Buffer.from([0x08, 0x02, 0x00, 0x00, 0x00]), // 8-bit truecolor
    ]);
    const result = validator.validateImage(oversizedDimPng);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Image dimensions (10000x10000) exceed maximum allowed');
  });
});

function createSyntheticMp4(durationSeconds: number, timescale: number = 1000): Buffer {
  const ftypBox = Buffer.from([
    0x00, 0x00, 0x00, 0x14, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
    0x69, 0x73, 0x6f, 0x6d,
  ]);

  const mvhdDurationUnits = Math.round(durationSeconds * timescale);
  const mvhdBox = Buffer.alloc(108);
  mvhdBox.writeUInt32BE(108, 0);
  mvhdBox.write('mvhd', 4, 'ascii');
  mvhdBox.writeUInt8(0, 8);
  mvhdBox.writeUInt32BE(timescale, 20);
  mvhdBox.writeUInt32BE(mvhdDurationUnits, 24);

  const moovSize = 8 + mvhdBox.length;
  const moovBox = Buffer.alloc(moovSize);
  moovBox.writeUInt32BE(moovSize, 0);
  moovBox.write('moov', 4, 'ascii');
  mvhdBox.copy(moovBox, 8);

  return Buffer.concat([ftypBox, moovBox]);
}

function createSyntheticWebm(durationSeconds: number): Buffer {
  const ebmlHeader = Buffer.from([
    0x1a,
    0x45,
    0xdf,
    0xa3, // EBML ID
    0x9f, // size
    0x42,
    0x86,
    0x81,
    0x01, // EBMLVersion 1
    0x42,
    0xf7,
    0x81,
    0x01, // EBMLReadVersion 1
    0x42,
    0x82,
    0x84,
    0x77,
    0x65,
    0x62,
    0x6d, // DocType 'webm'
  ]);

  const timecodeScale = Buffer.alloc(8);
  timecodeScale[0] = 0x2a;
  timecodeScale[1] = 0xd7;
  timecodeScale[2] = 0xb1;
  timecodeScale[3] = 0x84;
  timecodeScale.writeUInt32BE(1000000, 4);

  const durationBox = Buffer.alloc(7);
  durationBox[0] = 0x44;
  durationBox[1] = 0x89;
  durationBox[2] = 0x84;
  durationBox.writeFloatBE(durationSeconds * 1000, 3);

  return Buffer.concat([ebmlHeader, timecodeScale, durationBox]);
}

function createSyntheticStreamedWebm(durationSeconds: number): Buffer {
  const ebmlHeader = Buffer.from([
    0x1a,
    0x45,
    0xdf,
    0xa3, // EBML ID
    0x9f, // size
    0x42,
    0x86,
    0x81,
    0x01, // EBMLVersion 1
    0x42,
    0xf7,
    0x81,
    0x01, // EBMLReadVersion 1
    0x42,
    0x82,
    0x84,
    0x77,
    0x65,
    0x62,
    0x6d, // DocType 'webm'
  ]);

  const timecodeScale = Buffer.alloc(8);
  timecodeScale[0] = 0x2a;
  timecodeScale[1] = 0xd7;
  timecodeScale[2] = 0xb1;
  timecodeScale[3] = 0x84;
  timecodeScale.writeUInt32BE(1000000, 4);

  // Cluster 1 (t=0)
  const cluster1 = Buffer.from([
    0x1f,
    0x43,
    0xb6,
    0x75, // Cluster ID
    0xff, // unknown size
    0xe7,
    0x81,
    0x00, // Timecode 0
  ]);

  // Cluster 2 (t=durationSeconds * 1000)
  const targetTimecode = Math.max(0, Math.round(durationSeconds * 1000));
  const cluster2 = Buffer.alloc(9);
  cluster2[0] = 0x1f;
  cluster2[1] = 0x43;
  cluster2[2] = 0xb6;
  cluster2[3] = 0x75; // Cluster ID
  cluster2[4] = 0xff; // size
  cluster2[5] = 0xe7; // Timecode ID
  cluster2[6] = 0x82; // 2-byte length
  cluster2.writeUInt16BE(targetTimecode, 7);

  return Buffer.concat([ebmlHeader, timecodeScale, cluster1, cluster2]);
}
