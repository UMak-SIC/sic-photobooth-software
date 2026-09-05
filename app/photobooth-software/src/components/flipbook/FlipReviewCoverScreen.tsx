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
    <div className="relative flex w-full min-h-[calc(100vh-77px)] flex-col items-center justify-between overflow-hidden bg-[#0e473d] text-white px-6 md:px-12 py-10">
      {/* 5-Minute Auto-select Banner */}
      <div className="flex justify-center z-10">
        <span className="rounded-full bg-white/20 border border-white/10 px-6 py-2.5 text-[13px] font-bold text-[#a8f3dd] backdrop-blur-md shadow-sm">
          Auto-selects in {formattedMMSS}
        </span>
      </div>

      {/* Main Selection Area */}
      <div className="relative z-10 flex w-full flex-col items-center justify-center my-auto max-w-5xl">
        <p className="mb-6 text-[13px] font-bold tracking-[0.16em] text-[#a8f3dd] uppercase">
          COVER PHOTO
        </p>

        <div
          role="radiogroup"
          aria-label="Cover Photo Selection"
          className="grid grid-cols-1 sm:grid-cols-3 gap-6 w-full"
        >
          {[1, 2, 3].map((index) => {
            const isSelected = selectedCoverIndex === index;
            const url = coverUrls[index - 1];

            return (
              <button
                key={index}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setSelectedCoverIndex(index)}
                className={`group relative overflow-hidden rounded-2xl aspect-[241/132] bg-black/40 transition-all cursor-pointer ${
                  isSelected
                    ? 'ring-4 ring-[#a8f3dd] ring-offset-4 ring-offset-[#0e473d] scale-[1.03] shadow-[0_12px_32px_rgba(0,0,0,0.4)]'
                    : 'opacity-70 hover:opacity-100 hover:scale-[1.01] shadow-md'
                }`}
              >
                {url ? (
                  <img
                    src={url}
                    alt={`Cover Photo 0${index}`}
                    className="size-full object-cover transition duration-300"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-sm font-bold text-white/50 bg-[#176754]">
                    COVER 0{index}
                  </div>
                )}

                {/* Pick Tile Badge matching design sheet */}
                <div className="absolute inset-0 p-4 flex flex-col justify-end items-start pointer-events-none bg-gradient-to-t from-black/60 via-transparent to-transparent">
                  <span
                    className={`rounded-lg px-3 py-1.5 text-xs font-black transition-colors ${
                      isSelected
                        ? 'bg-[#a8f3dd] text-[#0e473d] shadow-sm'
                        : 'bg-black/50 text-white backdrop-blur-sm'
                    }`}
                  >
                    COVER 0{index} {isSelected ? '✓' : ''}
                  </span>
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
          className="rounded-2xl bg-[#a8f3dd] px-12 py-4 text-[16px] font-black text-[#0e473d] shadow-[0_8px_25px_rgba(0,0,0,0.3)] transition hover:bg-[#91ebd2] active:scale-[0.98] cursor-pointer"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
