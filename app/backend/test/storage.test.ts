import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { StorageService } from '../src/services/storage.js';

describe('StorageService', () => {
  const testStorageDir = path.resolve(__dirname, './tmp-storage');
  let storage: StorageService;

  beforeEach(() => {
    if (fs.existsSync(testStorageDir)) {
      fs.rmSync(testStorageDir, { recursive: true, force: true });
    }
    storage = new StorageService(testStorageDir);
    storage.initStorage();
  });

  afterEach(() => {
    if (fs.existsSync(testStorageDir)) {
      fs.rmSync(testStorageDir, { recursive: true, force: true });
    }
  });

  it('initializes base directory and outputs folder', () => {
    expect(fs.existsSync(testStorageDir)).toBe(true);
    expect(fs.existsSync(path.join(testStorageDir, 'outputs'))).toBe(true);
  });

  it('sanitizes identifiers and rejects path traversal', () => {
    expect(() => storage.sanitizeId('../traversal')).toThrowError(/Path traversal/);
    expect(() => storage.sanitizeId('session/123')).toThrowError(/Path traversal/);
    expect(() => storage.sanitizeId('session\0injection')).toThrowError(/Path traversal/);
    expect(storage.sanitizeId('session-123_abc')).toBe('session-123_abc');
  });

  it('creates isolated session category directories', () => {
    const origDir = storage.getSessionDir('session-1', 'originals');
    const videoDir = storage.getSessionDir('session-1', 'videos');

    expect(fs.existsSync(origDir)).toBe(true);
    expect(fs.existsSync(videoDir)).toBe(true);
    expect(origDir).toContain(path.join('sessions', 'session-1', 'originals'));
  });

  it('saves original photo capture and video files', async () => {
    const photoBuffer = Buffer.from('fake-photo-data');
    const photoPath = await storage.saveOriginalCapture('session-1', 1, photoBuffer, 'png');

    expect(fs.existsSync(photoPath)).toBe(true);
    expect(fs.readFileSync(photoPath, 'utf8')).toBe('fake-photo-data');

    const videoBuffer = Buffer.from('fake-video-data');
    const videoPath = await storage.saveVideo('session-1', 1, videoBuffer, 'mp4');

    expect(fs.existsSync(videoPath)).toBe(true);
    expect(fs.readFileSync(videoPath, 'utf8')).toBe('fake-video-data');
  });

  it('saves generated output and enables retrieval by public ID', async () => {
    const outputBuffer = Buffer.from('fake-output-png');
    const { sessionFilePath, publicFilePath } = await storage.saveOutput(
      'session-1',
      '7fK92pQ',
      outputBuffer,
      'png',
    );

    expect(fs.existsSync(sessionFilePath)).toBe(true);
    expect(fs.existsSync(publicFilePath)).toBe(true);

    const retrievedPath = storage.getOutputPath('7fK92pQ', 'png');
    expect(retrievedPath).toBe(publicFilePath);
  });
});
