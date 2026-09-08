import { useCallback } from 'react';
import { useFlipbookStore } from '../../store/flipbook-store';
import { useCountdown } from '../../hooks/useCountdown';
import { type FrameItem, resolveAssetUrl } from '../../services/api';

export function FlipReviewCoverScreen() {
  const { coverUrls, selectedCoverIndex, setSelectedCoverIndex, setStep, selectedFrame } =
    useFlipbookStore();

  const handleContinue = useCallback(() => {
    setStep('review_video');
  }, [setStep]);

  // 60-second countdown auto-advancing if no action is taken
  const { timeLeft } = useCountdown({
    seconds: 60,
    autoStart: true,
    onExpire: () => {
      handleContinue();
    },
  });

  const coverSheetUrl = resolveAssetUrl(selectedFrame?.coverPath ?? null);
  const motionSheetUrl = resolveAssetUrl(selectedFrame?.backgroundPath ?? null);

  const getStripSlotStyle = (frame: FrameItem | undefined | null) => {
    const p = frame?.placements?.[0];
    if (!p) {
      return {
        left: `${(290 / 1200) * 100}%`,
        top: `${(150 / 450) * 100}%`,
        width: `${(620 / 1200) * 100}%`,
        height: `${(348.75 / 450) * 100}%`,
      };
    }
    return {
      left: `${(p.x / 1200) * 100}%`,
      top: `${((p.y % 450) / 450) * 100}%`,
      width: `${(p.width / 1200) * 100}%`,
      height: `${(p.height / 450) * 100}%`,
    };
  };

  const renderCoverCard = (index: number) => {
    const isSelected = selectedCoverIndex === index;
    const url = coverUrls[index - 1];

    return (
      <button
        key={index}
        type="button"
        role="radio"
        aria-checked={isSelected}
        onClick={() => setSelectedCoverIndex(index)}
        className={`group relative w-full aspect-[8/3] overflow-hidden rounded-none bg-white p-0 transition-all duration-200 cursor-pointer text-left outline-none ${
          isSelected
            ? 'border-2 border-[#058d51] ring-4 ring-[#058d51]/40 shadow-xl scale-[1.02]'
            : 'border border-gray-200 hover:border-gray-400 shadow-md opacity-90 hover:opacity-100 hover:scale-[1.01]'
        }`}
      >
        {/* Frame Artwork Layer */}
        {motionSheetUrl || coverSheetUrl ? (
          <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden rounded-none">
            <img
              src={motionSheetUrl || coverSheetUrl || ''}
              alt={selectedFrame?.name || 'Frame'}
              className="absolute top-0 left-0 w-full max-w-none"
              style={{ height: '400%', objectFit: 'fill', objectPosition: 'top' }}
            />
          </div>
        ) : (
          <div className="size-full flex items-center justify-between px-4 py-2 bg-gradient-to-r from-[#d8b4fe] via-[#f472b6] to-[#c084fc] rounded-none">
            <div className="flex flex-col justify-center">
              <span className="text-xs font-black text-white/90 uppercase tracking-wider">SIC</span>
            </div>
            <span className="text-sm font-black text-white/95 tracking-tighter drop-shadow-xs">
              GenSIC
            </span>
          </div>
        )}

        {/* Photo Placement Slot */}
        <div
          className="absolute rounded-none overflow-hidden bg-black/20 z-10 shadow-xs"
          style={getStripSlotStyle(selectedFrame)}
        >
          {url ? (
            <img
              src={url}
              alt={`Cover Shot ${index}`}
              className="size-full object-cover transition duration-300"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-xs font-bold text-white/80 bg-[#176754]">
              SHOT {index}
            </div>
          )}
        </div>
      </button>
    );
  };

  return (
    <div className="relative flex h-full min-h-[100dvh] w-full flex-col items-center justify-between overflow-hidden bg-[#f4f6f5] px-6 py-4 sm:px-10 sm:py-6 text-[#1e293b] select-none font-['Nunito',sans-serif]">
      {/* Top Header Row: Progress Bar & Arcade Countdown Timer */}
      <div className="flex items-center justify-between w-full max-w-5xl shrink-0 gap-6 pt-1">
        {/* Progress Bar (Step 1 of 2 Review Stages: Track only / light background) */}
        <div className="flex-1 h-3.5 sm:h-4.5 bg-[#e2e8f0] rounded-full overflow-hidden shadow-inner" />

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
        {/* Title and Subtitle */}
        <h1 className="text-[28px] sm:text-[36px] md:text-[42px] font-bold tracking-tight text-[#1e293b] text-center">
          Pick a cover photo you like
        </h1>
        <p className="text-base sm:text-lg md:text-xl font-bold text-[#047857] text-center mt-1 sm:mt-2">
          Select the one you like
        </p>

        {/* 3 Cover Cards: 2 on Top, 1 Centered on Bottom */}
        <div
          role="radiogroup"
          aria-label="Cover Photo Selection"
          className="flex flex-col items-center w-full mt-6 sm:mt-8 gap-5 sm:gap-6"
        >
          {/* Top Row: Card 1 & Card 2 */}
          <div className="grid grid-cols-2 gap-5 sm:gap-7 w-full">
            {renderCoverCard(1)}
            {renderCoverCard(2)}
          </div>

          {/* Bottom Row: Card 3 Centered */}
          <div className="w-[calc(50%-10px)] sm:w-[calc(50%-14px)]">
            {renderCoverCard(3)}
          </div>
        </div>
      </div>

      {/* Bottom Action Button: I LIKE THIS */}
      <div className="flex justify-end w-full max-w-5xl shrink-0 pb-1">
        <button
          type="button"
          onClick={handleContinue}
          className="inline-flex items-center gap-2.5 px-6 sm:px-8 py-3 sm:py-3.5 rounded-full bg-[#1b6b55] hover:bg-[#155644] text-white text-lg sm:text-xl font-bold tracking-wide shadow-[0_6px_20px_rgba(27,107,85,0.32)] transition-all hover:-translate-y-0.5 active:scale-95 cursor-pointer"
        >
          <span>I LIKE THIS</span>
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

