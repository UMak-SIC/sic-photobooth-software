import { PDFDocument } from 'pdf-lib';
import type { FrameItem } from './api';

export interface RenderGangSheetOptions {
  frame?: FrameItem | null;
  coverUrl?: string;
  allMotionFrames: string[];
  motionSheetUrl?: string | null;
}

export interface GenerateFlipbookPdfOptions {
  publicId: string;
  frame?: FrameItem | null;
  coverUrl?: string;
  allMotionFrames: string[];
  motionSheetUrl?: string | null;
  scope: 'all' | 'current';
  activeSheet: number;
  copies: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

/**
 * Draw an image with 'cover' (aspect crop / center crop) fitting inside target bounds.
 */
function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dWidth: number,
  dHeight: number
) {
  const sWidth = img.naturalWidth || img.width;
  const sHeight = img.naturalHeight || img.height;
  if (!sWidth || !sHeight) return;

  const targetRatio = dWidth / dHeight;
  const sourceRatio = sWidth / sHeight;

  let sx = 0;
  let sy = 0;
  let sw = sWidth;
  let sh = sHeight;

  if (sourceRatio > targetRatio) {
    sw = sHeight * targetRatio;
    sx = (sWidth - sw) / 2;
  } else {
    sh = sWidth / targetRatio;
    sy = (sHeight - sh) / 2;
  }

  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dWidth, dHeight);
}

/**
 * Composites a single 4R gang sheet at exact 300 DPI (1200 x 1800 px).
 */
export async function renderGangSheetToPng(
  sheetNum: number,
  options: RenderGangSheetOptions
): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 1800;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to create 2D canvas context');
  }

  // Clear white base
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 1200, 1800);

  const { frame, allMotionFrames, motionSheetUrl } = options;
  const frameName = frame?.name || 'SIC Seal';

  if (motionSheetUrl) {
    // 1. Draw Background Template Layer
    try {
      const bgImg = await loadImage(motionSheetUrl);
      ctx.drawImage(bgImg, 0, 0, 1200, 1800);
    } catch (err) {
      console.warn('Failed to load motion template background image, using fallback:', err);
    }

    // 2. Draw 4 Motion Frame Slots on the sheet
    for (let slotIdx = 0; slotIdx < 4; slotIdx++) {
      const frameNumber = (sheetNum - 1) * 4 + slotIdx + 1; // 1 to 20
      const frameSnapshot = allMotionFrames[frameNumber - 1];

      const specificP = frame?.placements?.[slotIdx];
      const p = specificP || frame?.placements?.[0];
      const slotX = specificP ? specificP.x : (p ? p.x : 290);
      const slotYInStrip = specificP ? (specificP.y % 450) : (p ? (p.y % 450) : (450 - 348.75) / 2);
      const slotW = specificP ? specificP.width : (p ? p.width : 620);
      const slotH = specificP ? specificP.height : (p ? p.height : 348.75);
      const slotY = specificP ? specificP.y : (slotIdx * 450 + slotYInStrip);

      if (frameSnapshot) {
        try {
          const snapImg = await loadImage(frameSnapshot);
          ctx.save();
          ctx.beginPath();
          ctx.rect(slotX, slotY, slotW, slotH);
          ctx.clip();
          drawImageCover(ctx, snapImg, slotX, slotY, slotW, slotH);
          ctx.restore();
        } catch {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
          ctx.fillRect(slotX, slotY, slotW, slotH);
        }
      } else {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.fillRect(slotX, slotY, slotW, slotH);
        ctx.fillStyle = '#145a49';
        ctx.font = 'bold 22px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`FRAME ${String(frameNumber).padStart(2, '0')}`, slotX + slotW / 2, slotY + slotH / 2);
      }
    }
  } else {
    // Clean Default Fallback (4 strips of 1200 x 450 px)
    for (let slotIdx = 0; slotIdx < 4; slotIdx++) {
      const frameNumber = (sheetNum - 1) * 4 + slotIdx + 1;
      const frameSnapshot = allMotionFrames[frameNumber - 1];
      const stripY = slotIdx * 450;

      // Base strip background
      ctx.fillStyle = '#c2ffe1';
      ctx.fillRect(0, stripY, 1200, 450);

      // Left Spine Branding (36% width = 432 px)
      const spineWidth = 432;
      ctx.fillStyle = '#0e473d';
      ctx.fillRect(spineWidth / 2 - 35, stripY + 120, 70, 70);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('SIC', spineWidth / 2, stripY + 155);

      ctx.fillStyle = '#145a49';
      ctx.font = 'bold 26px Arial, sans-serif';
      ctx.fillText(frameName.toUpperCase(), spineWidth / 2, stripY + 230);

      ctx.fillStyle = '#28806c';
      ctx.font = 'bold 22px monospace';
      ctx.fillText(`FRAME ${String(frameNumber).padStart(2, '0')}`, spineWidth / 2, stripY + 280);

      // Right Photo Slot (64% width = 768 px)
      const slotX = spineWidth;
      const slotY = stripY;
      const slotW = 1200 - spineWidth;
      const slotH = 450;

      if (frameSnapshot) {
        try {
          const snapImg = await loadImage(frameSnapshot);
          ctx.save();
          ctx.beginPath();
          ctx.rect(slotX, slotY, slotW, slotH);
          ctx.clip();
          drawImageCover(ctx, snapImg, slotX, slotY, slotW, slotH);
          ctx.restore();
        } catch {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
          ctx.fillRect(slotX, slotY, slotW, slotH);
        }
      } else {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.fillRect(slotX, slotY, slotW, slotH);
        ctx.fillStyle = '#145a49';
        ctx.font = 'bold 24px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`MOTION FRAME ${String(frameNumber).padStart(2, '0')}`, slotX + slotW / 2, slotY + slotH / 2);
      }
    }
  }

  return canvas.toDataURL('image/png');
}

/**
 * Generates a 300 DPI multi-page PDF (4" x 6" pages) collating requested copies.
 */
export async function generateFlipbookPdf(
  options: GenerateFlipbookPdfOptions,
  onProgress?: (current: number, total: number) => void
): Promise<{ blob: Blob; url: string; filename: string }> {
  const targetSheets = options.scope === 'all' ? [1, 2, 3, 4, 5] : [options.activeSheet];
  const uniqueSheetCount = targetSheets.length;

  // 1. Render required 300 DPI PNG gang sheets
  const pngMap = new Map<number, string>();
  for (let i = 0; i < uniqueSheetCount; i++) {
    const sheetNum = targetSheets[i];
    onProgress?.(i + 1, uniqueSheetCount);
    const pngUrl = await renderGangSheetToPng(sheetNum, {
      frame: options.frame,
      coverUrl: options.coverUrl,
      allMotionFrames: options.allMotionFrames,
      motionSheetUrl: options.motionSheetUrl,
    });
    pngMap.set(sheetNum, pngUrl);
  }

  // 2. Build multi-page PDF using pdf-lib
  const pdfDoc = await PDFDocument.create();

  // Standard 4" x 6" in PDF points (72 points per inch)
  const PAGE_WIDTH_PT = 288; // 4 in * 72 pt/in
  const PAGE_HEIGHT_PT = 432; // 6 in * 72 pt/in

  // Cache embedded PDF PNGs for efficient duplication across copies
  const embeddedPngMap = new Map<number, Awaited<ReturnType<typeof pdfDoc.embedPng>>>();
  for (const sheetNum of targetSheets) {
    const pngDataUrl = pngMap.get(sheetNum)!;
    const base64Data = pngDataUrl.split(',')[1];
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let k = 0; k < binaryString.length; k++) {
      bytes[k] = binaryString.charCodeAt(k);
    }
    const embeddedImg = await pdfDoc.embedPng(bytes);
    embeddedPngMap.set(sheetNum, embeddedImg);
  }

  // Collate copies (e.g. 2 copies of all 5 sheets = 10 pages)
  const copiesCount = Math.max(1, options.copies || 1);
  for (let c = 0; c < copiesCount; c++) {
    for (const sheetNum of targetSheets) {
      const embeddedImg = embeddedPngMap.get(sheetNum)!;
      const page = pdfDoc.addPage([PAGE_WIDTH_PT, PAGE_HEIGHT_PT]);
      page.drawImage(embeddedImg, {
        x: 0,
        y: 0,
        width: PAGE_WIDTH_PT,
        height: PAGE_HEIGHT_PT,
      });
    }
  }

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([new Uint8Array(pdfBytes).buffer as ArrayBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const scopeTag = options.scope === 'all' ? '5sheets' : `sheet${options.activeSheet}`;
  const filename = `flipbook_${options.publicId || 'export'}_4R_${scopeTag}_${copiesCount}copies.pdf`;

  return { blob, url, filename };
}

/**
 * Triggers native PDF printing using an invisible iframe.
 */
export function printPdfBlobUrl(pdfUrl: string): Promise<void> {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.src = pdfUrl;

    iframe.onload = () => {
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (e) {
          console.warn('Iframe print failed, falling back to window.open:', e);
          window.open(pdfUrl, '_blank');
        }
        resolve();
        setTimeout(() => {
          if (iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
          }
        }, 120000);
      }, 300);
    };

    document.body.appendChild(iframe);
  });
}
