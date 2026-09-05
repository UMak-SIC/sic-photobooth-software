import { useCallback } from 'react';
import { useFlipbookStore } from '../../store/flipbook-store';
import { useCountdown } from '../../hooks/useCountdown';

export function FlipReviewCoverScreen() {
  const { coverUrls, selectedCoverIndex, setSelectedCoverIndex, setStep } = useFlipbookStore();

  const handleContinue = useCallback(() => {
    setStep('review_video');
  }, [setStep]);

  // 5-minute countdown auto-defaulting to Cover 1 if no action taken
  const { formattedMMSS } = useCountdown({
    seconds: 300, // 5 minutes (300s)
    autoStart: true,
    onExpire: () => {
      setSelectedCoverIndex(1);
      handleContinue();
    },
  });

  return (
    <div className="relative flex w-full min-h-[100vh] flex-col items-center justify-between overflow-hidden bg-[#0e473d] text-white px-8 py-10">
      {/* 5-Minute Auto-select Banner */}
      <div className="flex justify-center z-10">
        <span className="rounded-full bg-white/20 border border-white/10 px-6 py-2.5 text-[13px] font-bold text-[#a8f3dd] backdrop-blur-md shadow-sm">
          Auto-selects in {formattedMMSS}
        </span>
      </div>

      {/* Main Selection Area */}
      <div className="relative z-10 flex w-full flex-col items-center justify-center my-auto max-w-6xl">
        <p className="mb-6 text-[15px] font-bold tracking-[0.14em] text-[#a8f3dd]">
          SELECT A COVER PHOTO
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8 w-full">
          {[1, 2, 3].map((index) => {
            const isSelected = selectedCoverIndex === index;
            const url = coverUrls[index - 1];

            return (
              <button
                key={index}
                type="button"
                onClick={() => setSelectedCoverIndex(index)}
                className={`group relative overflow-hidden rounded-3xl border-4 aspect-[4/3] bg-black/30 transition-all ${
                  isSelected
                    ? 'border-[#a8f3dd] ring-4 ring-[#a8f3dd]/40 scale-[1.03] shadow-2xl'
                    : 'border-white/20 opacity-80 hover:opacity-100 hover:border-white/40'
                }`}
              >
                {url ? (
                  <img src={url} alt={`Cover ${index}`} className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center text-base font-bold text-white/50">
                    COVER 0{index}
                  </div>
                )}

                {/* Badge */}
                <div
                  className={`absolute bottom-4 left-4 rounded-xl px-4 py-1.5 text-xs font-black backdrop-blur-md ${
                    isSelected ? 'bg-[#a8f3dd] text-[#0e473d]' : 'bg-black/50 text-white'
                  }`}
                >
                  COVER 0{index} {isSelected && '✓'}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom Action */}
      <div className="flex justify-center z-10 pt-6">
        <button
          type="button"
          onClick={handleContinue}
          className="rounded-2xl bg-[#a8f3dd] px-12 py-4 text-[16px] font-black text-[#0e473d] shadow-[0_8px_25px_rgba(0,0,0,0.3)] transition hover:bg-[#91ebd2] active:scale-[0.98]"
        >
          Continue with Cover 0{selectedCoverIndex}
        </button>
      </div>
    </div>
  );
}
