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
  template: ReviewTemplate;
  captures: Array<{ captureIndex: number; dataUrl: string }>;
  retakeCount: number;
  isConfirming: boolean;
  errorMessage?: string | null;
  onRetake: (captureIndex: number) => void;
  onConfirm: () => void;
}

export const PhotoStripReview: React.FC<PhotoStripReviewProps> = ({
  template,
  captures,
  retakeCount,
  isConfirming,
  errorMessage,
  onRetake,
  onConfirm,
}) => {
  const [selectedForRetake, setSelectedForRetake] = useState<number | null>(null);
  const maxRetakes = 4;
  const remainingRetakes = Math.max(0, maxRetakes - retakeCount);
  const canRetake = remainingRetakes > 0;

  const isPortrait = template.orientation === 'portrait';
  const aspectRatio = `${template.outputWidth} / ${template.outputHeight}`;

  const handleSlotClick = (captureIndex: number) => {
    if (!canRetake) return;
    setSelectedForRetake(captureIndex);
  };

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-center gap-8 p-6">
      {/* Template Preview Canvas */}
      <div
        className="relative bg-white rounded-xl shadow-2xl overflow-hidden border border-zinc-200"
        style={{
          width: isPortrait ? '340px' : '520px',
          aspectRatio,
        }}
      >
        {template.placements.map((p, idx) => {
          const cap = captures.find((c) => c.captureIndex === p.captureIndex);
          const leftPct = (p.x / template.outputWidth) * 100;
          const topPct = (p.y / template.outputHeight) * 100;
          const widthPct = (p.width / template.outputWidth) * 100;
          const heightPct = (p.height / template.outputHeight) * 100;

          return (
            <div
              key={idx}
              onClick={() => handleSlotClick(p.captureIndex)}
              style={{
                left: `${leftPct}%`,
                top: `${topPct}%`,
                width: `${widthPct}%`,
                height: `${heightPct}%`,
                borderRadius: p.borderRadius
                  ? `${(p.borderRadius / template.outputWidth) * 100}%`
                  : '4px',
                transform: p.rotation ? `rotate(${p.rotation}deg)` : undefined,
                zIndex: p.zIndex || 1,
              }}
              className={`absolute overflow-hidden cursor-pointer transition-all duration-200 group border-2 ${
                selectedForRetake === p.captureIndex
                  ? 'border-emerald-500 ring-4 ring-emerald-500/30'
                  : 'border-transparent hover:border-emerald-400/80'
              }`}
            >
              {cap ? (
                <img
                  src={cap.dataUrl}
                  alt={`Photo ${p.captureIndex}`}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="w-full h-full bg-zinc-200 flex items-center justify-center text-zinc-400 font-bold">
                  Photo {p.captureIndex}
                </div>
              )}

              {/* Retake badge overlay on hover */}
              {canRetake && (
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <span className="text-white text-xs font-bold uppercase tracking-wider bg-emerald-600 px-3 py-1 rounded-full shadow">
                    Retake #{p.captureIndex}
                  </span>
                </div>
              )}
            </div>
          );
        })}

        {/* Footer label & QR placeholder */}
        <div className="absolute bottom-3 right-4 flex items-center gap-2 pointer-events-none opacity-60">
          <div className="w-8 h-8 bg-zinc-200 rounded border border-zinc-300 flex items-center justify-center text-[8px] text-zinc-500">
            QR
          </div>
          <span className="text-[10px] font-mono text-zinc-500 font-semibold tracking-tight">
            myphotobooth.com
          </span>
        </div>
      </div>

      {/* Action Controls & Retake Counter Panel */}
      <div className="flex flex-col items-center md:items-start max-w-sm gap-6 text-center md:text-left">
        <div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight">Review Your Photos</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Tap any photo on the strip if you would like to retake it, or confirm to finish and
            print.
          </p>
        </div>

        {/* Retake status card */}
        <div className="w-full p-4 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-between">
          <div className="text-left">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 block">
              Retakes Remaining
            </span>
            <span
              className={`text-2xl font-black ${
                remainingRetakes > 0 ? 'text-emerald-400' : 'text-amber-500'
              }`}
            >
              {remainingRetakes} / {maxRetakes}
            </span>
          </div>

          {selectedForRetake !== null && canRetake && (
            <button
              onClick={() => onRetake(selectedForRetake)}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg text-sm transition-all shadow-md active:scale-95"
            >
              Retake Photo #{selectedForRetake}
            </button>
          )}
        </div>

        {errorMessage && (
          <div className="w-full p-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-200 text-sm">
            {errorMessage}
          </div>
        )}

        {/* Action Button */}
        <button
          onClick={onConfirm}
          disabled={isConfirming}
          className="w-full py-4 px-8 bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-700 text-black font-extrabold text-lg uppercase tracking-wider rounded-xl shadow-xl hover:shadow-emerald-500/20 active:scale-98 transition-all flex items-center justify-center gap-3"
        >
          {isConfirming ? (
            <>
              <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
              Compositing Strip...
            </>
          ) : (
            <>
              <span>Confirm & Print</span>
              <span>🖨️</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
