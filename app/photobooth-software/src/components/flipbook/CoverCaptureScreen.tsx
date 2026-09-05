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
    <div className="relative flex flex-col items-center justify-center w-full min-h-[100dvh] h-full overflow-hidden bg-[#071d1a] p-4 md:p-8 text-white">
      {/* Flash Effect */}
      {flash && (
        <div className="absolute inset-0 bg-white opacity-90 transition-opacity pointer-events-none z-50" />
      )}

      {/* Error Alert Banner */}
      {activeError && (
        <div className="absolute top-6 inset-x-8 z-30 mx-auto flex max-w-4xl items-center justify-between rounded-2xl bg-[#b91c1c]/95 px-6 py-4 text-white backdrop-blur-md shadow-2xl">
          <div className="flex items-center gap-3">
            <svg
              className="size-6 text-white shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <p className="text-sm font-semibold">{activeError}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setError(null);
              startCamera();
            }}
            className="rounded-xl bg-white px-4 py-2 text-xs font-bold text-[#b91c1c] hover:bg-white/90 transition shadow"
          >
            Retry Capture
          </button>
        </div>
      )}

      {/* Camera Viewport Container (Centered with proper aspect ratio 2.41 / 1.32) */}
      <div className="relative w-full max-w-[1600px] aspect-[241/132] max-h-[calc(100vh-120px)] overflow-hidden rounded-3xl bg-black shadow-2xl border border-white/10">
        {/* Live Camera Video Feed */}
        <video ref={videoRef} autoPlay playsInline muted className="size-full object-cover" />

        {/* Camera Scene Vignette */}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,27,22,.35)_0%,transparent_30%,transparent_70%,rgba(3,27,22,.55)_100%)] pointer-events-none" />

        {/* Top Badges */}
        <div className="absolute left-9 top-8 flex items-center gap-3">
          <div className="rounded-full bg-black/40 px-4 py-2 text-[12px] font-bold text-white backdrop-blur-sm border border-white/10">
            CAMERA 01
          </div>
          <div className="rounded-full bg-[#145a49]/70 px-4 py-2 text-[12px] font-bold text-[#a8f3dd] backdrop-blur-sm border border-[#a8f3dd]/30">
            2.41&quot; × 1.32&quot;
          </div>
        </div>

        {/* Bottom Overlays */}
        <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between p-8 pointer-events-none">
          {/* Left Countdown Box */}
          <div className="backdrop-blur-md rounded-2xl bg-black/40 border border-white/10 px-7 py-5 text-white pointer-events-auto min-w-[200px]">
            <p className="text-[12px] font-bold tracking-wide text-[#a8f3dd]">COVER PHOTO</p>
            <div className="mt-2 min-h-[56px] flex items-center">
              {!isActive && !activeError ? (
                <span className="inline-flex items-center gap-2.5 py-3">
                  <span className="size-3.5 rounded-full bg-[#a8f3dd] animate-bounce [animation-delay:-0.3s]" />
                  <span className="size-3.5 rounded-full bg-[#a8f3dd] animate-bounce [animation-delay:-0.15s]" />
                  <span className="size-3.5 rounded-full bg-[#a8f3dd] animate-bounce" />
                </span>
              ) : isCapturing ? (
                <span className="rounded-xl bg-[#a8f3dd] px-3 py-1.5 text-xs font-black text-[#0e473d] animate-pulse">
                  CAPTURING
                </span>
              ) : (
                <p className="text-[56px] font-black leading-none tracking-[-0.07em]">
                  {formattedSS}
                </p>
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
          <div className="backdrop-blur-md rounded-full bg-black/40 border border-white/10 px-7 py-3 text-[17px] font-black text-white pointer-events-auto">
            COVER {currentCoverNum} OF 3
          </div>

          {/* Right Progress Dots */}
          <div className="backdrop-blur-md rounded-2xl bg-black/40 border border-white/10 px-6 py-5 text-white pointer-events-auto">
            <div className="flex gap-2">
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
                    {isDone ? (
                      <svg
                        className="size-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={3}
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      num
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
