import React, { useState } from 'react';
import { resolveAssetUrl } from '../../services/api';
import { useCountdown } from '../../hooks/useCountdown';
import { PHOTO_STRIP_CONFIG } from '../../config/photostrip';
import { PHOTO_FILTERS, getFilterCss, type PhotoFilterType } from '../../config/filters';

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

export interface PoolPhoto {
  id: string;
  dataUrl: string;
  label?: string;
  letter?: string;
  isRetake?: boolean;
}

export interface PhotoStripReviewProps {
  template?: ReviewTemplate;
  captures?: Array<{
    captureIndex: number;
    dataUrl: string;
    photoId?: string;
    originalDataUrl?: string;
    retakeDataUrl?: string;
    activeVersion?: 'original' | 'retake';
    retakeOrder?: number;
  }>;
  photoPool?: PoolPhoto[];
  slotAssignments?: Record<number, string>;
  retakeCount?: number;
  isConfirming?: boolean;
  errorMessage?: string | null;
  preview?: boolean;
  eventDate?: string;
  selectedFilter?: PhotoFilterType;
  onSelectFilter?: (filter: PhotoFilterType) => void;
  onRetake?: (captureIndex: number) => void;
  onAssignPhoto?: (slotIndex: number, photoId: string) => void;
  onToggleVersion?: (captureIndex: number) => void;
  onConfirm?: () => void;
}

export const PhotoStripReview: React.FC<PhotoStripReviewProps> = ({
  template,
  captures = [],
  photoPool: _photoPool,
  slotAssignments: _slotAssignments,
  retakeCount = 0,
  isConfirming = false,
  errorMessage,
  preview = false,
  selectedFilter,
  onSelectFilter,
  onRetake,
  onAssignPhoto: _onAssignPhoto,
  onToggleVersion: _onToggleVersion,
  onConfirm,
}) => {
  const [selectedSlot, setSelectedSlot] = useState<number | null>(1);
  const [internalFilter, setInternalFilter] = useState<PhotoFilterType>('normal');
  const currentFilter = selectedFilter !== undefined ? selectedFilter : internalFilter;

  const handleSelectFilter = (filter: PhotoFilterType) => {
    setInternalFilter(filter);
    onSelectFilter?.(filter);
  };

  const filterCss = getFilterCss(currentFilter);

  // Auto continue timer with safe single-dispatch
  const { timeLeft: secondsRemaining } = useCountdown({
    seconds: PHOTO_STRIP_CONFIG.reviewCountdownSeconds,
    autoStart: !preview && !isConfirming,
    onExpire: () => {
      if (!isConfirming) {
        onConfirm?.();
      }
    },
  });

  const maxRetakes = 4;
  const remainingRetakes = Math.max(0, maxRetakes - retakeCount);
  const canRetake = remainingRetakes > 0;

  const outputWidth = template?.outputWidth || 1200;
  const outputHeight = template?.outputHeight || 1800;
  const isLandscape =
    (template?.orientation || (outputWidth > outputHeight ? 'landscape' : 'portrait')) ===
    'landscape';

  const placements =
    template?.placements && template.placements.length > 0
      ? template.placements
      : [
          { captureIndex: 1, x: 100, y: 120, width: 1000, height: 440, borderRadius: 8, zIndex: 1 },
          { captureIndex: 2, x: 100, y: 600, width: 1000, height: 440, borderRadius: 8, zIndex: 1 },
          {
            captureIndex: 3,
            x: 100,
            y: 1080,
            width: 1000,
            height: 440,
            borderRadius: 8,
            zIndex: 1,
          },
        ];

  const handleSlotClick = (slotIndex: number) => {
    setSelectedSlot(slotIndex);
  };

  const handleRetakeClick = () => {
    if (!selectedSlot || !canRetake) return;
    onRetake?.(selectedSlot);
  };

  const backgroundUrl = resolveAssetUrl(template?.backgroundPath ?? null);

  return (
    <div className="relative flex min-h-[100dvh] w-full flex-col items-center justify-center overflow-hidden bg-white px-6 sm:px-12 py-8 select-none font-['Nunito',sans-serif] text-[#1f2937]">
      {/* Top Right Countdown Timer */}
      <div className="absolute top-6 right-8 sm:top-8 sm:right-12 z-30 flex items-center">
        <span
          className="font-['PressStart2P','Arcade_Gamer',monospace] text-[28px] sm:text-[34px] md:text-[38px] font-bold text-[#008037] leading-none tracking-normal"
          aria-live="polite"
          aria-label={`Auto continue in ${secondsRemaining} seconds`}
        >
          {secondsRemaining}
        </span>
      </div>

      {/* Optional Error Message */}
      {errorMessage && (
        <div className="mb-4 w-full max-w-xl rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-center text-sm font-bold text-red-800 shadow-sm">
          {errorMessage}
        </div>
      )}

      {/* Main Content: 2-Column Layout */}
      <div className="flex flex-col lg:flex-row items-center justify-center gap-14 lg:gap-24 xl:gap-32 w-full max-w-7xl my-auto">
        {/* Left Column: Photostrip Preview */}
        <div className="flex flex-col items-center">
          <div className="text-center mb-2.5">
            <h2 className="text-sm sm:text-base md:text-lg font-bold text-[#4b5563] leading-tight">
              Replacing 1 photo won’t touch the rest. 
            </h2>
          </div>

          {preview ? (
            <div className="review-strip mt-2">
              <div className="review-image a rounded-lg overflow-hidden" />
              <div className="review-image b rounded-lg overflow-hidden" />
              <div className="review-image c retaking rounded-lg overflow-hidden" />
            </div>
          ) : (
            <div
              className="relative overflow-hidden rounded-2xl bg-[#0c3930] shadow-2xl transition-all"
              style={{
                aspectRatio: `${outputWidth} / ${outputHeight}`,
                width: isLandscape
                  ? 'min(640px, 52vw, calc(140dvh - 160px))'
                  : 'min(460px, 42vw, calc(80dvh - 90px))',
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
                  className="absolute inset-0 pointer-events-none object-cover size-full"
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
                      zIndex: (overlay.zIndex ?? 2) * 2 + 1,
                    }}
                  />
                );
              })}

              {/* Placements / Clickable Photo Slots */}
              {placements.map((p) => {
                const cap = captures.find((c) => c.captureIndex === p.captureIndex);
                const isSelected = selectedSlot === p.captureIndex;

                return (
                  <button
                    key={`${p.captureIndex}-${p.x}-${p.y}`}
                    type="button"
                    onClick={() => handleSlotClick(p.captureIndex)}
                    aria-label={`Select photo ${p.captureIndex}`}
                    className={`absolute overflow-hidden transition-all cursor-pointer group ${
                      isSelected
                        ? 'ring-4 ring-[#16a34a] ring-offset-2 scale-[1.02] shadow-2xl'
                        : 'hover:ring-3 hover:ring-white/90'
                    }`}
                    style={{
                      left: `${(p.x / outputWidth) * 100}%`,
                      top: `${(p.y / outputHeight) * 100}%`,
                      width: `${(p.width / outputWidth) * 100}%`,
                      height: `${(p.height / outputHeight) * 100}%`,
                      borderRadius: `${((p.borderRadius ?? 8) / outputWidth) * 100}%`,
                      transform: p.rotation ? `rotate(${p.rotation}deg)` : undefined,
                      zIndex: isSelected ? 30 : (p.zIndex ?? 1) * 2,
                    }}
                  >
                    {cap?.dataUrl ? (
                      <img
                        src={cap.dataUrl}
                        alt={`Photo ${p.captureIndex}`}
                        className="size-full object-cover transition-all duration-200"
                        style={{ filter: filterCss }}
                      />
                    ) : (
                      <div className="flex size-full flex-col items-center justify-center bg-[#e2f0eb] text-[#1b6b55] font-bold text-sm p-1">
                        <span>{p.captureIndex}</span>
                      </div>
                    )}

                    {/* Frame Badge */}
                    <div className="absolute top-1.5 left-1.5 z-10">
                      <span className="rounded bg-black/75 px-2 py-0.5 text-[11px] font-bold text-white shadow backdrop-blur-xs">
                        Frame {p.captureIndex}
                      </span>
                    </div>
                  </button>
                );
              })}

            </div>
          )}
        </div>

        {/* Right Column: Retakes Left + Retake Bank (2x2 Grid) + Action Buttons */}
        <div className="flex flex-col items-start w-full max-w-[440px]">
          {/* Header */}
          <div className="w-full">
            <h1 className="text-4xl sm:text-5xl font-bold text-[#1f2937] tracking-tight">
              {remainingRetakes} {remainingRetakes === 1 ? 'Retake' : 'Retakes'} Left
            </h1>
            <p className="mt-2 text-base sm:text-lg font-bold text-[#008037]">
              Select a photo filter below, or tap a photo to retake.
            </p>
          </div>

          {/* 2x2 Photo Filters Grid */}
          <div className="grid grid-cols-2 gap-4 sm:gap-5 w-full my-6">
            {PHOTO_FILTERS.map((filter) => {
              const isSelected = currentFilter === filter.id;
              const samplePhoto = captures[0]?.dataUrl;

              return (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => handleSelectFilter(filter.id)}
                  aria-label={`Select ${filter.label} filter`}
                  className={`relative flex flex-col justify-between p-3.5 h-40 sm:h-48 rounded-2xl transition-all duration-200 overflow-hidden cursor-pointer text-left ${
                    isSelected
                      ? 'ring-4 ring-[#16a34a] ring-offset-2 scale-[1.03] shadow-lg bg-[#f0fdf4] border-2 border-[#16a34a]'
                      : 'hover:scale-[1.02] ring-1 ring-slate-200 hover:ring-slate-300 bg-white shadow-xs border border-slate-200'
                  }`}
                >
                  {/* Thumbnail / Swatch Preview */}
                  <div className="relative w-full flex-1 min-h-[105px] sm:min-h-[135px] rounded-xl overflow-hidden flex items-center justify-center bg-slate-100">
                    {samplePhoto ? (
                      <img
                        src={samplePhoto}
                        alt=""
                        className="size-full object-cover transition-all"
                        style={{ filter: filter.cssFilter }}
                      />
                    ) : (
                      <div
                        className="size-full"
                        style={{ background: filter.previewBg }}
                      />
                    )}
                    {isSelected && (
                      <div className="absolute top-1.5 right-1.5 z-10 flex size-5 items-center justify-center rounded-full bg-[#16a34a] text-white shadow-md">
                        <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor">
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Filter Details */}
                  <div className="w-full flex items-baseline justify-between pt-2 px-0.5">
                    <span
                      className={`text-xs sm:text-sm font-bold truncate ${
                        isSelected ? 'text-[#16a34a]' : 'text-[#1f2937]'
                      }`}
                    >
                      {filter.label}
                    </span>
                    <span className="text-[10px] sm:text-[11px] font-semibold text-[#6b7280] truncate ml-1">
                      {filter.sublabel}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Bottom Action Buttons */}
          <div className="flex items-center gap-4 w-full mt-2">
            {/* Left Button: Retake Frame */}
            <button
              type="button"
              onClick={handleRetakeClick}
              disabled={!selectedSlot || !canRetake}
              className="flex-1 rounded-full bg-[#e5e7eb] hover:bg-[#d8dbdf] active:scale-95 disabled:opacity-50 disabled:hover:bg-[#e5e7eb] disabled:cursor-not-allowed px-5 sm:px-6 py-3.5 text-center text-base sm:text-lg font-bold text-[#1f2937] transition shadow-sm cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis"
            >
              {selectedSlot ? (
                canRetake ? (
                  `Retake photo #${selectedSlot}`
                ) : (
                  'No retakes left'
                )
              ) : (
                'Retake photo #'
              )}
            </button>

            {/* Right Button: I'm finished */}
            <button
              type="button"
              onClick={onConfirm}
              disabled={isConfirming}
              className="flex-1 rounded-full bg-[#146a56] hover:bg-[#0f5444] active:scale-95 disabled:opacity-60 px-5 sm:px-7 py-4.5 text-lg sm:text-xl font-bold text-white shadow-md transition flex items-center justify-center gap-2.5 cursor-pointer whitespace-nowrap"
            >
              <span>{isConfirming ? 'Finishing...' : "I'm finished"}</span>
              <img
                src="/assets/images/finished-icon.svg"
                alt=""
                className="w-6 h-6 sm:w-7 sm:h-7 object-contain pointer-events-none"
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

