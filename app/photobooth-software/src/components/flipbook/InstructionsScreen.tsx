import React, { useEffect, useState, useCallback } from 'react';
import { useFlipbookStore } from '../../store/flipbook-store';
import { boothApi } from '../../services/api';

export interface FlipbookInstructionsScreenProps {
  onStart?: () => void;
}

export const InstructionsScreen: React.FC<FlipbookInstructionsScreenProps> = ({ onStart }) => {
  const { sessionId, setStep, setError } = useFlipbookStore();
  const [secondsRemaining, setSecondsRemaining] = useState<number>(10);

  const handleStart = useCallback(async () => {
    if (onStart) {
      onStart();
      return;
    }

    if (!sessionId) {
      setStep('cover_capture');
      return;
    }

    setError(null);
    try {
      await boothApi.acknowledgeInstructions(sessionId);
      setStep('cover_capture');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setStep('cover_capture');
    }
  }, [onStart, sessionId, setError, setStep]);

  useEffect(() => {
    if (secondsRemaining <= 0) {
      handleStart();
      return;
    }

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleStart();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [secondsRemaining, handleStart]);

  return (
    <div className="relative flex w-full min-h-[100vh] flex-col items-center justify-center overflow-hidden bg-[#f8fafc] px-6 py-10 sm:py-14 text-center select-none font-['Nunito',sans-serif]">
      {/* Top Countdown & Main Title */}
      <div className="flex flex-col items-center">
        <div
          className="relative flex size-24 items-center justify-center sm:size-28"
          aria-live="polite"
          aria-label={`Starting camera in ${secondsRemaining} seconds`}
        >
          <svg className="size-full -rotate-90 transform" viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="32" cy="32" r="27" className="stroke-[#c4c9c6]" strokeWidth="4" fill="white" />
            <circle
              cx="32"
              cy="32"
              r="27"
              className="stroke-[#167a5b] transition-all duration-300 ease-linear"
              strokeWidth="4"
              strokeDasharray={169.65}
              strokeDashoffset={169.65 * (1 - Math.max(0, Math.min(1, secondsRemaining / 10)))}
              strokeLinecap="round"
              fill="transparent"
            />
          </svg>
          <span className="absolute text-4xl font-semibold leading-none tracking-tight text-[#167a5b] sm:text-5xl">
            {secondsRemaining}
          </span>
        </div>
        <span className="sr-only">Starting camera in {secondsRemaining}s</span>

        <h1 className="text-[30px] sm:text-[38px] md:text-[44px] font-bold tracking-tight text-[#1e293b]">
          Get ready to strike a pose
        </h1>
      </div>

      {/* Two Instruction Cards */}
      <div className="mt-6 sm:mt-7 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 w-full max-w-4xl lg:max-w-5xl">
        {/* Left Card: Pose, then move */}
        <div className="relative flex flex-col justify-between overflow-hidden rounded-[32px] bg-white px-10 pt-10 shadow-[0_12px_36px_rgba(0,0,0,0.10)] border border-slate-100 transition-all duration-300 hover:shadow-[0_18px_48px_rgba(0,0,0,0.08)]">
          <div className="text-left">
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-[#1e293b] tracking-tight">
              Pose, then move
            </h2>
            <p className="mt-4 text-lg sm:text-lg md:text-xl text-slate-600 leading-relaxed">
              Take <span className="font-bold text-[#047857]">3 photos</span>, then record{' '}
              <span className="font-bold text-[#047857]">3 short videos</span>.
            </p>
          </div>

          <div className="flex justify-center items-end w-full overflow-hidden">
            <img
              src="/assets/images/left-flipbook-instruct.svg"
              alt="Pose, then move demonstration"
              className="h-48 sm:h-56 md:h-60  w-auto object-contain object-bottom pointer-events-none"
            />
          </div>
        </div>

        {/* Right Card: Make your flipbook */}
        <div className="relative flex flex-col justify-between overflow-hidden rounded-[32px] bg-white px-10 pt-10 shadow-[0_12px_36px_rgba(0,0,0,0.10)] border border-slate-100 transition-all duration-300 hover:shadow-[0_18px_48px_rgba(0,0,0,0.08)]">
          <div className="text-left">
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-[#1e293b] tracking-tight">
              Make your flipbook
            </h2>
            <p className="mt-2 text-lg sm:text-lg md:text-xl text-slate-600 leading-relaxed">
              Pick your favorite photo and video clip to finish.
            </p>
          </div>

          <div className="flex justify-center items-end w-full overflow-hidden">
            <img
              src="/assets/images/right-flipbook-instruct.svg"
              alt="Make your flipbook demonstration"
              className="h-48 sm:h-56 md:h-60  w-auto object-contain object-bottom pointer-events-none"
            />
          </div>
        </div>
      </div>

      {/* Bottom LET'S GO Button */}
      <div className="mt-9 sm:mt-11 flex justify-center">
        <button
          type="button"
          onClick={handleStart}
          aria-label="Start camera now"
          className="group rounded-full bg-[#1b6b55] px-10 sm:px-14 py-3 sm:py-3 shadow-[0_10px_25px_rgba(27,107,85,0.32)] transition-all duration-200 hover:bg-[#155644] hover:scale-105 active:scale-95 cursor-pointer flex items-center justify-center gap-3"
        >
          <span className="text-[35px] sm:text-[25px] font-bold text-white tracking-normal">
            LET&apos;S GO
          </span>
          <img
            src="/assets/images/star-icon.svg"
            alt="Star icon"
            className="w-25 h-25 sm:w-10 sm:h-10 object-contain transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110"
          />
        </button>
      </div>
    </div>
  );
};

