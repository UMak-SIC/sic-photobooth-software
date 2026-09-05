import { useState, useEffect, useCallback } from 'react';
import { useFlipbookStore } from '../../store/flipbook-store';
import { useCamera } from '../../hooks/useCamera';
import { useCountdown } from '../../hooks/useCountdown';
import { boothApi } from '../../services/api';
import { FLIPBOOK_CONFIG } from '../../config/flipbook';

export function CoverCaptureScreen() {
  const { sessionId, coverUrls, addCoverCapture, setStep, errorMessage, setError } =
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
      const msg =
        err instanceof Error
          ? err.message
          : 'Camera capture failed. Check the camera feed and retake this photo.';
      setError(msg);
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
    formattedSS,
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
    <div className="relative w-full min-h-[calc(100vh-77px)] h-full overflow-hidden bg-[#071d1a] text-white">
      {/* Video Feed */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 size-full object-cover"
      />

      {/* Camera Scene Vignette */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,27,22,.35)_0%,transparent_30%,transparent_70%,rgba(3,27,22,.55)_100%)] pointer-events-none" />

      {/* Flash Effect */}
      {flash && (
        <div className="absolute inset-0 bg-white opacity-80 transition-opacity pointer-events-none" />
      )}

      {/* Top Camera Status */}
      <div className="absolute left-9 top-8 flex items-center gap-3">
        <div className="rounded-full bg-black/40 px-4 py-2 text-[12px] font-bold backdrop-blur-sm">
          CAMERA 01
        </div>
      </div>

      {/* Error Alert Banner */}
      {activeError && (
        <div className="absolute inset-x-8 top-20 z-20 flex items-center justify-between rounded-xl bg-[#b91c1c]/90 px-6 py-4 text-white backdrop-blur-md shadow-lg">
          <div className="flex items-center gap-3">
            <span className="font-bold text-lg">⚠️</span>
            <p className="text-sm font-semibold">{activeError}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setError(null);
              startCamera();
            }}
            className="rounded-lg bg-white px-4 py-1.5 text-xs font-bold text-[#b91c1c] hover:bg-white/90 transition"
          >
            Retry Capture
          </button>
        </div>
      )}

      {/* Bottom Overlays */}
      <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between p-8">
        {/* Countdown Box */}
        <div className="backdrop-blur-md rounded-2xl bg-black/40 border border-white/10 px-7 py-5">
          <p className="text-[12px] font-bold tracking-wide text-[#a8f3dd]">COVER PHOTO</p>
          <div className="mt-2 min-h-[56px] flex items-center">
            {!isActive && !activeError ? (
              <span className="inline-flex items-center gap-2.5 py-3">
                <span className="size-3.5 rounded-full bg-[#a8f3dd] animate-bounce [animation-delay:-0.3s]" />
                <span className="size-3.5 rounded-full bg-[#a8f3dd] animate-bounce [animation-delay:-0.15s]" />
                <span className="size-3.5 rounded-full bg-[#a8f3dd] animate-bounce" />
              </span>
            ) : isCapturing ? (
              <span className="text-[56px] font-black leading-none tracking-[-0.07em]">📸</span>
            ) : (
              <span className="text-[56px] font-black leading-none tracking-[-0.07em]">
                {formattedSS}
              </span>
            )}
          </div>
          <p className="mt-2 text-[14px] text-[#c5eee1]">
            {!isActive && !activeError
              ? 'Starting camera feed...'
              : isCapturing
                ? 'Capturing...'
                : `${timeLeft} seconds to pose`}
          </p>
        </div>

        {/* Center Pill */}
        <div className="backdrop-blur-md rounded-full bg-black/40 border border-white/10 px-7 py-3 text-[17px] font-black tracking-wide">
          COVER {currentCoverNum} OF 3
        </div>

        {/* Progress Dots */}
        <div className="backdrop-blur-md rounded-2xl bg-black/40 border border-white/10 px-6 py-5">
          <div className="flex gap-2.5">
            {[1, 2, 3].map((num) => {
              const isDone = num < currentCoverNum;
              const isCurrent = num === currentCoverNum;
              return (
                <span
                  key={num}
                  className={`grid size-9 place-items-center rounded-full text-[13px] font-black transition ${
                    isDone
                      ? 'bg-[#a8f3dd] text-[#145142]'
                      : isCurrent
                        ? 'bg-[#146a56] text-[#a8f3dd] ring-2 ring-[#a8f3dd]'
                        : 'bg-white/20 text-white/70'
                  }`}
                >
                  {isDone ? '✓' : num}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
