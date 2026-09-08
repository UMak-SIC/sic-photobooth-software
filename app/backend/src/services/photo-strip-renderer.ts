import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { config } from '../config.js';
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
  qrUrl?: string;
  eventName?: string;
  eventDate?: string;
}

/**
 * Resolves an asset's real file path on disk across absolute paths,
 * relative paths, template URLs, and storage directory structures.
 */
function resolveAssetPath(filePath?: string | null): string | null {
  if (!filePath) return null;

  const storageDir = path.resolve(config.storageDir);

  // 1. If it is a template asset URL endpoint (e.g. /templates/:id/background or /templates/:id/overlays/:overlayId)
  const urlMatch = filePath.match(
    /^\/?templates\/([0-9a-f-]+)\/(background|cover|overlays\/([0-9a-f-]+))/i,
  );
  if (urlMatch) {
    const templateId = urlMatch[1];
    const kind = urlMatch[2];
    for (const subDir of ['templates', 'flipbook']) {
      const targetDir = path.resolve(storageDir, subDir, templateId);
      if (fs.existsSync(targetDir)) {
        const files = fs.readdirSync(targetDir);
        if (kind === 'background') {
          const bgFile = files.find((f) => f.startsWith('background'));
          if (bgFile) return path.join(targetDir, bgFile);
        } else if (kind === 'cover') {
          const covFile = files.find((f) => f.startsWith('cover'));
          if (covFile) return path.join(targetDir, covFile);
        } else if (urlMatch[3]) {
          const overlayId = urlMatch[3];
          const ovFile = files.find((f) => f.includes(overlayId) || f.startsWith('overlay'));
          if (ovFile) return path.join(targetDir, ovFile);
        }
      }
    }
  }

  // 2. Absolute path inside storage directory
  if (path.isAbsolute(filePath) && filePath.startsWith(storageDir) && fs.existsSync(filePath)) {
    return filePath;
  }

  // 3. Clean relative path inside storage directory
  const cleanPath = filePath.replace(/^\/?storage\//, '').replace(/^\//, '');
  const candidateStorage = path.resolve(storageDir, cleanPath);
  if (candidateStorage.startsWith(storageDir) && fs.existsSync(candidateStorage)) {
    return candidateStorage;
  }

  const candidateTemplates = path.resolve(
    storageDir,
    'templates',
    cleanPath.replace(/^templates\//, ''),
  );
  if (candidateTemplates.startsWith(storageDir) && fs.existsSync(candidateTemplates)) {
    return candidateTemplates;
  }

  // 4. Safe basename match directly in storage directory (prevents path traversal ../..)
  const baseName = path.basename(filePath);
  const candidateBase = path.resolve(storageDir, baseName);
  if (candidateBase.startsWith(storageDir) && fs.existsSync(candidateBase)) {
    return candidateBase;
  }

  return null;
}

export class PhotoStripRenderer {
  /**
   * Composites captured photos and overlays into a 300 DPI 4R PNG photo strip matching the template layout.
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
    } = options;

    const canvasWidth = Math.max(1, Math.round(width));
    const canvasHeight = Math.max(1, Math.round(height));

    // 1. Create base canvas
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
    const resolvedBackgroundPath = resolveAssetPath(backgroundPath);
    if (resolvedBackgroundPath && fs.existsSync(resolvedBackgroundPath)) {
      const bgBuffer = await sharp(resolvedBackgroundPath)
        .resize(canvasWidth, canvasHeight, { fit: 'cover', position: 'center' })
        .toBuffer();
      compositeInputs.push({
        input: bgBuffer,
        top: 0,
        left: 0,
      });
    }

    // 3. Prepare visual elements (Photo placements and Overlays) sorted by effective zIndex
    type CompositeTask =
      | { type: 'placement'; data: TemplatePlacement; sortKey: number }
      | { type: 'overlay'; data: TemplateOverlay; sortKey: number };

    const tasks: CompositeTask[] = [
      ...placements.map((p) => ({
        type: 'placement' as const,
        data: p,
        sortKey: (p.zIndex ?? 1) * 2,
      })),
      ...overlays.map((o) => ({
        type: 'overlay' as const,
        data: o,
        sortKey: (o.zIndex ?? 2) * 2 + 1,
      })),
    ].sort((a, b) => a.sortKey - b.sortKey);

    // 4. Render layers in order so overlays sit on top of photos
    for (const task of tasks) {
      if (task.type === 'placement') {
        const placement = task.data;
        const capture = captures.find((c) => c.captureIndex === placement.captureIndex);
        let photoBuffer: Buffer;
        const pWidth = Math.max(1, Math.round(placement.width));
        const pHeight = Math.max(1, Math.round(placement.height));
        const pRadius = Math.max(0, Math.round(placement.borderRadius || 0));
        const pLeft = Math.round(placement.x);
        const pTop = Math.round(placement.y);

        if (capture && fs.existsSync(capture.filePath)) {
          let img = sharp(capture.filePath).resize(pWidth, pHeight, {
            fit: 'cover',
            position: 'center',
          });

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

          if (placement.rotation) {
            img = img.rotate(placement.rotation, {
              background: { r: 0, g: 0, b: 0, alpha: 0 },
            });
          }

          photoBuffer = await img.png().toBuffer();
        } else {
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
      } else {
        const overlay = task.data;
        const rawOverlayPath = overlay.assetPath || overlay.path || overlay.label;
        const resolvedOverlayPath = resolveAssetPath(rawOverlayPath);

        if (resolvedOverlayPath && fs.existsSync(resolvedOverlayPath)) {
          try {
            const oWidth = Math.max(1, Math.round(overlay.width));
            const oHeight = Math.max(1, Math.round(overlay.height));
            let img = sharp(resolvedOverlayPath).resize(oWidth, oHeight, {
              fit: 'contain',
              background: { r: 0, g: 0, b: 0, alpha: 0 },
            });

            if (overlay.rotation) {
              img = img.rotate(overlay.rotation, {
                background: { r: 0, g: 0, b: 0, alpha: 0 },
              });
            }

            const overlayBuffer = await img.png().toBuffer();
            compositeInputs.push({
              input: overlayBuffer,
              left: Math.round(overlay.x),
              top: Math.round(overlay.y),
            });
          } catch {
            // Safely skip corrupted or unsupported image files
          }
        }
      }
    }

    // 5. Composite everything and set 300 DPI metadata (no embedded QR in output photo)
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
 