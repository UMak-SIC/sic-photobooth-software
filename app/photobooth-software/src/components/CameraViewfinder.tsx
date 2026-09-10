import React, { useEffect, useState, useCallback } from 'react';
import { useCamera } from '../hooks/useCamera';
import { useCountdown } from '../hooks/useCountdown';

export interface CameraViewfinderProps {
  countdownSeconds?: 3 | 5 | 10;
  isCountingDown?: boolean;
  activeSlotIndex?: number;
  totalSlots?: number;
  isRetaking?: boolean;
  preview?: boolean;
  slotWidth?: number;
  slotHeight?: number;
  captures?: Array<{ captureIndex: number; dataUrl: string }>;
  onCountdownComplete?: (blob: Blob) => void;
  onCancelCountdown?: () => void;
}

export const CameraViewfinder: React.FC<CameraViewfinderProps> = ({
  countdownSeconds = 5,
  isCountingDown = false,
  activeSlotIndex = 1,
  totalSlots = 4,
  isRetaking = false,
  preview = false,
  slotWidth,
  slotHeight,
  captures = [],
  onCountdownComplete,
}) => {
  const {
    videoRef,
    isActive,
    error: cameraError,
    startCamera,
    stopCamera,
    capturePhoto,
  } = useCamera();

  const [flash, setFlash] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const slotRatio = slotWidth && slotHeight && slotHeight > 0 ? slotWidth / slotHeight : 16 / 9;
  const slotAspectRatio = `${slotWidth || 16} / ${slotHeight || 9}`;

  const handleCapture = useCallback(async () => {
    if (isCapturing) return;
    setIsCapturing(true);
    try {
      setFlash(true);
      setTimeout(() => setFlash(false), 200);

      const blob = await capturePhoto();
      if (onCountdownComplete) {
        onCountdownComplete(blob);
      }
    } catch (err: unknown) {
      console.warn('Camera capture failed, generating fallback canvas snapshot:', err);
      // Fallback synthetic photo if real frame capture fails
      const canvas = document.createElement('canvas');
      canvas.width = 1920;
      canvas.height = 1080;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#0f2923';
        ctx.fillRect(0, 0, 1920, 1080);
        ctx.fillStyle = '#48c4a1';
        ctx.font = 'bold 64px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`SIC PHOTOBOOTH - SLOT ${activeSlotIndex}`, 960, 500);
        ctx.fillStyle = '#9ef0dc';
        ctx.font = '36px sans-serif';
        ctx.fillText(new Date().toLocaleTimeString(), 960, 580);
      }
      canvas.toBlob(
        (fallbackBlob) => {
          if (fallbackBlob && onCountdownComplete) {
            onCountdownComplete(fallbackBlob);
          }
        },
        'image/jpeg',
        0.95,
      );
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing, capturePhoto, onCountdownComplete, activeSlotIndex]);

  const {
    timeLeft,
    reset: resetCountdown,
    pause: pauseCountdown,
  } = useCountdown({
    seconds: countdownSeconds,
    autoStart: false,
    onExpire: handleCapture,
  });

  // Manage camera streaming in live mode
  useEffect(() => {
    if (preview) return;
    startCamera();
    return () => {
      stopCamera();
    };
  }, [preview, startCamera, stopCamera]);

  // Sync countdown with prop or start when active
  useEffect(() => {
    if (preview) return;
    if (isCountingDown) {
      resetCountdown(countdownSeconds);
    } else {
      pauseCountdown();
    }
  }, [preview, isCountingDown, countdownSeconds, resetCountdown, pauseCountdown]);

  const activeError = cameraError || errorMsg;
  const takenCount = captures.length;
  const isPortrait = (slotWidth && slotHeight && slotHeight > slotWidth) || slotRatio < 1.0;


  const renderShotCount = () => (
    <div className="z-30 flex items-center select-none">
      <span className="font-['Arcade_Gamer','PressStart2P',monospace] text-white text-xl sm:text-2xl md:text-3xl font-bold tracking-wider drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
        {takenCount}/{totalSlots}
      </span>
    </div>
  );

  const renderTimer = () => (
    <div className="z-30 flex items-center justify-center select-none">
      <div
        className={`relative flex items-center justify-center size-16 sm:size-20 md:size-24 ${
          timeLeft > 0 && timeLeft <= 3 ? 'scale-125' : ''
        }`}
      >
        <svg className="size-full -rotate-90 transform" viewBox="0 0 64 64">
          <circle
            cx="32"
            cy="32"
            r="26"
            className="stroke-black/55"
            strokeWidth="4"
            fill="rgba(0,0,0,0.4)"
          />
          <circle
            cx="32"
            cy="32"
            r="26"
            className={`transition-all duration-300 ease-linear ${
              timeLeft <= 1 ? 'stroke-red-500' : timeLeft <= 3 ? 'stroke-amber-300' : 'stroke-white'
            }`}
            strokeWidth="4"
            strokeDasharray={163.36}
            strokeDashoffset={
              163.36 * (1 - Math.max(0, Math.min(1, timeLeft / (countdownSeconds || 5))))
            }
            strokeLinecap="round"
            fill="transparent"
          />
        </svg>
        <span className={`absolute font-['Arcade_Gamer','PressStart2P',monospace] text-lg sm:text-xl md:text-2xl font-bold drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] ${
          timeLeft <= 1 ? 'text-red-500' : timeLeft <= 3 ? 'text-amber-300' : 'text-white'
        }`}>
          {isCapturing ? '📸' : timeLeft}
        </span>
      </div>
    </div>
  );

  const renderSlots = (isCurrentIdx: number, isVertical = false) => (
    <div
      className={`z-30 flex items-center justify-center ${
        isVertical ? 'flex-col gap-2 sm:gap-2.5 md:gap-3' : 'gap-2 sm:gap-3 md:gap-3.5 max-w-full flex-wrap'
      } pointer-events-auto select-none`}
    >
      {Array.from({ length: totalSlots }).map((_, i) => {
        const slotNum = i + 1;
        const capture = captures?.find((c) => c.captureIndex === slotNum);
        const isCurrent = slotNum === isCurrentIdx;

        return (
          <div
            key={slotNum}
            className={`relative flex items-center justify-center rounded-xl overflow-hidden backdrop-blur-sm transition-all duration-200 shadow-xl ${
              totalSlots > 6
                ? 'size-10 sm:size-12 md:size-14'
                : 'size-14 sm:size-17 md:size-20'
            } ${
              isCurrent
                ? 'border-2 border-white ring-2 ring-white/70 bg-white/20 scale-105 shadow-[0_0_15px_rgba(255,255,255,0.4)]'
                : capture
                  ? 'border-2 border-white/80 bg-black/60'
                  : 'border-2 border-white/40 bg-black/50 opacity-80'
            }`}
          >
            {capture ? (
              <img
                src={capture.dataUrl}
                alt={`Photo ${slotNum}`}
                className="size-full object-cover"
              />
            ) : (
              <span
                className={`font-['Arcade_Gamer','PressStart2P',monospace] text-white ${
                  totalSlots > 6
                    ? 'text-xs sm:text-sm'
                    : 'text-sm sm:text-base md:text-lg'
                } ${isCurrent ? 'font-bold' : 'opacity-80'}`}
              >
                {slotNum}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );

  if (preview) {
    return (
      <div
        className="relative flex flex-col items-center justify-center w-full h-[100dvh] max-h-[100dvh] overflow-hidden p-4 md:p-6 text-white select-none"
        style={{
          backgroundImage: `url('/assets/images/bg-for-cam.svg')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      >
        {/* If Portrait: Render Count on Top-Left, Timer on Top-Right, and Slots on the LEFT side */}
        {isPortrait && (
          <>
            <div className="absolute top-5 left-5 sm:top-7 sm:left-8 z-30">
              {renderShotCount()}
            </div>
            <div className="absolute left-4 sm:left-6 md:left-8 top-20 sm:top-24 bottom-6 z-30 flex flex-col items-center justify-center pointer-events-none">
              {renderSlots(1, true)}
            </div>
            <div className="absolute top-5 left-1/2 -translate-x-1/2 sm:top-7 z-30">
              {renderTimer()}
            </div>
          </>
        )}

        <div
          className="relative overflow-hidden rounded-2xl md:rounded-3xl bg-black shadow-2xl border-2 border-black flex items-center justify-center"
          style={{
            aspectRatio: slotAspectRatio,
            maxHeight: 'calc(100dvh - 48px)',
            maxWidth: isPortrait ? 'calc(100vw - 160px)' : 'calc(100vw - 48px)',
            width: isPortrait
              ? `min(calc(100vw - 160px), calc((100dvh - 48px) * ${slotRatio}))`
              : `min(calc(100vw - 48px), calc((100dvh - 48px) * ${slotRatio}))`,
            height: isPortrait
              ? `min(calc(100dvh - 48px), calc((100vw - 160px) / ${slotRatio}))`
              : `min(calc(100dvh - 48px), calc((100vw - 48px) / ${slotRatio}))`,
          }}
        >
          {/* If Landscape: Render Count, Timer, and Slots INSIDE the camera frame */}
          {!isPortrait && (
            <>
              <div className="absolute top-4 left-5 sm:top-6 sm:left-7 z-20">
                {renderShotCount()}
              </div>
              <div className="absolute top-4 left-1/2 -translate-x-1/2 sm:top-6 z-20">
                {renderTimer()}
              </div>
              <div className="absolute bottom-4 left-0 right-0 z-20 flex items-center justify-center px-4 pointer-events-none">
                {renderSlots(1, false)}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative flex flex-col items-center justify-center w-full h-[100dvh] max-h-[100dvh] overflow-hidden p-4 md:p-6 text-white select-none"
      style={{
        backgroundImage: `url('/assets/images/bg-for-cam.svg')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* If Portrait: Render Count on Top-Left, Timer on Top-Right, and Slots on the LEFT side */}
      {isPortrait && (
        <>
          <div className="absolute top-5 left-5 sm:top-7 sm:left-8 z-30">
            {renderShotCount()}
          </div>
          <div className="absolute left-4 sm:left-6 md:left-8 top-20 sm:top-24 bottom-6 z-30 flex flex-col items-center justify-center pointer-events-none">
            {renderSlots(activeSlotIndex, true)}
          </div>
          <div className="absolute top-5 left-1/2 -translate-x-1/2 sm:top-7 z-30">
            {renderTimer()}
          </div>
        </>
      )}

      {/* Camera Viewport Container (Framed and centered with target aspect ratio) */}
      <div
        className="relative overflow-hidden rounded-2xl md:rounded-3xl bg-black shadow-2xl border-2 border-black flex items-center justify-center"
        style={{
          aspectRatio: slotAspectRatio,
          maxHeight: 'calc(100dvh - 48px)',
          maxWidth: isPortrait ? 'calc(100vw - 160px)' : 'calc(100vw - 48px)',
          width: isPortrait
            ? `min(calc(100vw - 160px), calc((100dvh - 48px) * ${slotRatio}))`
            : `min(calc(100vw - 48px), calc((100dvh - 48px) * ${slotRatio}))`,
          height: isPortrait
            ? `min(calc(100dvh - 48px), calc((100vw - 160px) / ${slotRatio}))`
            : `min(calc(100dvh - 48px), calc((100vw - 48px) / ${slotRatio}))`,
        }}
      >
        {/* Live Video Feed (Mirrored for photobooth selfie view) */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="size-full object-cover -scale-x-100"
        />

        {/* Low-opacity screen that says Get Ready! before taking photo / while camera initializes */}
        {!isActive && !activeError && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-xs text-center transition-opacity duration-300">
            <div className="flex flex-col items-center">
              <h3 className="font-['Arcade_Gamer','PressStart2P',monospace] text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white uppercase drop-shadow-2xl animate-pulse">
                Get Ready!
              </h3>
              <p className="mt-3 font-['Arcade_Gamer','PressStart2P',monospace] text-xs sm:text-sm md:text-base text-[#a8f3dd] tracking-wider uppercase">
                {isRetaking
                  ? `Retaking photo #${activeSlotIndex}`
                  : `Photo ${activeSlotIndex} of ${totalSlots}`}
              </p>
            </div>
          </div>
        )}

        {/* Shutter flash effect */}
        {flash && (
          <div className="absolute inset-0 z-50 bg-white opacity-90 pointer-events-none transition-opacity duration-200" />
        )}

        {/* If Landscape: Render Count, Timer, and Slots INSIDE the camera frame */}
        {!isPortrait && (
          <>
            <div className="absolute top-4 left-5 sm:top-6 sm:left-7 z-20">
              {renderShotCount()}
            </div>
            <div className="absolute top-4 left-1/2 -translate-x-1/2 sm:top-6 z-20">
              {renderTimer()}
            </div>
            <div className="absolute bottom-4 left-0 right-0 z-20 flex items-center justify-center px-4 pointer-events-none">
              {renderSlots(activeSlotIndex, false)}
            </div>
          </>
        )}

        {/* Top-Right Retaking Notification Pill */}
        {isRetaking && (
          <div className="absolute top-5 right-5 sm:top-7 sm:right-8 z-20 rounded-full bg-[#eab308]/90 px-5 py-2 text-xs sm:text-sm font-black text-black backdrop-blur-sm shadow-md uppercase tracking-wider font-['Arcade_Gamer','PressStart2P',monospace]">
            RETAKING #{activeSlotIndex}
          </div>
        )}

        {/* Error notification banner */}
        {activeError && (
          <div className="absolute inset-x-8 top-20 z-30 flex items-center justify-between rounded-xl bg-red-600/90 px-6 py-4 text-white backdrop-blur-md shadow-lg">
            <p className="text-sm font-semibold">{activeError}</p>
            <button
              type="button"
              onClick={() => {
                setErrorMsg(null);
                startCamera();
              }}
              className="rounded-lg bg-white px-4 py-1.5 text-xs font-bold text-red-700 hover:bg-white/90 transition"
            >
              Retry Camera
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
