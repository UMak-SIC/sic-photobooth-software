import React, { useState } from 'react';
import { resolveAssetUrl } from '../../services/api';

export interface ReviewPlacement {
  id?: string;
  captureIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  borderRadius?: number;
  rotation?: number;
  zIndex?: number;
}

export interface ReviewOverlay {
  id?: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  zIndex?: number;
  path?: string | null;
  assetPath?: string | null;
}

export interface ReviewTemplate {
  id: string;
  name: string;
  orientation: 'landscape' | 'portrait';
  outputWidth: number;
  outputHeight: number;
  countdownSeconds?: 3 | 5 | 10;
  requiredCaptureCount?: number;
  backgroundPath?: string | null;
  background?: { x: number; y: number; width: number; height: number };
  overlays?: ReviewOverlay[];
  placements: ReviewPlacement[];
}

export interface PhotoStripReviewProps {
  template?: ReviewTemplate;
  captures?: Array<{ captureIndex: number; dataUrl: string }>;
  retakeCount?: number;
  isConfirming?: boolean;
  errorMessage?: string | null;
  preview?: boolean;
  onRetake?: (captureIndex: number) => void;
  onConfirm?: () => void;
}

export const PhotoStripReview: React.FC<PhotoStripReviewProps> = ({
  template,
  captures = [],
  retakeCount = 0,
  isConfirming = false,
  errorMessage,
  preview = false,
  onRetake,
  onConfirm,
}) => {
  const [selectedForRetake, setSelectedForRetake] = useState<number | null>(preview ? 3 : null);
  const maxRetakes = 4;
  const remainingRetakes = Math.max(0, maxRetakes - retakeCount);
  const canRetake = remainingRetakes > 0;

  const handleSlotClick = (captureIndex: number) => {
    if (preview || !canRetake) return;
    setSelectedForRetake((prev) => (prev === captureIndex ? null : captureIndex));
  };

  const handleRetakeClick = () => {
    if (selectedForRetake && onRetake && canRetake) {
      onRetake(selectedForRetake);
    }
  };

  const outputWidth = template?.outputWidth || 1200;
  const outputHeight = template?.outputHeight || 1800;
  const isLandscape = (template?.orientation || (outputWidth > outputHeight ? 'landscape' : 'portrait')) === 'landscape';

  const placements = template?.placements && template.placements.length > 0 ? template.placements : [
    { captureIndex: 1, x: 100, y: 120, width: 1000, height: 440, borderRadius: 8, zIndex: 1 },
    { captureIndex: 2, x: 100, y: 600, width: 1000, height: 440, borderRadius: 8, zIndex: 1 },
    { captureIndex: 3, x: 100, y: 1080, width: 1000, height: 440, borderRadius: 8, zIndex: 1 },
  ];

  const backgroundUrl = resolveAssetUrl(template?.backgroundPath ?? null);

  return (
    <div className="artboard relative flex h-full min-h-[780px] w-full items-center justify-center gap-12 overflow-hidden bg-[#ecfff8] px-14 py-10 text-[#113b33]">
      <div className="flex flex-col items-center">
        <div className="w-full text-left">
          <p className="text-[13px] font-bold tracking-[0.14em] text-[#28806c]">PHOTO STRIP REVIEW</p>
          <h4 className="mt-2 text-[42px] font-black tracking-[-0.06em]">Keep the good ones.</h4>

          {errorMessage && (
            <div className="mt-3 rounded-lg bg-red-100 border border-red-300 px-4 py-2 text-xs font-semibold text-red-800 max-w-lg">
              {errorMessage}
            </div>
          )}
        </div>

        {preview ? (
          <div className="review-strip mt-7">
            <div className="review-image a rounded-lg overflow-hidden" />
            <div className="review-image b rounded-lg overflow-hidden" />
            <div className="review-image c retaking rounded-lg overflow-hidden" />
          </div>
        ) : (
          <div
            className="relative mt-6 rounded-2xl shadow-xl overflow-hidden border-4 border-[#0e473d] bg-[#0c3930]"
            style={{
              aspectRatio: `${outputWidth} / ${outputHeight}`,
              width: isLandscape ? '480px' : '310px',
              maxWidth: '100%',
            }}
          >
            {/* Template Background */}
            {backgroundUrl && (
              <img
                src={backgroundUrl}
                alt=""
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
                className="absolute pointer-events-none object-cover"
                style={
                  template?.background
                    ? {
                        left: `${(template.background.x / outputWidth) * 100}%`,
                        top: `${(template.background.y / outputHeight) * 100}%`,
                        width: `${(template.background.width / outputWidth) * 100}%`,
                        height: `${(template.background.height / outputHeight) * 100}%`,
                      }
                    : { inset: 0, width: '100%', height: '100%' }
                }
              />
            )}

            {/* Overlays */}
            {template?.overlays?.map((overlay, idx) => {
              const overlayUrl = resolveAssetUrl(overlay.path || overlay.assetPath || null);
              if (!overlayUrl) return null;
              return (
                <img
                  key={overlay.id || idx}
                  src={overlayUrl}
                  alt=""
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                  className="absolute pointer-events-none object-contain"
                  style={{
                    left: `${(overlay.x / outputWidth) * 100}%`,
                    top: `${(overlay.y / outputHeight) * 100}%`,
                    width: `${(overlay.width / outputWidth) * 100}%`,
                    height: `${(overlay.height / outputHeight) * 100}%`,
                    transform: overlay.rotation ? `rotate(${overlay.rotation}deg)` : undefined,
                    zIndex: overlay.zIndex ?? 5,
                  }}
                />
              );
            })}

            {/* Placements */}
            {placements.map((p) => {
              const cap = captures.find((c) => c.captureIndex === p.captureIndex);
              const isSelected = selectedForRetake === p.captureIndex;
              return (
                <button
                  key={`${p.captureIndex}-${p.x}-${p.y}`}
                  type="button"
                  onClick={() => handleSlotClick(p.captureIndex)}
                  className={`absolute overflow-hidden transition-all cursor-pointer shadow-md group ${
                    isSelected
                      ? 'ring-4 ring-[#ffc043] scale-[1.02] shadow-2xl'
                      : 'hover:ring-2 hover:ring-white/80'
                  }`}
                  style={{
                    left: `${(p.x / outputWidth) * 100}%`,
                    top: `${(p.y / outputHeight) * 100}%`,
                    width: `${(p.width / outputWidth) * 100}%`,
                    height: `${(p.height / outputHeight) * 100}%`,
                    borderRadius: p.borderRadius ? `${(p.borderRadius / outputWidth) * 100}%` : '4px',
                    transform: p.rotation ? `rotate(${p.rotation}deg)` : undefined,
                    zIndex: isSelected ? 20 : (p.zIndex ?? 2),
                  }}
                >
                  {cap ? (
                    <img
                      src={cap.dataUrl}
                      alt={`Photo ${p.captureIndex}`}
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="flex size-full flex-col items-center justify-center bg-[#155a4b] text-white font-bold text-xs p-1">
                      <span>Photo {p.captureIndex}</span>
                    </div>
                  )}

                  {/* Retake state overlay badge */}
                  {isSelected && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#07241dc7] text-[#ffe494] font-black text-xs tracking-wider">
                      <span className="rounded bg-[#b43b18] px-2 py-0.5 text-[10px] text-white font-bold shadow">
                        SELECTED
                      </span>
                      <span className="mt-1 text-[11px]">RETAKE</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <p className="mt-4 text-[13px] text-[#5b8176]">Tap a photo slot to choose it for a retake.</p>
      </div>

      <aside className="flex flex-col justify-between rounded-2xl bg-[#d9f7ed] p-7 max-w-[340px] w-full shadow-sm">
        <div>
          <p className="text-[12px] font-bold tracking-wide text-[#28715f]">SESSION CONTROL</p>
          <p className="mt-5 text-[25px] font-black text-[#113b33]">
            {preview ? '4 retakes left' : `${remainingRetakes} retakes left`}
          </p>
          <p className="mt-3 text-[14px] leading-6 text-[#53796e]">
            Retakes replace one image only. Your remaining photos stay safe.
          </p>
        </div>

        <div className="mt-12 grid gap-3">
          <button
            type="button"
            onClick={onConfirm}
            disabled={isConfirming}
            className="rounded-xl bg-[#146a56] px-6 py-3 text-[14px] font-bold text-white shadow-[0_8px_18px_rgba(20,106,86,0.22)] transition hover:bg-[#0f5444] active:scale-[0.98] disabled:opacity-50 cursor-pointer"
          >
            {isConfirming ? 'Confirming strip...' : 'Confirm strip'}
          </button>

          <button
            type="button"
            onClick={handleRetakeClick}
            disabled={!selectedForRetake || !canRetake}
            className="rounded-xl border border-[#92c9b9] bg-white px-6 py-3 text-[14px] font-bold text-[#155847] transition hover:bg-[#f2faf7] active:scale-[0.98] disabled:opacity-40 cursor-pointer"
          >
            {selectedForRetake ? `Retake Photo #${selectedForRetake}` : 'Retake selected'}
          </button>
        </div>
      </aside>
    </div>
  );
};
