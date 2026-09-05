import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { generateQrSvg } from './qr-generator.js';
import type { TemplatePlacement, TemplateOverlay } from '../db/repository.js';

export interface RenderStripOptions {
  width: number;
  height: number;
  backgroundPath?: string;
  backgroundColor?: string;
  placements: TemplatePlacement[];
  overlays?: TemplateOverlay[];
  captures: Array<{ captureIndex: number; filePath: string }>;
  publicId: string;
  qrUrl: string;
  eventName?: string;
  eventDate?: string;
}

export class PhotoStripRenderer {
  /**
   * Composites captured photos into a 300 DPI 4R PNG photo strip matching the template layout.
   */
  public async renderStrip(options: RenderStripOptions): Promise<Buffer> {
    const {
      width,
      height,
      backgroundPath,
      backgroundColor,
      placements,
      overlays = [],
      captures,
      qrUrl,
    } = options;

    // 1. Create base 4R canvas
    const baseColor = backgroundColor || '#ffffff';
    const canvas = sharp({
      create: {
        width,
        height,
        channels: 4,
        background: baseColor,
      },
    }).png();

    const compositeInputs: sharp.OverlayOptions[] = [];

    // 2. Add background asset if present
    if (backgroundPath && fs.existsSync(backgroundPath)) {
      const bgBuffer = await sharp(backgroundPath)
        .resize(width, height, { fit: 'cover', position: 'center' })
        .toBuffer();
      compositeInputs.push({
        input: bgBuffer,
        top: 0,
        left: 0,
      });
    }

    // 3. Process photo placements (sorted by zIndex)
    const sortedPlacements = [...placements].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

    for (const placement of sortedPlacements) {
      const capture = captures.find((c) => c.captureIndex === placement.captureIndex);
      let photoBuffer: Buffer;

      if (capture && fs.existsSync(capture.filePath)) {
        // Read capture original, apply centered cover crop to placement dimensions
        let img = sharp(capture.filePath).resize(placement.width, placement.height, {
          fit: 'cover',
          position: 'center',
        });

        // Apply border radius mask if specified
        if (placement.borderRadius && placement.borderRadius > 0) {
          const r = placement.borderRadius;
          const maskSvg = Buffer.from(`
            <svg width="${placement.width}" height="${placement.height}" xmlns="http://www.w3.org/2000/svg">
              <rect x="0" y="0" width="${placement.width}" height="${placement.height}" rx="${r}" ry="${r}" fill="#fff"/>
            </svg>
          `);
          const masked = await img
            .composite([{ input: maskSvg, blend: 'dest-in' }])
            .png()
            .toBuffer();
          img = sharp(masked);
        }

        // Apply rotation if specified
        if (placement.rotation) {
          img = img.rotate(placement.rotation, {
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          });
        }

        photoBuffer = await img.png().toBuffer();
      } else {
        // Synthetic placeholder tile for testing or missing captures
        const phSvg = Buffer.from(`
          <svg width="${placement.width}" height="${placement.height}" xmlns="http://www.w3.org/2000/svg">
            <rect width="${placement.width}" height="${placement.height}" rx="${placement.borderRadius || 0}" fill="#e2e8f0"/>
            <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#64748b">
              Photo ${placement.captureIndex}
            </text>
          </svg>
        `);
        photoBuffer = await sharp(phSvg).png().toBuffer();
      }

      compositeInputs.push({
        input: photoBuffer,
        left: Math.round(placement.x),
        top: Math.round(placement.y),
      });
    }

    // 4. Process overlay layers
    const sortedOverlays = [...overlays].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
    const baseStorageDir = path.resolve('storage');
    for (const overlay of sortedOverlays) {
      // If overlay image exists on disk, draw it
      const safeLabel = path.basename(overlay.label);
      const overlayPath = path.join(baseStorageDir, safeLabel);
      if (overlayPath.startsWith(baseStorageDir) && fs.existsSync(overlayPath)) {
        let img = sharp(overlayPath).resize(overlay.width, overlay.height, {
          fit: 'contain',
        });
        if (overlay.rotation) {
          img = img.rotate(overlay.rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
        }
        const overlayBuffer = await img.png().toBuffer();
        compositeInputs.push({
          input: overlayBuffer,
          left: Math.round(overlay.x),
          top: Math.round(overlay.y),
        });
      }
    }

    // 5. Generate and embed QR code
    // Check if designated QR placement or overlay exists
    const qrOverlay = overlays.find(
      (o) => o.label.toLowerCase() === 'qr' || o.label.toLowerCase() === 'qrcode',
    );

    let qrX: number;
    let qrY: number;
    let qrSize: number;

    if (qrOverlay) {
      qrX = qrOverlay.x;
      qrY = qrOverlay.y;
      qrSize = Math.min(qrOverlay.width, qrOverlay.height);
    } else if (height > width) {
      // Portrait 1200x1800 default: bottom-right footer
      qrSize = 160;
      qrX = width - qrSize - 80;
      qrY = height - qrSize - 60;
    } else {
      // Landscape 1800x1200 default: bottom-right corner
      qrSize = 160;
      qrX = width - qrSize - 80;
      qrY = height - qrSize - 60;
    }

    const qrSvg = generateQrSvg(qrUrl, {
      size: qrSize,
      margin: 1,
      color: '#1e293b',
      background: '#ffffff',
    });

    const qrBuffer = await sharp(Buffer.from(qrSvg)).png().toBuffer();
    compositeInputs.push({
      input: qrBuffer,
      left: Math.round(qrX),
      top: Math.round(qrY),
    });

    // 6. Composite everything and set 300 DPI metadata
    const canvasBuffer = await canvas.toBuffer();
    const finalBuffer = await sharp(canvasBuffer)
      .composite(compositeInputs)
      .withMetadata({ density: 300 })
      .png()
      .toBuffer();

    return finalBuffer;
  }
}

export const photoStripRenderer = new PhotoStripRenderer();
