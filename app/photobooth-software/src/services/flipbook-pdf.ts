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
  const slotsPerSheet = frame?.placements && frame.placements.length > 0 ? frame.placements.length : 4;

  if (motionSheetUrl) {
    // 1. Draw Background Template Layer
    try {
      const bgImg = await loadImage(motionSheetUrl);
      ctx.drawImage(bgImg, 0, 0, 1200, 1800);
    } catch (err) {
      console.warn('Failed to load motion template background image, using fallback:', err);
    }

    // 2. Draw Motion Frame Slots on the sheet
    const maxFrames = options.allMotionFrames?.length || 16;
    for (let slotIdx = 0; slotIdx < slotsPerSheet; slotIdx++) {
      const frameNumber = (sheetNum - 1) * slotsPerSheet + slotIdx + 1; // 1 to 16
      if (frameNumber > maxFrames) {
        // Trailing slots left empty with clean template background per contract
        continue;
      }

      const frameSnapshot = allMotionFrames[frameNumber - 1];

      const specificP = frame?.placements?.[slotIdx];
      const p = specificP || frame?.placements?.[0];
      const stripHeight = 1800 / slotsPerSheet;
      const slotX = specificP ? specificP.x : (p ? p.x : 290);
      const slotYInStrip = specificP
        ? (specificP.y % stripHeight)
        : (p ? (p.y % stripHeight) : (stripHeight - 348.75) / 2);
      const slotW = specificP ? specificP.width : (p ? p.width : 620);
      const slotH = specificP ? specificP.height : (p ? p.height : 348.75);
      const slotY = specificP ? specificP.y : (slotIdx * stripHeight + slotYInStrip);

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
    // Clean Default Fallback
    const stripHeight = 1800 / slotsPerSheet;
    const maxFrames = options.allMotionFrames?.length || 16;
    for (let slotIdx = 0; slotIdx < slotsPerSheet; slotIdx++) {
      const frameNumber = (sheetNum - 1) * slotsPerSheet + slotIdx + 1;
      if (frameNumber > maxFrames) {
        continue;
      }

      const frameSnapshot = allMotionFrames[frameNumber - 1];
      const stripY = slotIdx * stripHeight;

      // Base strip background
      ctx.fillStyle = '#c2ffe1';
      ctx.fillRect(0, stripY, 1200, stripHeight);

      // Left Spine Branding (36% width = 432 px)
      const spineWidth = 432;
      ctx.fillStyle = '#0e473d';
      ctx.fillRect(spineWidth / 2 - 35, stripY + Math.max(10, (stripHeight - 70) / 2), 70, 70);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('SIC', spineWidth / 2, stripY + Math.max(10, (stripHeight - 70) / 2) + 35);

      ctx.fillStyle = '#145a49';
      ctx.font = 'bold 24px Arial, sans-serif';
      ctx.fillText(frameName.toUpperCase(), spineWidth / 2, stripY + stripHeight - 40);

      ctx.fillStyle = '#28806c';
      ctx.font = 'bold 20px monospace';
      ctx.fillText(`FRAME ${String(frameNumber).padStart(2, '0')}`, spineWidth / 2, stripY + stripHeight - 15);

      // Right Photo Slot (64% width = 768 px)
      const slotX = spineWidth;
      const slotY = stripY;
      const slotW = 1200 - spineWidth;
      const slotH = stripHeight;

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
  const slotsPerSheet = options.frame?.placements && options.frame.placements.length > 0
    ? options.frame.placements.length
    : 4;
  const totalSheets = Math.ceil((options.allMotionFrames?.length || 16) / slotsPerSheet);
  const targetSheets = options.scope === 'all'
    ? Array.from({ length: totalSheets }, (_, i) => i + 1)
    : [options.activeSheet];
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
  const scopeTag = options.scope === 'all' ? `${totalSheets}sheets` : `sheet${options.activeSheet}`;
  const filename = `flipbook_${options.publicId || 'export'}_4R_${scopeTag}_${copiesCount}copies.pdf`;

  return { blob, url, filename };
}

/**
 * Generates a 300 DPI 4R (4" x 6" / 6" x 4") PDF for Photo Strips with zero margins.
 */
export async function generatePhotoStripPdf(
  imageUrl: string,
  publicId: string,
  copies: number = 1
): Promise<{ blob: Blob; url: string; filename: string }> {
  const response = await fetch(imageUrl);
  const imageBytes = await response.arrayBuffer();

  const pdfDoc = await PDFDocument.create();

  // Load image to detect natural orientation
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = (e) => reject(e);
    img.src = imageUrl;
  });

  const isLandscape = (img.naturalWidth || img.width) > (img.naturalHeight || img.height);
  const PAGE_WIDTH_PT = isLandscape ? 432 : 288; // 6" or 4" * 72 pt
  const PAGE_HEIGHT_PT = isLandscape ? 288 : 432; // 4" or 6" * 72 pt

  let embeddedImg;
  try {
    embeddedImg = await pdfDoc.embedPng(imageBytes);
  } catch {
    embeddedImg = await pdfDoc.embedJpg(imageBytes);
  }

  const copiesCount = Math.max(1, copies || 1);
  for (let c = 0; c < copiesCount; c++) {
    const page = pdfDoc.addPage([PAGE_WIDTH_PT, PAGE_HEIGHT_PT]);
    page.drawImage(embeddedImg, {
      x: 0,
      y: 0,
      width: PAGE_WIDTH_PT,
      height: PAGE_HEIGHT_PT,
    });
  }

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([new Uint8Array(pdfBytes).buffer as ArrayBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const filename = `photostrip_${publicId}_4R_${copiesCount}copies.pdf`;

  return { blob, url, filename };
}

/**
 * Uploads a generated PDF blob to the backend storage endpoint.
 */
export async function uploadPdfBlob(
  uploadUrl: string,
  pdfBlob: Blob,
  filename: string = 'output.pdf'
): Promise<boolean> {
  try {
    const formData = new FormData();
    formData.append('file', pdfBlob, filename);
    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
    });
    return response.ok;
  } catch (err) {
    console.warn('Failed to upload PDF blob to storage:', err);
    return false;
  }
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
