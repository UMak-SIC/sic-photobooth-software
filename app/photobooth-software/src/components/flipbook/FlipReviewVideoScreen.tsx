import { useState, useCallback } from 'react';
import { useFlipbookStore } from '../../store/flipbook-store';
import { useCountdown } from '../../hooks/useCountdown';
import { boothApi } from '../../services/api';

function VideoItemPreview({
  url,
  index,
  isSelected,
  onSelect,
}: {
  url?: string;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const [hasError, setHasError] = useState(false);

  return (
    <button
      type="button"
      role="radio"
      aria-checked={isSelected}
      onClick={onSelect}
      className={`group relative overflow-hidden rounded-2xl aspect-[241/132] bg-black/40 transition-all cursor-pointer ${
        isSelected
          ? 'ring-4 ring-[#a8f3dd] ring-offset-4 ring-offset-[#0e473d] scale-[1.03] shadow-[0_12px_32px_rgba(0,0,0,0.4)]'
          : 'opacity-70 hover:opacity-100 hover:scale-[1.01] shadow-md'
      }`}
    >
      {url && !hasError ? (
        <video
          src={url}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          onLoadedData={(e) => {
            const el = e.currentTarget;
            el.muted = true;
            el.currentTime = 0.001;
            el.play().catch(() => {});
          }}
          onError={() => setHasError(true)}
          className="size-full object-cover"
        />
      ) : (
        <div className="flex size-full items-center justify-center text-sm font-bold text-white/50 bg-[#176754]">
          VIDEO 0{index}
        </div>
      )}

      {/* Pick Tile Badge matching design sheet */}
      <div className="absolute inset-0 p-4 flex flex-col justify-end items-start pointer-events-none bg-gradient-to-t from-black/60 via-transparent to-transparent">
        <div
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black transition-colors ${
            isSelected
              ? 'bg-[#a8f3dd] text-[#0e473d] shadow-sm'
              : 'bg-black/50 text-white backdrop-blur-sm'
          }`}
        >
          <svg className="size-3 fill-current shrink-0" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
          <span>5 SEC</span>
          <span>•</span>
          <span>
            CLIP 0{index} {isSelected ? '✓' : ''}
          </span>
        </div>
      </div>
    </button>
  );
}

export function FlipReviewVideoScreen() {
  const {
    sessionId,
    videoUrls,
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

  // 5-minute countdown auto-defaulting to Video 1 if no choice is made
  const { formattedMMSS } = useCountdown({
    seconds: 300,
    autoStart: true,
    onExpire: () => {
      setSelectedVideoIndex(1);
      handleCreateFlipbook();
    },
  });

  return (
    <div className="relative flex min-h-[100dvh] w-full flex-col items-center justify-between overflow-hidden bg-[#0e473d] px-6 py-10 text-white md:px-12">
      {/* 5-Minute Auto-select Banner */}
      <div className="flex justify-center z-10">
        <span className="rounded-full bg-white/20 border border-white/10 px-6 py-2.5 text-[13px] font-bold text-[#a8f3dd] backdrop-blur-md shadow-sm">
          Auto-selects in {formattedMMSS}
        </span>
      </div>

      {/* Main Selection Area */}
      <div className="relative z-10 flex w-full flex-col items-center justify-center my-auto max-w-5xl">
        <p className="mb-6 text-[13px] font-bold tracking-[0.16em] text-[#a8f3dd] uppercase">
          VIDEO CLIPS
        </p>

        <div
          role="radiogroup"
          aria-label="Video Clip Selection"
          className="grid grid-cols-1 sm:grid-cols-3 gap-6 w-full"
        >
          {[1, 2, 3].map((index) => (
            <VideoItemPreview
              key={index}
              index={index}
              url={videoUrls[index - 1]}
              isSelected={selectedVideoIndex === index}
              onSelect={() => setSelectedVideoIndex(index)}
            />
          ))}
        </div>
      </div>

      {/* Bottom Action Button */}
      <div className="flex justify-center z-10 pt-6">
        <button
          type="button"
          disabled={loading}
          onClick={handleCreateFlipbook}
          className="rounded-2xl bg-[#a8f3dd] px-12 py-4 text-[16px] font-black text-[#0e473d] shadow-[0_8px_25px_rgba(0,0,0,0.3)] transition hover:bg-[#91ebd2] active:scale-[0.98] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin size-5 text-[#0e473d]" fill="none" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span>Creating flipbook...</span>
            </>
          ) : (
            <span>Create flipbook</span>
          )}
        </button>
      </div>
    </div>
  );
}
