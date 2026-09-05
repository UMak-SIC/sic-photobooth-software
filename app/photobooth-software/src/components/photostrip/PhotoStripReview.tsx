import React, { useState } from 'react';

export interface ReviewPlacement {
  captureIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  borderRadius?: number;
  rotation?: number;
  zIndex?: number;
}

export interface ReviewTemplate {
  id: string;
  name: string;
  orientation: 'landscape' | 'portrait';
  outputWidth: number;
  outputHeight: number;
  countdownSeconds?: 3 | 5 | 10;
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

  const placements = template?.placements || [
    { captureIndex: 1, x: 0, y: 0, width: 100, height: 100 },
    { captureIndex: 2, x: 0, y: 0, width: 100, height: 100 },
    { captureIndex: 3, x: 0, y: 0, width: 100, height: 100 },
  ];

  return (
    <div className="artboard relative flex h-full min-h-[780px] w-full items-center justify-center gap-12 overflow-hidden bg-[#ecfff8] px-14 py-10 text-[#113b33]">
      <div className="flex flex-col">
        <p className="text-[13px] font-bold tracking-[0.14em] text-[#28806c]">PHOTO STRIP REVIEW</p>
        <h4 className="mt-2 text-[42px] font-black tracking-[-0.06em]">Keep the good ones.</h4>

        {errorMessage && (
          <div className="mt-3 rounded-lg bg-red-100 border border-red-300 px-4 py-2 text-xs font-semibold text-red-800 max-w-lg">
            {errorMessage}
          </div>
        )}

        {preview ? (
          <div className="review-strip mt-7">
            <div className="review-image a rounded-lg overflow-hidden" />
            <div className="review-image b rounded-lg overflow-hidden" />
            <div className="review-image c retaking rounded-lg overflow-hidden" />
          </div>
        ) : (
          <div className="review-strip mt-7">
            {placements.map((p) => {
              const cap = captures.find((c) => c.captureIndex === p.captureIndex);
              const isSelected = selectedForRetake === p.captureIndex;
              return (
                <button
                  key={p.captureIndex}
                  type="button"
                  onClick={() => handleSlotClick(p.captureIndex)}
                  className={`review-image relative overflow-hidden rounded-lg transition-all cursor-pointer ${
                    isSelected ? 'retaking' : ''
                  }`}
                >
                  {cap ? (
                    <img
                      src={cap.dataUrl}
                      alt={`Photo ${p.captureIndex}`}
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center bg-[#155a4b] text-white font-bold text-sm">
                      Photo {p.captureIndex}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <p className="mt-5 text-[14px] text-[#5b8176]">Tap a photo to choose it for a retake.</p>
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
