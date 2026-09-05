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
      onClick={onSelect}
      className={`group relative overflow-hidden rounded-2xl border-4 aspect-[4/3] bg-black/40 transition-all ${
        isSelected
          ? 'border-[#a8f3dd] ring-4 ring-[#a8f3dd]/40 scale-[1.02] shadow-2xl'
          : 'border-white/20 opacity-80 hover:opacity-100 hover:border-white/40'
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
        <div className="flex size-full items-center justify-center text-sm font-bold text-white/50">
          VIDEO 0{index}
        </div>
      )}

      {/* Badges */}
      <div
        className={`absolute bottom-3 left-3 flex items-center gap-2 rounded-lg px-3 py-1 text-xs font-black backdrop-blur-md ${
          isSelected ? 'bg-[#a8f3dd] text-[#0e473d]' : 'bg-black/50 text-white'
        }`}
      >
        <span>▶ 6 SEC</span>
        <span>
          VIDEO 0{index} {isSelected && '✓'}
        </span>
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
    <div className="relative flex w-full min-h-[calc(100vh-77px)] flex-col items-center justify-between overflow-hidden bg-[#0e473d] text-white px-8 py-10">
      {/* 5-Minute Auto-select Banner */}
      <div className="flex justify-center z-10">
        <span className="rounded-full bg-white/20 border border-white/10 px-6 py-2.5 text-[13px] font-bold text-[#a8f3dd] backdrop-blur-md shadow-sm">
          Auto-selects in {formattedMMSS}
        </span>
      </div>

      {/* Main Selection Area */}
      <div className="relative z-10 flex w-full flex-col items-center justify-center my-auto max-w-6xl">
        <p className="mb-6 text-[15px] font-bold tracking-[0.14em] text-[#a8f3dd]">
          SELECT A VIDEO CLIP
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8 w-full">
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

      {/* Bottom Action */}
      <div className="flex justify-center z-10 pt-6">
        <button
          type="button"
          disabled={loading}
          onClick={handleCreateFlipbook}
          className="rounded-2xl bg-[#a8f3dd] px-12 py-4 text-[16px] font-black text-[#0e473d] shadow-[0_8px_25px_rgba(0,0,0,0.3)] transition hover:bg-[#91ebd2] active:scale-[0.98] disabled:opacity-50"
        >
          {loading ? 'Submitting...' : `Create flipbook with Video 0${selectedVideoIndex}`}
        </button>
      </div>
    </div>
  );
}
