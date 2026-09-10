import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import QRCode from 'qrcode';
import { config } from '../config.js';
import type { TemplatePlacement, TemplateOverlay } from '../db/repository.js';

export type CutLayoutType = 'single' | 'cut_2_vertical' | 'cut_2_horizontal' | 'cut_4';

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
  cutInHalf?: boolean;
  cutLayout?: CutLayoutType;
  templateName?: string;
}

/**
 * Formats a date string or Date object to the required "yyyy. mm. dd" format (e.g. "2026. 09. 10").
 */
export function formatDateToPill(dateInput?: string | Date): string {
  if (!dateInput) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}. ${m}. ${d}`;
  }
  const dateObj = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(dateObj.getTime())) {
    return String(dateInput);
  }
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}. ${m}. ${d}`;
}

/**
 * Generates an SVG buffer for the dark capsule Date Pill.
 */
export function generateDatePillSvg(
  dateText: string,
  width: number = 140,
  height: number = 30,
  fontSize?: number,
): Buffer {
  const calculatedFontSize = fontSize ?? Math.round(height * 0.58);
  // Optical cap-height of sans-serif numerals is ~0.72x fontSize.
  // True vertical centering places baseline at (height + calculatedFontSize * 0.72) / 2.
  const baselineY = ((height + calculatedFontSize * 0.72) / 2).toFixed(1);
  const pillSvg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${width}" height="${height}" rx="${height / 2}" fill="#061715" fill-opacity="0.88" />
      <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="${(height - 1) / 2}" fill="none" stroke="#ffffff" stroke-opacity="0.25" stroke-width="1.2" />
      <text
        x="${(width / 2).toFixed(1)}"
        y="${baselineY}"
        text-anchor="middle"
        font-family="'Nunito', 'Segoe UI', Roboto, Arial, sans-serif"
        font-size="${calculatedFontSize}"
        font-weight="700"
        letter-spacing="0.6px"
        fill="#ffffff"
      >${dateText}</text>
    </svg>
  `;
  return Buffer.from(pillSvg);
}

/**
 * Generates a high-contrast QR code PNG buffer.
 */
export async function generateQrBuffer(qrUrl: string, size: number = 100): Promise<Buffer> {
  const qrBuffer = await QRCode.toBuffer(qrUrl, {
    type: 'png',
    width: size,
    margin: 1,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
    errorCorrectionLevel: 'M',
  });
  return qrBuffer;
}

/**
 * Detects whether a template layout represents:
 * - 'cut_4': 4-cut quad layout (2x2 grid)
 * - 'cut_2_vertical': 2 vertical strips (left/right split)
 * - 'cut_2_horizontal': 2 horizontal strips (top/bottom split)
 * - 'single': 1 full sheet (no cuts)
 */
export function detectCutLayout(
  width: number,
  height: number,
  placements: TemplatePlacement[],
  templateName?: string,
  explicitCutInHalf?: boolean,
  explicitCutLayout?: CutLayoutType,
): CutLayoutType {
  if (explicitCutLayout) {
    return explicitCutLayout;
  }
  if (explicitCutInHalf) {
    return 'cut_2_vertical';
  }
  if (!placements || placements.length < 2) {
    return 'single';
  }

  const name = (templateName || '').toLowerCase();
  const midX = width / 2;
  const midY = height / 2;

  // 1. Partition capture indices into quadrants and halves based on slot centers
  const q1Indices = new Set<number>(); // Top-Left
  const q2Indices = new Set<number>(); // Top-Right
  const q3Indices = new Set<number>(); // Bottom-Left
  const q4Indices = new Set<number>(); // Bottom-Right

  const leftIndices = new Set<number>();
  const rightIndices = new Set<number>();
  const topIndices = new Set<number>();
  const bottomIndices = new Set<number>();

  for (const p of placements) {
    const idx = p.captureIndex;
    const cx = p.x + p.width / 2;
    const cy = p.y + p.height / 2;

    if (cx < midX) {
      leftIndices.add(idx);
    } else {
      rightIndices.add(idx);
    }

    if (cy < midY) {
      topIndices.add(idx);
    } else {
      bottomIndices.add(idx);
    }

    if (cx < midX && cy < midY) q1Indices.add(idx);
    else if (cx >= midX && cy < midY) q2Indices.add(idx);
    else if (cx < midX && cy >= midY) q3Indices.add(idx);
    else if (cx >= midX && cy >= midY) q4Indices.add(idx);
  }

  // 2. Check for 4-Cut Quad (capture index 1 repeats in all 4 quadrants, or explicit 4-cut name)
  const hasCapture1InAll4Quadrants =
    q1Indices.has(1) && q2Indices.has(1) && q3Indices.has(1) && q4Indices.has(1);
  const isQuadByName = /\b(4[- ]?cut|quad[- ]?cut|2x2[- ]?cut|four[- ]?cut)\b/i.test(name);

  if (hasCapture1InAll4Quadrants || (isQuadByName && placements.length >= 4)) {
    return 'cut_4';
  }

  // Helper to check set equality
  const setsEqual = (a: Set<number>, b: Set<number>) =>
    a.size > 0 && a.size === b.size && [...a].every((val) => b.has(val));

  // 3. Check for Vertical Cut (Left and Right columns contain matching duplicate capture sets)
  const isVerticalByName = /\b(2x6|double[- ]?strip|vertical|dual[- ]?strip|2[- ]?strip)\b/i.test(name);
  if (setsEqual(leftIndices, rightIndices) || (isVerticalByName && leftIndices.size > 0 && rightIndices.size > 0)) {
    return 'cut_2_vertical';
  }

  // 4. Check for Horizontal Cut (Top and Bottom halves contain matching duplicate capture sets)
  const isHorizontalByName = /\b(horizontal[- ]?cut|top[- ]?bottom[- ]?cut|2[- ]?cut[- ]?h|h[- ]?split)\b/i.test(name);
  if (setsEqual(topIndices, bottomIndices) || (isHorizontalByName && topIndices.size > 0 && bottomIndices.size > 0)) {
    return 'cut_2_horizontal';
  }

  // 5. If all captures on sheet are unique or no duplicate column/row split exists -> Single Sheet
  return 'single';
}

/**
 * Detects whether a template layout represents a dual strip cut in half.
 */
export function isDualStripLayout(
  width: number,
  height: number,
  placements: TemplatePlacement[],
  explicitCutInHalf?: boolean,
): boolean {
  const layout = detectCutLayout(width, height, placements, undefined, explicitCutInHalf);
  return layout === 'cut_2_vertical';
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
   * Includes the QR code and Date Pill vertically stacked in the bottom right corner of each strip.
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
      publicId,
      qrUrl = `https://myphotobooth.com/${publicId}`,
      eventDate,
      cutInHalf,
      cutLayout,
      templateName,
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

    // 5. Add QR Code and Date Pill according to Cut Layout
    const formattedDate = formatDateToPill(eventDate);
    const layout = detectCutLayout(
      canvasWidth,
      canvasHeight,
      placements,
      templateName,
      cutInHalf,
      cutLayout,
    );

    const midX = canvasWidth / 2;
    const midY = canvasHeight / 2;

    if (layout === 'cut_4') {
      // 4-Cut Quadrants (2x2 grid)
      const qrSize = 75;
      const pillHeight = 24;
      const pillWidth = 105;
      const spacing = 3;
      const margin = 20;
      const totalStackHeight = qrSize + spacing + pillHeight;

      const qrBuffer = await generateQrBuffer(qrUrl, qrSize);
      const datePillBuffer = generateDatePillSvg(formattedDate, pillWidth, pillHeight, 14);

      // 4 Quadrants: [rightEdge, bottomEdge]
      const quadrants = [
        { right: Math.round(midX - margin), bottom: Math.round(midY - margin) }, // Top-Left (Q1)
        { right: Math.round(canvasWidth - margin), bottom: Math.round(midY - margin) }, // Top-Right (Q2)
        { right: Math.round(midX - margin), bottom: Math.round(canvasHeight - margin) }, // Bottom-Left (Q3)
        { right: Math.round(canvasWidth - margin), bottom: Math.round(canvasHeight - margin) }, // Bottom-Right (Q4)
      ];

      for (const q of quadrants) {
        const pillLeft = q.right - pillWidth;
        const qrLeft = pillLeft + Math.round((pillWidth - qrSize) / 2);
        const qrTop = q.bottom - totalStackHeight;
        const pillTop = qrTop + qrSize + spacing;

        compositeInputs.push({ input: qrBuffer, left: qrLeft, top: qrTop });
        compositeInputs.push({ input: datePillBuffer, left: pillLeft, top: pillTop });
      }
    } else if (layout === 'cut_2_horizontal') {
      // 2-Cut Horizontal (Top/Bottom split)
      const qrSize = 100;
      const pillHeight = 30;
      const pillWidth = 140;
      const spacing = 4;
      const margin = 30;
      const totalStackHeight = qrSize + spacing + pillHeight;

      const qrBuffer = await generateQrBuffer(qrUrl, qrSize);
      const datePillBuffer = generateDatePillSvg(formattedDate, pillWidth, pillHeight);

      const halves = [
        { right: Math.round(canvasWidth - margin), bottom: Math.round(midY - margin) }, // Top Half
        { right: Math.round(canvasWidth - margin), bottom: Math.round(canvasHeight - margin) }, // Bottom Half
      ];

      for (const h of halves) {
        const pillLeft = h.right - pillWidth;
        const qrLeft = pillLeft + Math.round((pillWidth - qrSize) / 2);
        const qrTop = h.bottom - totalStackHeight;
        const pillTop = qrTop + qrSize + spacing;

        compositeInputs.push({ input: qrBuffer, left: qrLeft, top: qrTop });
        compositeInputs.push({ input: datePillBuffer, left: pillLeft, top: pillTop });
      }
    } else if (layout === 'cut_2_vertical') {
      // 2-Cut Vertical (Left/Right split, 2x6 strips)
      const qrSize = 110;
      const pillHeight = 30;
      const pillWidth = 140;
      const spacing = 4;
      const margin = 30;
      const totalStackHeight = qrSize + spacing + pillHeight;

      const qrBuffer = await generateQrBuffer(qrUrl, qrSize);
      const datePillBuffer = generateDatePillSvg(formattedDate, pillWidth, pillHeight);

      const strips = [
        { right: Math.round(midX - margin), bottom: Math.round(canvasHeight - margin) }, // Left Strip
        { right: Math.round(canvasWidth - margin), bottom: Math.round(canvasHeight - margin) }, // Right Strip
      ];

      for (const s of strips) {
        const pillLeft = s.right - pillWidth;
        const qrLeft = pillLeft + Math.round((pillWidth - qrSize) / 2);
        const qrTop = s.bottom - totalStackHeight;
        const pillTop = qrTop + qrSize + spacing;

        compositeInputs.push({ input: qrBuffer, left: qrLeft, top: qrTop });
        compositeInputs.push({ input: datePillBuffer, left: pillLeft, top: pillTop });
      }
    } else {
      // Single Strip / Standard Layout
      const qrSize = 130;
      const pillHeight = 34;
      const pillWidth = 160;
      const spacing = 4;
      const margin = 35;
      const totalStackHeight = qrSize + spacing + pillHeight;

      const qrBuffer = await generateQrBuffer(qrUrl, qrSize);
      const datePillBuffer = generateDatePillSvg(formattedDate, pillWidth, pillHeight);

      const pillLeft = Math.round(canvasWidth - margin - pillWidth);
      const qrLeft = pillLeft + Math.round((pillWidth - qrSize) / 2);
      const qrTop = Math.round(canvasHeight - totalStackHeight - margin);
      const pillTop = qrTop + qrSize + spacing;

      compositeInputs.push({ input: qrBuffer, left: qrLeft, top: qrTop });
      compositeInputs.push({ input: datePillBuffer, left: pillLeft, top: pillTop });
    }

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
 