import { useState, useCallback } from 'react';
import { useFlipbookStore } from '../../store/flipbook-store';
import { useCountdown } from '../../hooks/useCountdown';
import { boothApi } from '../../services/api';
import { LoopingMotionPreview } from './LoopingMotionPreview';

function VideoCardItem({
  url,
  frames,
  index,
  isSelected,
  onSelect,
}: {
  url?: string;
  frames?: string[];
  index: number;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const [hasError, setHasError] = useState(false);

  return (
    <div className="flex flex-col items-center w-full">
      <button
        type="button"
        role="radio"
        aria-checked={isSelected}
        onClick={onSelect}
        className={`group relative w-full aspect-[4/3] overflow-hidden rounded-2xl bg-black transition-all duration-200 cursor-pointer text-left outline-none ${
          isSelected
            ? 'border-2 border-[#058d51] ring-4 ring-[#058d51]/40 shadow-xl scale-[1.03]'
            : 'border border-gray-200 hover:border-gray-400 shadow-md opacity-90 hover:opacity-100 hover:scale-[1.01]'
        }`}
      >
        {url && !hasError ? (
          <video
            ref={(el) => {
              if (el) {
                el.defaultMuted = true;
                el.muted = true;
                try {
                  const playPromise = el.play();
                  if (playPromise && typeof playPromise.catch === 'function') {
                    playPromise.catch(() => {});
                  }
                } catch {
                  // ignore playback error in environments without full media engines
                }
              }
            }}
            src={url}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            onError={() => setHasError(true)}
            className="size-full object-cover pointer-events-none"
          />
        ) : frames && frames.length > 0 ? (
          <LoopingMotionPreview frames={frames} className="size-full object-cover pointer-events-none" />
        ) : (
          <div className="flex size-full items-center justify-center text-sm font-bold text-white/50 bg-[#176754]">
            VIDEO {index}
          </div>
        )}
      </button>

      {/* Large Digit Number Below */}
      <span className="text-[38px] sm:text-[48px] md:text-[56px] font-bold text-[#1e293b] leading-none mt-3.5 select-none">
        {index}
      </span>
    </div>
  );
}

export function FlipReviewVideoScreen() {
  const {
    sessionId,
    videoUrls,
    videoFrames,
    selectedCoverIndex,
    selectedVideoIndex,
    setSelectedVideoIndex,
    setStep,
    setError,
    setProcessing,
  } = useFlipbookStore();

  const [loading, setLoading] = useState(false);

  const handleCreateFlipbook = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setProcessing(true);

    try {
      if (sessionId) {
        await boothApi.submitFlipbookSelection(sessionId, selectedCoverIndex, selectedVideoIndex);
      }
      setStep('processing');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setStep('processing');
    } finally {
      setLoading(false);
    }
  }, [
    loading,
    sessionId,
    selectedCoverIndex,
    selectedVideoIndex,
    setProcessing,
    setStep,
    setError,
  ]);

  // 60-second countdown auto-defaulting to selection if unattended
  const { timeLeft } = useCountdown({
    seconds: 60,
    autoStart: true,
    onExpire: () => {
      handleCreateFlipbook();
    },
  });

  return (
    <div className="relative flex h-full min-h-[100dvh] w-full flex-col items-center justify-between overflow-hidden bg-[#f4f6f5] px-6 py-4 sm:px-10 sm:py-6 text-[#1e293b] select-none font-['Nunito',sans-serif]">
      {/* Top Header Row: Progress Bar & Arcade Countdown Timer */}
      <div className="flex items-center justify-between w-full max-w-5xl shrink-0 gap-6 pt-1">
        {/* Progress Bar (Step 2 of 2 Review Stages: 50% / Green fill) */}
        <div className="flex-1 h-3.5 sm:h-4.5 bg-[#e2e8f0] rounded-full overflow-hidden shadow-inner">
          <div className="w-1/2 h-full bg-[#1b6b55] rounded-full" />
        </div>

        {/* Arcade Gamer Green Countdown Timer */}
        <div className="flex items-center shrink-0">
          <span
            className="font-['PressStart2P','Arcade_Gamer',monospace] text-[28px] sm:text-[34px] md:text-[38px] font-bold text-[#008037] leading-none tracking-normal drop-shadow-xs"
            aria-live="polite"
            aria-label={`Auto continue in ${timeLeft} seconds`}
          >
            {timeLeft}
          </span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-col items-center justify-center w-full max-w-4xl my-auto py-2">
        {/* Title */}
        <h1 className="text-[28px] sm:text-[36px] md:text-[42px] font-bold tracking-tight text-[#1e293b] text-center">
          Pick the one you like as your GIF
        </h1>

        {/* 3 Video Cards in 3 Columns */}
        <div
          role="radiogroup"
          aria-label="Video Clip Selection"
          className="grid grid-cols-3 gap-6 sm:gap-8 w-full mt-8 sm:mt-12 items-start"
        >
          {[1, 2, 3].map((index) => (
            <VideoCardItem
              key={index}
              index={index}
              url={videoUrls[index - 1]}
              frames={videoFrames[index - 1]}
              isSelected={selectedVideoIndex === index}
              onSelect={() => setSelectedVideoIndex(index)}
            />
          ))}
        </div>
      </div>

      {/* Bottom Action Button: I LIKE THIS */}
      <div className="flex justify-end w-full max-w-5xl shrink-0 pb-1">
        <button
          type="button"
          disabled={loading}
          onClick={handleCreateFlipbook}
          className="inline-flex items-center gap-2.5 px-6 sm:px-8 py-3 sm:py-3.5 rounded-full bg-[#1b6b55] hover:bg-[#155644] text-white text-lg sm:text-xl font-bold tracking-wide shadow-[0_6px_20px_rgba(27,107,85,0.32)] transition-all hover:-translate-y-0.5 active:scale-95 cursor-pointer disabled:opacity-50"
        >
          <span>{loading ? 'Creating...' : 'I LIKE THIS'}</span>
          <img
            src="/assets/images/like-icon.svg"
            alt=""
            className="size-6 sm:size-7 object-contain pointer-events-none drop-shadow-xs"
          />
        </button>
      </div>
    </div>
  );
}

