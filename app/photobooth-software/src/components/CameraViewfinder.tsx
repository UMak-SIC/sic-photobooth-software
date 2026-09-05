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
  onCountdownComplete?: (blob: Blob) => void;
  onCancelCountdown?: () => void;
}

export const CameraViewfinder: React.FC<CameraViewfinderProps> = ({
  countdownSeconds = 5,
  isCountingDown = false,
  activeSlotIndex = 2,
  totalSlots = 3,
  isRetaking = false,
  preview = false,
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
    formattedSS,
    isRunning,
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

  if (preview) {
    return (
      <div className="artboard relative h-full min-h-[780px] w-full overflow-hidden bg-[#071d1a] text-white">
        <div className="absolute inset-0 bg-[#071d1a]">
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,27,22,.35)_0%,transparent_30%,transparent_70%,rgba(3,27,22,.55)_100%)]" />
          <div className="absolute left-9 top-8 rounded-full bg-black/30 px-4 py-2 text-[12px] font-bold text-white backdrop-blur-sm">
            CAMERA 01
          </div>
        </div>
        {/* Low opacity Get Ready screen */}
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/40 backdrop-blur-xs text-center">
          <h3 className="text-[52px] md:text-[68px] font-black tracking-tight text-white uppercase drop-shadow-2xl animate-pulse">
            Get Ready!
          </h3>
          <p className="mt-2 text-[15px] font-bold text-[#a8f3dd] tracking-wider uppercase">
            Hold your pose
          </p>
        </div>
        <div className="absolute bottom-0 left-0 right-0 z-20 flex items-end justify-between p-8">
          <div className="backdrop-blur-md rounded-2xl bg-black/30 px-7 py-5 text-white">
            <p className="text-[12px] font-bold tracking-wide text-[#a8f3dd]">NEXT CAPTURE</p>
            <p className="mt-2 text-[56px] font-black leading-none tracking-[-0.07em]">05</p>
            <p className="mt-2 text-[14px] text-[#c5eee1]">Hold your pose. Auto-capture.</p>
          </div>
          <div className="backdrop-blur-md rounded-full bg-black/30 px-7 py-3 text-[17px] font-black text-white">
            GET READY
          </div>
          <div className="backdrop-blur-md rounded-2xl bg-black/30 px-6 py-5 text-white">
            <div className="flex gap-2">
              <span className="size-3.5 rounded-full bg-[#a8f3dd]" />
              <span className="size-3.5 rounded-full bg-[#a8f3dd]" />
              <span className="size-3.5 rounded-full bg-white/40" />
            </div>
            <p className="mt-2 text-[13px] text-[#c5eee1]">2 of 3</p>
          </div>
        </div>
      </div>
    );
  }

  const activeError = cameraError || errorMsg;

  return (
    <div className="artboard relative flex h-full min-h-[780px] w-full flex-col items-center justify-center overflow-hidden bg-[#071d1a] text-white">
      {/* Live Video Feed */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 size-full object-cover -scale-x-100"
      />

      {/* Low-opacity screen that says Get Ready! before taking photo / while camera initializes or gets ready */}
      {(!isActive && !activeError) && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/50 backdrop-blur-xs text-center transition-opacity duration-300">
          <div className="flex flex-col items-center">
            <h3 className="text-[52px] md:text-[68px] font-black tracking-tight text-white uppercase drop-shadow-2xl animate-pulse">
              Get Ready!
            </h3>
            <p className="mt-2 text-[15px] font-bold text-[#a8f3dd] tracking-wider uppercase">
              {isRetaking ? `Retaking photo #${activeSlotIndex}` : `Photo ${activeSlotIndex} of ${totalSlots}`}
            </p>
          </div>
        </div>
      )}

      {/* Subtle Scene Vignette */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,27,22,.35)_0%,transparent_30%,transparent_70%,rgba(3,27,22,.55)_100%)] pointer-events-none" />

      {/* Shutter flash effect */}
      {flash && (
        <div className="absolute inset-0 z-50 bg-white opacity-85 pointer-events-none transition-opacity duration-200" />
      )}

      {/* Camera Header Badge */}
      <div className="absolute left-9 top-8 z-10 flex items-center gap-3">
        <div className="rounded-full bg-black/30 px-4 py-2 text-[12px] font-bold text-white backdrop-blur-sm border border-white/10">
          CAMERA 01
        </div>
        {isRetaking && (
          <div className="rounded-full bg-[#eab308]/80 px-4 py-2 text-[12px] font-bold text-black backdrop-blur-sm">
            RETAKING PHOTO #{activeSlotIndex}
          </div>
        )}
      </div>

      {/* Error notification banner */}
      {activeError && (
        <div className="absolute inset-x-8 top-20 z-20 flex items-center justify-between rounded-xl bg-red-600/90 px-6 py-4 text-white backdrop-blur-md shadow-lg">
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

      {/* Bottom HUD matching design sheet */}
      <div className="absolute bottom-0 left-0 right-0 z-10 flex items-end justify-between p-8">
        {/* Next Capture Timer Card */}
        <div className="backdrop-blur-md rounded-2xl bg-black/30 border border-white/10 px-7 py-5 text-white shadow-xl">
          <p className="text-[12px] font-bold tracking-wide text-[#a8f3dd]">NEXT CAPTURE</p>
          <div className="mt-2 min-h-[56px] flex items-center">
            {isCapturing ? (
              <span className="text-[56px] font-black leading-none tracking-[-0.07em]">📸</span>
            ) : isRunning ? (
              <span className="text-[56px] font-black leading-none tracking-[-0.07em]">
                {formattedSS}
              </span>
            ) : (
              <span className="text-[56px] font-black leading-none tracking-[-0.07em]">
                {String(countdownSeconds).padStart(2, '0')}
              </span>
            )}
          </div>
          <p className="mt-2 text-[14px] text-[#c5eee1]">Hold your pose. Auto-capture.</p>
        </div>

        {/* Center Pill */}
        <div className="backdrop-blur-md rounded-full bg-black/30 border border-white/10 px-7 py-3 text-[17px] font-black text-white shadow-xl tracking-wide">
          {isCapturing
            ? 'CAPTURING...'
            : isRunning
              ? 'GET READY'
              : isRetaking
                ? `RETAKE PHOTO ${activeSlotIndex}`
                : `PHOTO ${activeSlotIndex} OF ${totalSlots}`}
        </div>

        {/* Right Slots Counter & Progress Dots */}
        <div className="backdrop-blur-md rounded-2xl bg-black/30 border border-white/10 px-6 py-5 text-white shadow-xl">
          <div className="flex gap-2">
            {Array.from({ length: totalSlots }).map((_, i) => {
              const slotNum = i + 1;
              const isFilled = slotNum <= activeSlotIndex;
              return (
                <span
                  key={slotNum}
                  className={`size-3.5 rounded-full transition ${
                    isFilled ? 'bg-[#a8f3dd]' : 'bg-white/40'
                  }`}
                />
              );
            })}
          </div>
          <p className="mt-2 text-[13px] text-[#c5eee1]">
            {activeSlotIndex} of {totalSlots}
          </p>
        </div>
      </div>
    </div>
  );
};
