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

    const canvasWidth = Math.max(1, Math.round(width));
    const canvasHeight = Math.max(1, Math.round(height));

    // 1. Create base 4R canvas
    const baseColor = backgroundColor || '#ffffff';
    const canvas = sharp({
      create: {
        width: canvasWidth,
        height: canvasHeight,
        channels: 4,
        background: baseColor,
      },
    }).png();

    const compositeInputs: sharp.OverlayOptions[] = [];

    // 2. Add background asset if present
    if (backgroundPath && fs.existsSync(backgroundPath)) {
      const bgBuffer = await sharp(backgroundPath)
        .resize(canvasWidth, canvasHeight, { fit: 'cover', position: 'center' })
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
      const pWidth = Math.max(1, Math.round(placement.width));
      const pHeight = Math.max(1, Math.round(placement.height));
      const pRadius = Math.max(0, Math.round(placement.borderRadius || 0));
      const pLeft = Math.round(placement.x);
      const pTop = Math.round(placement.y);

      if (capture && fs.existsSync(capture.filePath)) {
        // Read capture original, apply centered cover crop to placement dimensions
        let img = sharp(capture.filePath).resize(pWidth, pHeight, {
          fit: 'cover',
          position: 'center',
        });

        // Apply border radius mask if specified
        if (pRadius > 0) {
          const maskSvg = Buffer.from(`
            <svg width="${pWidth}" height="${pHeight}" xmlns="http://www.w3.org/2000/svg">
              <rect x="0" y="0" width="${pWidth}" height="${pHeight}" rx="${pRadius}" ry="${pRadius}" fill="#fff"/>
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
          <svg width="${pWidth}" height="${pHeight}" xmlns="http://www.w3.org/2000/svg">
            <rect width="${pWidth}" height="${pHeight}" rx="${pRadius}" fill="#e2e8f0"/>
            <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#64748b">
              Photo ${placement.captureIndex}
            </text>
          </svg>
        `);
        photoBuffer = await sharp(phSvg).png().toBuffer();
      }

      compositeInputs.push({
        input: photoBuffer,
        left: pLeft,
        top: pTop,
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
        const oWidth = Math.max(1, Math.round(overlay.width));
        const oHeight = Math.max(1, Math.round(overlay.height));
        let img = sharp(overlayPath).resize(oWidth, oHeight, {
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
    } else if (canvasHeight > canvasWidth) {
      // Portrait 1200x1800 default: bottom-right footer
      qrSize = 160;
      qrX = canvasWidth - qrSize - 80;
      qrY = canvasHeight - qrSize - 60;
    } else {
      // Landscape 1800x1200 default: bottom-right corner
      qrSize = 160;
      qrX = canvasWidth - qrSize - 80;
      qrY = canvasHeight - qrSize - 60;
    }

    qrSize = Math.max(1, Math.round(qrSize));
    qrX = Math.round(qrX);
    qrY = Math.round(qrY);

    const qrSvg = generateQrSvg(qrUrl, {
      size: qrSize,
      margin: 1,
      color: '#1e293b',
      background: '#ffffff',
    });

    const qrBuffer = await sharp(Buffer.from(qrSvg)).png().toBuffer();
    compositeInputs.push({
      input: qrBuffer,
      left: qrX,
      top: qrY,
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
 