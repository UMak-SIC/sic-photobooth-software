import React, { useState, useEffect, useRef } from 'react';
import type { FrameItem } from '../../services/api';
import {
  generateFlipbookPdf,
  printPdfBlobUrl,
} from '../../services/flipbook-pdf';

interface FlipbookPrintModalProps {
  publicId: string;
  coverUrl?: string;
  videoUrl?: string;
  motionFrames?: string[];
  frame?: FrameItem | null;
  onPrintConfirmed: (copies: number) => Promise<void>;
  onClose: () => void;
}

export const FlipbookPrintModal: React.FC<FlipbookPrintModalProps> = ({
  publicId,
  coverUrl,
  videoUrl,
  motionFrames,
  frame,
  onPrintConfirmed,
  onClose,
}) => {
  const [copies, setCopies] = useState<number>(1);
  const [printScope, setPrintScope] = useState<'all' | 'current'>('all');
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [hasPrinted, setHasPrinted] = useState<boolean>(false);
  const [activeSheet, setActiveSheet] = useState<number>(1);
  const [frameSnapshots, setFrameSnapshots] = useState<string[]>(motionFrames || []);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    // If pre-captured motion frames are already provided from recording, use them directly
    if (motionFrames && motionFrames.length > 0) {
      setFrameSnapshots(motionFrames);
      return;
    }

    if (!videoUrl) return;

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = videoUrl;

    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');

    const extractFrames = async () => {
      // Wait for video metadata/data to be loaded
      await new Promise<void>((resolve, reject) => {
        const onLoaded = () => {
          cleanup();
          resolve();
        };
        const onError = (e: Event) => {
          cleanup();
          reject(e);
        };
        const cleanup = () => {
          video.removeEventListener('loadeddata', onLoaded);
          video.removeEventListener('canplay', onLoaded);
          video.removeEventListener('error', onError);
        };

        if (video.readyState >= 2) {
          resolve();
        } else {
          video.addEventListener('loadeddata', onLoaded);
          video.addEventListener('canplay', onLoaded);
          video.addEventListener('error', onError);
          video.load();
        }
      });

      if (!ctx) return;

      const totalFrames = 19;
      const extracted: string[] = [];

      // Aspect crop helper (16:9 ratio)
      const drawCroppedVideo = () => {
        const vWidth = video.videoWidth > 0 ? video.videoWidth : 1280;
        const vHeight = video.videoHeight > 0 ? video.videoHeight : 720;
        const targetRatio = 16 / 9;
        const sourceRatio = vWidth / vHeight;

        let sx = 0;
        let sy = 0;
        let sw = vWidth;
        let sh = vHeight;

        if (sourceRatio > targetRatio) {
          sw = vHeight * targetRatio;
          sx = (vWidth - sw) / 2;
        } else {
          sh = vWidth / targetRatio;
          sy = (vHeight - sh) / 2;
        }

        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      };

      const rawDur = video.duration;
      const hasFiniteDuration = typeof rawDur === 'number' && Number.isFinite(rawDur) && rawDur > 0;
      const duration = hasFiniteDuration ? rawDur : 5.0;

      for (let i = 1; i <= totalFrames; i++) {
        const calculated = ((i - 0.5) / totalFrames) * duration;
        const targetTime = Number.isFinite(calculated)
          ? Math.max(0.01, Math.min(duration - 0.05, calculated))
          : (i - 0.5) * 0.25;

        await new Promise<void>((resolve) => {
          let resolved = false;

          const timeout = setTimeout(() => {
            if (!resolved) {
              resolved = true;
              video.removeEventListener('seeked', onSeeked);
              try {
                drawCroppedVideo();
                extracted.push(canvas.toDataURL('image/jpeg', 0.95));
              } catch {
                // ignore
              }
              resolve();
            }
          }, 350);

          const onSeeked = () => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              video.removeEventListener('seeked', onSeeked);
              try {
                drawCroppedVideo();
                extracted.push(canvas.toDataURL('image/jpeg', 0.95));
              } catch {
                // ignore
              }
              resolve();
            }
          };

          video.addEventListener('seeked', onSeeked);

          try {
            // Only set currentTime if duration is finite and seekable
            if (hasFiniteDuration && Number.isFinite(targetTime)) {
              video.currentTime = targetTime;
            } else {
              // For non-indexed streams, draw the current video frame without throwing
              drawCroppedVideo();
              extracted.push(canvas.toDataURL('image/jpeg', 0.95));
              clearTimeout(timeout);
              video.removeEventListener('seeked', onSeeked);
              resolve();
            }
          } catch {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              resolve();
            }
          }
        });
      }

      if (isMountedRef.current && extracted.length > 0) {
        setFrameSnapshots(extracted);
      }
    };

    extractFrames().catch(() => {
      // safe fallback
    });

    return () => {
      isMountedRef.current = false;
    };
  }, [videoUrl, motionFrames]);

  const frameName = frame?.name || 'SIC Seal';
  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const resolveAssetUrl = (p: string | null | undefined) => {
    if (!p) return null;
    return p.startsWith('http') ? p : `${API_BASE_URL}${p}`;
  };

  const motionSheetUrl = resolveAssetUrl(frame?.backgroundPath);

  // Total 20 frames: Frame 01 (Cover Photo) + Frames 02-20 (19 Motion Frames)
  const allMotionFrames = coverUrl
    ? [coverUrl, ...frameSnapshots.slice(0, 19)]
    : frameSnapshots;

  const getSheetSlotStyle = (slotIdx: number) => {
    const specificP = frame?.placements?.[slotIdx];
    if (specificP) {
      return {
        left: `${(specificP.x / 1200) * 100}%`,
        top: `${(specificP.y / 1800) * 100}%`,
        width: `${(specificP.width / 1200) * 100}%`,
        height: `${(specificP.height / 1800) * 100}%`,
      };
    }

    const p = frame?.placements?.[0];
    const slotX = p ? p.x : 290;
    const slotYInStrip = p ? (p.y % 450) : (450 - 348.75) / 2;
    const slotW = p ? p.width : 620;
    const slotH = p ? p.height : 348.75;
    const totalY = slotIdx * 450 + slotYInStrip;

    return {
      left: `${(slotX / 1200) * 100}%`,
      top: `${(totalY / 1800) * 100}%`,
      width: `${(slotW / 1200) * 100}%`,
      height: `${(slotH / 1800) * 100}%`,
    };
  };

  const sheetTabs = [
    { num: 1, label: 'Sheet 1 · Frames 01–04' },
    { num: 2, label: 'Sheet 2 · Frames 05–08' },
    { num: 3, label: 'Sheet 3 · Frames 09–12' },
    { num: 4, label: 'Sheet 4 · Frames 13–16' },
    { num: 5, label: 'Sheet 5 · Frames 17–20' },
  ];

  // Helper to render UI preview of active sheet
  const renderGangSheetContent = (sheetNum: number) => {
    if (motionSheetUrl) {
      return (
        <div
          className="relative overflow-hidden m-0 p-0"
          style={{ width: '100%', height: '100%', position: 'relative' }}
        >
          {/* Full 4R Motion Sheet Base Layer */}
          <img
            src={motionSheetUrl}
            alt="Motion Sheet Frame"
            className="absolute inset-0 pointer-events-none z-0 m-0 p-0 border-0"
            style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block' }}
          />
          {[0, 1, 2, 3].map((slotIdx) => {
            const frameNumber = (sheetNum - 1) * 4 + slotIdx + 1; // 1 to 20
            const frameSnapshot = allMotionFrames[frameNumber - 1];
            return (
              <div
                key={slotIdx}
                className="absolute rounded-none overflow-hidden bg-black/20 z-10 m-0 p-0 border-0 shadow-none"
                style={getSheetSlotStyle(slotIdx)}
              >
                {frameSnapshot ? (
                  <img
                    src={frameSnapshot}
                    alt={`Motion Frame ${frameNumber}`}
                    className="m-0 p-0 border-0"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                ) : (
                  <div
                    className="flex flex-col items-center justify-center font-mono text-[7px] font-bold text-[#145a49]"
                    style={{ width: '100%', height: '100%' }}
                  >
                    <span>FRAME {String(frameNumber).padStart(2, '0')}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    // Default Clean Fallback Layout (4 horizontal strips)
    return (
      <div
        className="flex flex-col m-0 p-0 border-0"
        style={{ width: '100%', height: '100%' }}
      >
        {[0, 1, 2, 3].map((slotIdx) => {
          const frameNumber = (sheetNum - 1) * 4 + slotIdx + 1; // 1 to 20
          const frameSnapshot = allMotionFrames[frameNumber - 1];

          return (
            <div
              key={slotIdx}
              className="relative bg-[#c2ffe1] overflow-hidden flex items-center justify-between m-0 p-0 border-0"
              style={{ width: '100%', height: '25%' }}
            >
              {/* Left Spine Branding */}
              <div
                className="flex flex-col items-center justify-center p-2 text-center"
                style={{ width: '36%', height: '100%' }}
              >
                <div className="size-5 rounded-none bg-[#0e473d] text-[8px] text-white flex items-center justify-center font-bold">
                  SIC
                </div>
                <span className="font-bold uppercase text-[8px] text-[#145a49] mt-0.5 truncate max-w-full">
                  {frameName}
                </span>
                <span className="text-[7px] text-[#28806c] font-mono font-bold">
                  FRAME {String(frameNumber).padStart(2, '0')}
                </span>
              </div>

              {/* Right Slot: Individual Static Frame Snapshot */}
              <div
                className="rounded-none overflow-hidden bg-black/20 relative m-0 p-0 border-0"
                style={{ width: '64%', height: '100%' }}
              >
                {frameSnapshot ? (
                  <img
                    src={frameSnapshot}
                    alt={`Motion Frame ${frameNumber}`}
                    className="m-0 p-0 border-0"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                ) : (
                  <div
                    className="flex flex-col items-center justify-center font-mono text-[8px] font-bold text-[#145a49] bg-black/10"
                    style={{ width: '100%', height: '100%' }}
                  >
                    <span>MOTION FRAME {String(frameNumber).padStart(2, '0')}</span>
                    <span className="text-[7px] opacity-70">Loading snapshot...</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Generate 300 DPI PDF and Trigger Native PDF Printing
  const handlePrintPdf = async () => {
    setIsPrinting(true);
    setProgressText('Rendering 300 DPI PNGs...');
    try {
      const { url } = await generateFlipbookPdf(
        {
          publicId,
          frame,
          coverUrl,
          allMotionFrames,
          motionSheetUrl,
          scope: printScope,
          activeSheet,
          copies,
        },
        (curr, total) => {
          setProgressText(`Rendering 300 DPI PNGs (${curr}/${total})...`);
        }
      );

      setProgressText('Opening PDF print dialog...');
      await printPdfBlobUrl(url);
      await onPrintConfirmed(copies);
      setHasPrinted(true);
    } catch (err) {
      console.error('PDF generation or printing failed:', err);
    } finally {
      setIsPrinting(false);
      setProgressText(null);
    }
  };

  // Generate 300 DPI PDF and Trigger Direct Download
  const handleDownloadPdf = async () => {
    setIsDownloading(true);
    setProgressText('Rendering 300 DPI PNGs for download...');
    try {
      const { url, filename } = await generateFlipbookPdf(
        {
          publicId,
          frame,
          coverUrl,
          allMotionFrames,
          motionSheetUrl,
          scope: printScope,
          activeSheet,
          copies,
        },
        (curr, total) => {
          setProgressText(`Rendering 300 DPI PNGs (${curr}/${total})...`);
        }
      );

      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('PDF download failed:', err);
    } finally {
      setIsDownloading(false);
      setProgressText(null);
    }
  };

  const isBusy = isPrinting || isDownloading;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 md:p-6">
      <div className="bg-[#071d1a] border border-white/15 rounded-3xl max-w-4xl w-full p-6 md:p-8 shadow-2xl flex flex-col text-white max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-[#a8f3dd] uppercase tracking-wider">
                PRINT HANDOFF · 300 DPI 4R (4&quot; × 6&quot;) PDF GANG SHEETS
              </span>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-mono text-[#a8f3dd]">
                {publicId}
              </span>
            </div>
            <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight mt-1">
              Flipbook Print Layout
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="rounded-full bg-white/10 hover:bg-white/20 p-2 text-white transition cursor-pointer disabled:opacity-50"
          >
            <svg className="size-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content Info */}
        <p className="mt-4 text-xs text-[#a8f3dd]/80">
          Renders 300 DPI PNG gang sheets (1200 × 1800 px) packaged into a multi-page 4R PDF with 0 margins. <strong>Sheets 1–5</strong> contain the 20 individual motion frames (Frame 01 Cover Photo + 19 Video Frames). Front &amp; Back covers are excluded.
        </p>

        {/* Sheet Selector Tabs */}
        <div className="mt-4 flex flex-wrap gap-2">
          {sheetTabs.map((tab) => (
            <button
              key={tab.num}
              type="button"
              onClick={() => setActiveSheet(tab.num)}
              className={`rounded-none px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                activeSheet === tab.num
                  ? 'bg-[#146a56] text-white ring-2 ring-[#a8f3dd]/60'
                  : 'bg-white/10 text-white/70 hover:bg-white/15'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 4R (4" x 6") Sheet Preview (Aspect ratio 2:3 vertically, 0 gap, 4 strips of 4"x1.5") */}
        <div className="my-5 flex items-center justify-center bg-black/40 p-4 rounded-none relative">
          <div className="w-full max-w-[400px] aspect-[2/3] bg-[#ecfff8] rounded-none p-0 shadow-2xl flex flex-col justify-between overflow-hidden text-[#113b33] border border-white/20 relative">
            {renderGangSheetContent(activeSheet)}
          </div>
        </div>

        {/* Progress feedback */}
        {progressText && (
          <div className="mb-3 flex items-center justify-center gap-2 text-xs font-mono font-bold text-[#a8f3dd] bg-white/5 py-2 px-3 rounded-lg border border-white/10 animate-pulse">
            <svg className="size-4 animate-spin text-[#a8f3dd]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>{progressText}</span>
          </div>
        )}

        {/* Controls: Scope Selector, Copies & Action Buttons */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-t border-white/10 pt-4">
          <div className="flex flex-wrap items-center gap-4">
            {/* Print Scope Toggle */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#a8f3dd]">Scope:</span>
              <div className="flex items-center rounded-lg border border-white/20 overflow-hidden bg-black/40 text-xs">
                <button
                  type="button"
                  onClick={() => setPrintScope('all')}
                  className={`px-3 py-1.5 font-bold transition cursor-pointer ${
                    printScope === 'all'
                      ? 'bg-[#146a56] text-white'
                      : 'text-white/70 hover:bg-white/10'
                  }`}
                >
                  All Sheets (1–5)
                </button>
                <button
                  type="button"
                  onClick={() => setPrintScope('current')}
                  className={`px-3 py-1.5 font-bold transition cursor-pointer ${
                    printScope === 'current'
                      ? 'bg-[#146a56] text-white'
                      : 'text-white/70 hover:bg-white/10'
                  }`}
                >
                  Sheet {activeSheet} Only
                </button>
              </div>
            </div>

            {/* Copies Counter */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#a8f3dd]">Copies:</span>
              <div className="flex items-center border border-white/20 rounded-lg overflow-hidden bg-black/40">
                <button
                  type="button"
                  onClick={() => setCopies((c) => Math.max(1, c - 1))}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white font-bold transition cursor-pointer"
                >
                  -
                </button>
                <span className="px-4 py-1.5 text-white font-mono font-bold text-sm">{copies}</span>
                <button
                  type="button"
                  onClick={() => setCopies((c) => Math.min(10, c + 1))}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white font-bold transition cursor-pointer"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* Download PDF Button */}
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isBusy}
              className="px-4 py-3 bg-white/10 hover:bg-white/20 disabled:bg-gray-700 text-white font-bold text-sm rounded-xl transition cursor-pointer flex items-center gap-2"
            >
              <svg className="size-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              <span>Download PDF</span>
            </button>

            {/* Print PDF Button */}
            <button
              type="button"
              onClick={handlePrintPdf}
              disabled={isBusy}
              className="flex-1 md:flex-none px-6 py-3 bg-[#a8f3dd] hover:bg-[#91ebd2] disabled:bg-gray-600 text-[#071d1a] font-black text-sm uppercase tracking-wider rounded-xl transition shadow-lg cursor-pointer active:scale-98 flex items-center justify-center gap-2"
            >
              <svg className="size-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24-1.04-.37-2.12-.37-3.229 0-4.418 3.582-8 8-8s8 3.582 8 8c0 1.109-.13 2.189-.37 3.229M3.75 19.5h16.5m-16.5-6h16.5M6 19.5v3h12v-3" />
              </svg>
              <span>
                {isPrinting
                  ? 'Preparing PDF...'
                  : hasPrinted
                  ? 'Print Again'
                  : printScope === 'all'
                  ? `Print 5-Page PDF (${copies * 5} pgs)`
                  : `Print Sheet ${activeSheet} PDF (${copies} pgs)`}
              </span>
            </button>

            <button
              type="button"
              onClick={onClose}
              disabled={isBusy}
              className="px-5 py-3 bg-white/10 hover:bg-white/15 text-white font-bold text-sm rounded-xl transition cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

