import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import sharp from 'sharp';
import { gifRenderer } from '../src/services/gif-renderer.js';

describe('GifRenderer Service', () => {
  const tempDir = path.join(os.tmpdir(), 'photobooth-test-gif-renderer');
  const coverPath = path.join(tempDir, 'test-cover.jpg');
  const overlayPath = path.join(tempDir, 'test-overlay.png');
  const mockVideoPath = path.join(tempDir, 'mock-video.mp4');
  const outputPath = path.join(tempDir, 'output.gif');
  const intermediateDir = path.join(tempDir, 'intermediate');

  beforeAll(async () => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Create a mock cover photo (600x400 blue)
    await sharp({
      create: {
        width: 600,
        height: 400,
        channels: 4,
        background: { r: 0, g: 120, b: 200, alpha: 1 },
      },
    })
      .jpeg()
      .toFile(coverPath);

    // Create a mock transparent overlay PNG (600x400 with a green border)
    await sharp({
      create: {
        width: 600,
        height: 400,
        channels: 4,
        background: { r: 0, g: 255, b: 128, alpha: 0.5 },
      },
    })
      .png()
      .toFile(overlayPath);

    // Create a mock video file (dummy bytes)
    fs.writeFileSync(mockVideoPath, Buffer.from('mock video bytes'));
  });

  afterAll(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      // ignore cleanup errors
    }
  });

  it('renders a valid animated GIF with 3.0s cover hold and overlay compositing', async () => {
    await gifRenderer.renderFlipbookGif(
      coverPath,
      mockVideoPath,
      overlayPath,
      outputPath,
      intermediateDir,
      {
        frameCount: 21,
        coverHoldMs: 3000,
        frameDelayMs: 500,
        outputWidth: 300,
        outputHeight: 200,
        timeoutMs: 10000,
      },
    );

    expect(fs.existsSync(outputPath)).toBe(true);

    const fileBuffer = fs.readFileSync(outputPath);
    // GIF magic bytes: "GIF89a" or "GIF87a"
    const header = fileBuffer.subarray(0, 6).toString('ascii');
    expect(header.startsWith('GIF')).toBe(true);
    expect(fileBuffer.length).toBeGreaterThan(1000);
  });

  it('times out and throws contract error when rendering exceeds deadline', async () => {
    await expect(
      gifRenderer.renderFlipbookGif(
        coverPath,
        mockVideoPath,
        overlayPath,
        path.join(tempDir, 'timeout-output.gif'),
        path.join(tempDir, 'timeout-intermediate'),
        {
          timeoutMs: 1, // 1 millisecond timeout to force timeout watchdog trigger
        },
      ),
    ).rejects.toThrow('GIF processing took too long. Please recapture this flipbook.');
  });
});
