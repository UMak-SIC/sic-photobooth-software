import React, { useEffect, useState } from 'react';
import type { ReviewTemplate } from './PhotoStripReview';
import { resolveAssetUrl } from '../../services/api';

export interface PhotoStripInstructionsScreenProps {
  template?: ReviewTemplate | null;
  onStart: () => void;
}

export const PhotoStripInstructionsScreen: React.FC<PhotoStripInstructionsScreenProps> = ({
  template,
  onStart,
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(6);

  useEffect(() => {
    if (secondsRemaining <= 0) {
      onStart();
      return;
    }

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onStart();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [secondsRemaining, onStart]);

  const uniquePhotosCount =
    template?.requiredCaptureCount ??
    (template?.placements ? new Set(template.placements.map((p) => p.captureIndex)).size : 3);

  const countdownSec = template?.countdownSeconds || 5;

  return (
    <div className="relative flex w-full min-h-[100vh] flex-col items-center justify-center overflow-hidden bg-[#ecfff8] px-8 py-14 text-center text-[#113b33]">
      <div className="flex items-center gap-3">
        <p className="text-[13px] font-bold tracking-[0.14em] text-[#28806c] uppercase">
          PHOTO STRIP INSTRUCTIONS
        </p>
        <span className="rounded-full bg-[#146a56]/10 border border-[#146a56]/20 px-3 py-0.5 text-[12px] font-bold text-[#146a56]">
          Starting camera in {secondsRemaining}s
        </span>
      </div>

      <h4 className="mt-3 text-[44px] md:text-[52px] font-black tracking-[-0.06em]">
        Get ready to strike a pose.
      </h4>

      <p className="mt-2 text-sm text-[#53796e] max-w-lg">
        {template?.name ? `Using layout "${template.name}"` : 'Your layout is ready.'}
      </p>

      <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6 text-left w-full max-w-4xl">
        <div className="rounded-3xl bg-[#d9f7ed] p-7 shadow-xs">
          <span className="text-[14px] font-black text-[#20745f]">01</span>
          <h5 className="mt-5 text-[20px] font-black text-[#113b33]">Strike your pose</h5>
          <p className="mt-2 text-[14px] leading-6 text-[#56796f]">
            A {countdownSec}-second countdown will run on screen before every shot.
          </p>
        </div>

        <div className="rounded-3xl bg-[#d9f7ed] p-7 shadow-xs">
          <span className="text-[14px] font-black text-[#20745f]">02</span>
          <h5 className="mt-5 text-[20px] font-black text-[#113b33]">Automatic captures</h5>
          <p className="mt-2 text-[14px] leading-6 text-[#56796f]">
            We will take all {uniquePhotosCount} photos in sequence for your strip.
          </p>
        </div>

        <div className="rounded-3xl bg-[#d9f7ed] p-7 shadow-xs">
          <span className="text-[14px] font-black text-[#20745f]">03</span>
          <h5 className="mt-5 text-[20px] font-black text-[#113b33]">Keep the good ones</h5>
          <p className="mt-2 text-[14px] leading-6 text-[#56796f]">
            Review all shots at the end with up to 4 individual retakes.
          </p>
        </div>
      </div>

      <div className="mt-12 flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={onStart}
          className="rounded-2xl bg-[#146a56] px-10 py-4 text-[16px] font-bold text-white shadow-[0_8px_20px_rgba(20,106,86,0.25)] transition hover:bg-[#115746] active:scale-[0.98] cursor-pointer flex items-center gap-2"
        >
          <span>Start camera now</span>
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-mono">
            {secondsRemaining}s
          </span>
        </button>
      </div>
    </div>
  );
};

