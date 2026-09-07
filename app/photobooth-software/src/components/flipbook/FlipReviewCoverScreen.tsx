import { useCallback } from 'react';
import { useFlipbookStore } from '../../store/flipbook-store';
import { useCountdown } from '../../hooks/useCountdown';

export function FlipReviewCoverScreen() {
  const { coverUrls, selectedCoverIndex, setSelectedCoverIndex, setStep, selectedFrame } =
    useFlipbookStore();

  const primarySlot = selectedFrame?.placements?.[0];
  const slotWidth = primarySlot?.width || 620;
  const slotHeight = primarySlot?.height || 348.75;
  const slotRatio = slotWidth / slotHeight;
  const slotAspectRatio = `${slotWidth} / ${slotHeight}`;

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
    <div className="relative flex h-[100dvh] max-h-[100dvh] w-full flex-col items-center justify-between overflow-hidden bg-[#0e473d] p-4 md:p-6 text-white">
      {/* 5-Minute Auto-select Banner */}
      <div className="flex justify-center z-10 shrink-0">
        <span className="rounded-full bg-white/20 border border-white/10 px-5 py-2 text-[12px] font-bold text-[#a8f3dd] backdrop-blur-md shadow-sm">
          Auto-selects in {formattedMMSS}
        </span>
      </div>

      {/* Main Selection Area */}
      <div className="relative z-10 flex w-full flex-col items-center justify-center my-auto flex-1 min-h-0 max-w-5xl py-2">
        <p className="mb-3 text-[12px] font-bold tracking-[0.16em] text-[#a8f3dd] uppercase shrink-0">
          COVER PHOTO
        </p>

        <div
          role="radiogroup"
          aria-label="Cover Photo Selection"
          className="grid grid-cols-3 gap-4 md:gap-6 w-full items-center justify-items-center"
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
                style={{
                  aspectRatio: slotAspectRatio,
                  maxHeight: 'calc(100dvh - 200px)',
                  maxWidth: `min(100%, calc((100dvh - 200px) * ${slotRatio}))`,
                  width: `min(100%, calc((100dvh - 200px) * ${slotRatio}))`,
                }}
                className={`group relative overflow-hidden rounded-2xl bg-black/40 transition-all cursor-pointer ${
                  isSelected
                    ? 'ring-4 ring-[#a8f3dd] ring-offset-4 ring-offset-[#0e473d] scale-[1.02] shadow-[0_12px_32px_rgba(0,0,0,0.4)]'
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
                <div className="absolute inset-0 p-3 flex flex-col justify-end items-start pointer-events-none bg-gradient-to-t from-black/60 via-transparent to-transparent">
                  <span
                    className={`rounded-lg px-2.5 py-1 text-xs font-black transition-colors ${
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
      <div className="flex justify-center z-10 pt-2 shrink-0">
        <button
          type="button"
          onClick={handleContinue}
          className="rounded-2xl bg-[#a8f3dd] px-10 py-3.5 text-[15px] font-black text-[#0e473d] shadow-[0_8px_25px_rgba(0,0,0,0.3)] transition hover:bg-[#91ebd2] active:scale-[0.98] cursor-pointer"
        >
          Next: Pick Video →
        </button>
      </div>
    </div>
  );
}
