import React, { useState } from 'react';
import { resolveAssetUrl } from '../../services/api';
import { useCountdown } from '../../hooks/useCountdown';

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
  onRetake?: (captureIndex: number) => void;
  onAssignPhoto?: (slotIndex: number, photoId: string) => void;
  onToggleVersion?: (captureIndex: number) => void;
  onConfirm?: () => void;
}

const RETAKE_SLOT_LETTERS = ['A', 'B', 'C', 'D'];

export const PhotoStripReview: React.FC<PhotoStripReviewProps> = ({
  template,
  captures = [],
  photoPool,
  slotAssignments = {},
  retakeCount = 0,
  isConfirming = false,
  errorMessage,
  preview = false,
  eventDate,
  onRetake,
  onAssignPhoto,
  onToggleVersion,
  onConfirm,
}) => {
  const [selectedSlot, setSelectedSlot] = useState<number | null>(1);

  // Auto continue timer (60s countdown) with safe single-dispatch
  const { timeLeft: secondsRemaining } = useCountdown({
    seconds: 60,
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

  // Exactly 4 retake bank slots: Take A, Take B, Take C, Take D
  const reviewSlots = [0, 1, 2, 3];

  // Extract retaken photos from photoPool or captures
  const retakePhotos: PoolPhoto[] = photoPool
    ? photoPool.filter((p) => p.isRetake)
    : captures
        .filter((c) => !!c.retakeDataUrl)
        .map((c, idx) => ({
          id: c.photoId || `retake-${c.captureIndex}`,
          dataUrl: c.retakeDataUrl || c.dataUrl,
          label: `Take ${RETAKE_SLOT_LETTERS[idx] || idx + 1}`,
          letter: RETAKE_SLOT_LETTERS[idx] || String(idx + 1),
          isRetake: true,
        }));

  const handleSlotClick = (slotIndex: number) => {
    setSelectedSlot(slotIndex);
  };

  const handleBankSlotClick = (photo: PoolPhoto) => {
    if (!selectedSlot) return;
    if (onAssignPhoto) {
      onAssignPhoto(selectedSlot, photo.id);
    } else if (onToggleVersion) {
      onToggleVersion(selectedSlot);
    }
  };

  const stripDate = (() => {
    if (eventDate) {
      const parsed = new Date(eventDate);
      if (!isNaN(parsed.getTime())) {
        return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      }
      return eventDate;
    }
    return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  })();

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
                        className="size-full object-cover"
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

              {/* Date at the bottom left of the photostrip */}
              <div className="absolute bottom-3.5 left-4 pointer-events-none z-20">
                <span className="font-['Nunito',sans-serif] text-xs sm:text-sm font-bold tracking-wide text-white/80 bg-black/20 px-2 py-0.5 rounded">
                  {stripDate}
                </span>
              </div>
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
              Tap a frame to retake it, or tap a slot below to swap.
            </p>
          </div>

          {/* 2x2 Retake Bank Grid */}
          <div className="grid grid-cols-2 gap-4 sm:gap-5 w-full my-6">
            {reviewSlots.map((slotIndex) => {
              const letter = RETAKE_SLOT_LETTERS[slotIndex];
              const retakePhoto = retakePhotos[slotIndex];
              const isOccupied = !!retakePhoto;

              // Check which frame on the photostrip currently owns this photo
              let assignedFrame: number | undefined;
              if (isOccupied) {
                const entry = Object.entries(slotAssignments).find(([, id]) => id === retakePhoto.id);
                if (entry) {
                  assignedFrame = Number(entry[0]);
                } else {
                  const matchedCapture = captures.find(
                    (c) => c.dataUrl === retakePhoto.dataUrl || c.photoId === retakePhoto.id,
                  );
                  assignedFrame = matchedCapture?.captureIndex;
                }
              }

              const isAssignedToSelected = isOccupied && selectedSlot !== null && assignedFrame === selectedSlot;

              return (
                <button
                  key={slotIndex}
                  type="button"
                  onClick={() => {
                    if (isOccupied) {
                      handleBankSlotClick(retakePhoto);
                    }
                  }}
                  aria-label={
                    isOccupied
                      ? `Retake bank slot Take ${letter}: ${assignedFrame ? `In Frame ${assignedFrame}` : 'Unused'}`
                      : `Empty retake slot Take ${letter}`
                  }
                  className={`relative flex items-center justify-center h-28 sm:h-32 rounded-2xl transition-all duration-200 overflow-hidden ${
                    isAssignedToSelected
                      ? 'ring-4 ring-[#16a34a] ring-offset-2 scale-[1.03] shadow-lg cursor-pointer'
                      : isOccupied
                      ? 'hover:scale-[1.02] ring-2 ring-slate-300 cursor-pointer shadow-sm'
                      : 'opacity-85 border-2 border-dashed border-slate-300 bg-slate-100 text-slate-400 cursor-default'
                  } ${isOccupied ? 'bg-[#737373]' : ''}`}
                >
                  {isOccupied ? (
                    <>
                      <img
                        src={retakePhoto.dataUrl}
                        alt={`Take ${letter}`}
                        className="size-full object-cover"
                      />
                      {/* Top-left slot label badge */}
                      <div className="absolute top-2 left-2 z-10">
                        <span className="bg-black/75 backdrop-blur-xs text-white font-bold text-xs px-2 py-0.5 rounded-md shadow">
                          Take {letter}
                        </span>
                      </div>
                      {/* Bottom Status / Frame ownership badge */}
                      <div className="absolute bottom-2 inset-x-2 z-10 flex justify-center">
                        {assignedFrame !== undefined ? (
                          <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow bg-[#16a34a] text-white">
                            In Frame {assignedFrame}
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shadow bg-[#475569] text-slate-100">
                            Unused (Tap to Swap)
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    /* Empty Retake Slot with Camera Icon and Take Letter */
                    <div className="flex flex-col items-center justify-center gap-1.5 text-slate-400 select-none">
                      <svg
                        className="w-7 h-7 sm:w-8 sm:h-8"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z"
                        />
                      </svg>
                      <span className="text-xs sm:text-sm font-bold tracking-wider uppercase">
                        Take {letter}
                      </span>
                    </div>
                  )}
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

