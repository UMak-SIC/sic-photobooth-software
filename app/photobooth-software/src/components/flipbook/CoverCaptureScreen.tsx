import { useState, useEffect, useCallback } from 'react';
import { useFlipbookStore } from '../../store/flipbook-store';
import { useCamera } from '../../hooks/useCamera';
import { useCountdown } from '../../hooks/useCountdown';
import { boothApi } from '../../services/api';
import { FLIPBOOK_CONFIG } from '../../config/flipbook';

export function CoverCaptureScreen() {
  const { sessionId, coverUrls, addCoverCapture, setStep, errorMessage, setError, selectedFrame } =
    useFlipbookStore();
  const {
    videoRef,
    isActive,
    error: cameraError,
    startCamera,
    stopCamera,
    capturePhoto,
  } = useCamera();

  const currentCoverNum = coverUrls.length + 1; // 1, 2, 3
  const [isCapturing, setIsCapturing] = useState(false);
  const [flash, setFlash] = useState(false);

  const primarySlot = selectedFrame?.placements?.[0];
  const slotWidth = primarySlot?.width || 620;
  const slotHeight = primarySlot?.height || 348.75;
  const slotRatio = slotWidth / slotHeight;
  const slotAspectRatio = `${slotWidth} / ${slotHeight}`;

  // Trigger snapshot when countdown reaches 0
  const triggerCapture = useCallback(async () => {
    if (isCapturing || currentCoverNum > 3) return;
    setIsCapturing(true);
    setError(null);

    try {
      setFlash(true);
      setTimeout(() => setFlash(false), 200);

      const blob = await capturePhoto();
      addCoverCapture(blob);

      if (sessionId) {
        try {
          await boothApi.uploadCoverPhoto(sessionId, blob);
        } catch (uploadErr: unknown) {
          console.error('Failed to upload cover photo to backend:', uploadErr);
          const uploadMsg =
            uploadErr instanceof Error ? uploadErr.message : 'Failed to upload photo';
          setError(`Upload failed: ${uploadMsg}`);
          return;
        }
      }

      const updatedCount = useFlipbookStore.getState().coverUrls.length;
      if (updatedCount >= 3) {
        // Finished all 3 covers -> advance to video capture
        stopCamera();
        setStep('video_capture');
      } else {
        // Reset countdown for next cover
        resetCountdown(FLIPBOOK_CONFIG.coverPoseCountdownSeconds);
      }
    } catch (err: unknown) {
      console.error('Camera capture exception:', err);
      // Fallback synthetic photo if real frame capture fails
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 675;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#0f2923';
        ctx.fillRect(0, 0, 1200, 675);
        ctx.fillStyle = '#48c4a1';
        ctx.font = 'bold 48px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`FLIPBOOK COVER #${currentCoverNum}`, 600, 320);
      }
      canvas.toBlob((fallbackBlob) => {
        if (fallbackBlob) {
          addCoverCapture(fallbackBlob);
          const updatedCount = useFlipbookStore.getState().coverUrls.length;
          if (updatedCount >= 3) {
            stopCamera();
            setStep('video_capture');
          } else {
            resetCountdown(FLIPBOOK_CONFIG.coverPoseCountdownSeconds);
          }
        }
      }, 'image/jpeg', 0.95);
    } finally {
      setIsCapturing(false);
    }
  }, [
    isCapturing,
    currentCoverNum,
    capturePhoto,
    addCoverCapture,
    sessionId,
    stopCamera,
    setStep,
    setError,
  ]);

  const {
    timeLeft,
    reset: resetCountdown,
    pause: pauseCountdown,
  } = useCountdown({
    seconds: FLIPBOOK_CONFIG.coverPoseCountdownSeconds,
    autoStart: false,
    onExpire: triggerCapture,
  });

  useEffect(() => {
    setError(null);
    startCamera();
    return () => {
      stopCamera();
    };
  }, [startCamera, stopCamera, setError]);

  const activeError = cameraError || errorMessage;
  // Start countdown only once camera feed is confirmed active on initial mount
  useEffect(() => {
    if (isActive && !activeError && !isCapturing && coverUrls.length === 0) {
      resetCountdown(FLIPBOOK_CONFIG.coverPoseCountdownSeconds);
    } else if (activeError) {
      pauseCountdown();
    }
  }, [isActive, activeError, isCapturing, coverUrls.length, resetCountdown, pauseCountdown]);

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
      {/* Camera Viewport Container matching CameraViewfinder */}
      <div
        className="relative overflow-hidden rounded-2xl md:rounded-3xl bg-black shadow-2xl border-2 border-black flex items-center justify-center"
        style={{
          aspectRatio: slotAspectRatio,
          maxHeight: 'calc(100dvh - 48px)',
          maxWidth: 'calc(100vw - 48px)',
          width: `min(calc(100vw - 48px), calc((100dvh - 48px) * ${slotRatio}))`,
          height: `min(calc(100dvh - 48px), calc((100vw - 48px) / ${slotRatio}))`,
        }}
      >
        {/* Live Video Feed (Mirrored) */}
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
                Cover photo {currentCoverNum} of 3
              </p>
            </div>
          </div>
        )}

        {/* Shutter flash effect */}
        {flash && (
          <div className="absolute inset-0 z-50 bg-white opacity-90 pointer-events-none transition-opacity duration-200" />
        )}

        {/* Top-Left: Mode Label in Arcade Gamer font */}
        <div className="absolute top-4 left-5 sm:top-6 sm:left-7 z-20">
          <div className="z-30 flex items-center select-none">
            <span className="font-['Arcade_Gamer','PressStart2P',monospace] text-white text-sm sm:text-base md:text-lg font-bold tracking-wider drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
              Cover Photo
            </span>
          </div>
        </div>

        {/* Top-Center: Circular Countdown Timer with SVG Ring */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 sm:top-6 z-20">
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
                    163.36 *
                    (1 -
                      Math.max(
                        0,
                        Math.min(
                          1,
                          timeLeft / (FLIPBOOK_CONFIG.coverPoseCountdownSeconds || 5),
                        ),
                      ))
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
        </div>

        {/* Bottom: 3 Slot Cards */}
        <div className="absolute bottom-4 left-0 right-0 z-20 flex items-center justify-center px-4 pointer-events-none">
          <div className="z-30 flex items-center justify-center gap-2 sm:gap-3 md:gap-3.5 max-w-full flex-wrap pointer-events-auto select-none">
            {Array.from({ length: 3 }).map((_, i) => {
              const slotNum = i + 1;
              const captureUrl = coverUrls[i];
              const isCurrent = slotNum === currentCoverNum;

              return (
                <div
                  key={slotNum}
                  className={`relative flex items-center justify-center rounded-xl overflow-hidden backdrop-blur-sm transition-all duration-200 shadow-xl size-14 sm:size-17 md:size-20 ${
                    isCurrent
                      ? 'border-2 border-white ring-2 ring-white/70 bg-white/20 scale-105 shadow-[0_0_15px_rgba(255,255,255,0.4)]'
                      : captureUrl
                        ? 'border-2 border-white/80 bg-black/60'
                        : 'border-2 border-white/40 bg-black/50 opacity-80'
                  }`}
                >
                  {captureUrl ? (
                    <img
                      src={captureUrl}
                      alt={`Cover ${slotNum}`}
                      className="size-full object-cover"
                    />
                  ) : (
                    <span
                      className={`font-['Arcade_Gamer','PressStart2P',monospace] text-white text-sm sm:text-base md:text-lg ${
                        isCurrent ? 'font-bold' : 'opacity-80'
                      }`}
                    >
                      {slotNum}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Error notification banner */}
        {activeError && (
          <div className="absolute inset-x-8 top-20 z-30 flex items-center justify-between rounded-xl bg-red-600/90 px-6 py-4 text-white backdrop-blur-md shadow-lg">
            <p className="text-sm font-semibold">{activeError}</p>
            <button
              type="button"
              onClick={() => {
                setError(null);
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
}

