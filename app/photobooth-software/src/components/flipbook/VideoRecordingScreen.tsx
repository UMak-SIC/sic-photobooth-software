import { useState, useEffect, useCallback, useRef } from 'react';
import { useFlipbookStore } from '../../store/flipbook-store';
import { useCamera } from '../../hooks/useCamera';
import { useCountdown } from '../../hooks/useCountdown';
import { boothApi } from '../../services/api';
import { FLIPBOOK_CONFIG } from '../../config/flipbook';

function formatElapsed(seconds: number): string {
  const totalMs = Math.floor(seconds * 1000);
  const m = Math.floor(totalMs / 60000);
  const s = Math.floor((totalMs % 60000) / 1000);
  const ms = Math.floor((totalMs % 1000) / 10);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  const msStr = String(ms).padStart(2, '0');
  return `${mm}:${ss}.${msStr}`;
}

export function VideoRecordingScreen() {
  const { sessionId, videoUrls, addVideoCapture, setStep, errorMessage, setError } =
    useFlipbookStore();
  const {
    videoRef,
    isActive,
    error: cameraError,
    startCamera,
    stopCamera,
    recordVideoClip,
  } = useCamera();

  const currentVideoNum = videoUrls.length + 1; // 1, 2, 3
  const [phase, setPhase] = useState<'countdown' | 'recording' | 'uploading'>('countdown');
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start video recording when countdown finishes
  const handleCountdownExpire = useCallback(async () => {
    if (phase !== 'countdown') return;
    setPhase('recording');
    setRecordingElapsed(0);

    const sampledFrames: string[] = [];
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = 1280;
    sampleCanvas.height = 700;
    const sampleCtx = sampleCanvas.getContext('2d');

    // Track elapsed recording time in 50ms intervals
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    const startTime = Date.now();
    timerIntervalRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      setRecordingElapsed(Math.min(elapsed, FLIPBOOK_CONFIG.videoRecordingDurationSeconds));
    }, 50);

    // Sample 19 discrete video motion frames during recording (every ~263ms across 5.0s)
    const sampleIntervalMs = Math.round(
      (FLIPBOOK_CONFIG.videoRecordingDurationSeconds * 1000) / 19,
    );
    const frameSampleInterval = setInterval(() => {
      if (videoRef.current && sampleCtx && sampledFrames.length < 19) {
        const video = videoRef.current;
        const vWidth = video.videoWidth > 0 ? video.videoWidth : 1280;
        const vHeight = video.videoHeight > 0 ? video.videoHeight : 720;
        const targetRatio = 2.41 / 1.32;
        const sourceRatio = vWidth / vHeight;

        let sx = 0;
        let sy = 0;
        let sw = vWidth;
        let sh = vHeight;

        if (sourceRatio > targetRatio) {
          sw = vHeight * targetRatio;
          sx = (vWidth - sw) / 2;
        } else {
          sh = vWidth / targetRatio;
          sy = (vHeight - sh) / 2;
        }

        try {
          sampleCtx.drawImage(video, sx, sy, sw, sh, 0, 0, sampleCanvas.width, sampleCanvas.height);
          sampledFrames.push(sampleCanvas.toDataURL('image/jpeg', 0.95));
        } catch {
          // ignore sample error
        }
      }
    }, sampleIntervalMs);

    try {
      const blob = await recordVideoClip(FLIPBOOK_CONFIG.videoRecordingDurationSeconds);
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      clearInterval(frameSampleInterval);

      setPhase('uploading');
      addVideoCapture(blob, sampledFrames);

      if (sessionId) {
        try {
          await boothApi.uploadVideoClip(sessionId, blob);
        } catch (uploadErr: unknown) {
          console.error('Failed to upload video clip to backend:', uploadErr);
          const uploadMsg =
            uploadErr instanceof Error ? uploadErr.message : 'Failed to upload video';
          setError(`Upload failed: ${uploadMsg}`);
          setPhase('countdown');
          setRecordingElapsed(0);
          return;
        }
      }

      const updatedCount = useFlipbookStore.getState().videoUrls.length;
      if (updatedCount >= 3) {
        // Finished all 3 videos -> advance to review
        stopCamera();
        setStep('review_cover');
      } else {
        // Prepare next video recording countdown
        setRecordingElapsed(0);
        setPhase('countdown');
      }
    } catch (err: unknown) {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      console.error('Video recording exception:', err);
      const msg =
        err instanceof Error
          ? err.message
          : 'Camera capture failed. Check the camera feed and retake this photo.';
      setError(msg);
      setRecordingElapsed(0);
      setPhase('countdown');
    }
  }, [
    phase,
    recordVideoClip,
    addVideoCapture,
    sessionId,
    currentVideoNum,
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
    seconds: FLIPBOOK_CONFIG.videoPoseCountdownSeconds,
    autoStart: false,
    onExpire: handleCountdownExpire,
  });

  useEffect(() => {
    setError(null);
    startCamera();
    return () => {
      stopCamera();
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [startCamera, stopCamera, setError]);

  const activeError = cameraError || errorMessage;

  // Start countdown only once camera feed is confirmed active
  useEffect(() => {
    if (isActive && !activeError && phase === 'countdown') {
      resetCountdown(FLIPBOOK_CONFIG.videoPoseCountdownSeconds);
    } else if (activeError) {
      pauseCountdown();
    }
  }, [isActive, activeError, phase, resetCountdown, pauseCountdown]);

  const progressPercent = Math.min(
    (recordingElapsed / FLIPBOOK_CONFIG.videoRecordingDurationSeconds) * 100,
    100,
  );
  const remainingWholeSeconds = Math.max(
    0,
    Math.ceil(FLIPBOOK_CONFIG.videoRecordingDurationSeconds - recordingElapsed),
  );

  return (
    <div className="relative h-full min-h-[100dvh] w-full overflow-hidden bg-[#071d1a] text-white">
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

      {/* Top Badges */}
      <div className="absolute left-9 top-8 flex items-center gap-3">
        <div className="rounded-full bg-black/40 px-4 py-2 text-[12px] font-bold backdrop-blur-sm">
          CAMERA 01
        </div>
      </div>

      {phase === 'recording' && (
        <div className="absolute right-9 top-8 flex items-center gap-2 rounded-full bg-[#c2433f] px-5 py-2.5 text-[12px] font-bold text-white backdrop-blur-sm animate-pulse">
          <span className="size-2.5 rounded-full bg-white" /> RECORDING
        </div>
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
              setRecordingElapsed(0);
              setPhase('countdown');
            }}
            className="rounded-xl bg-white px-4 py-2 text-xs font-bold text-[#b91c1c] hover:bg-white/90 transition shadow"
          >
            Retry Recording
          </button>
        </div>
      )}

      {/* Camera Viewport Container (Full window width with proper margin & aspect ratio 2.41 / 1.32) */}
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

        {phase === 'recording' && (
          <div className="absolute right-9 top-8 flex items-center gap-2 rounded-full bg-[#c2433f] px-4 py-2 text-[12px] font-bold text-white backdrop-blur-sm border border-red-400/40 animate-pulse">
            <span className="size-2 rounded-full bg-white" /> RECORDING
          </div>
        )}

        {/* Bottom Overlays */}
        <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between p-8 pointer-events-none">
          {/* Left Countdown / Recording Box */}
          <div className="backdrop-blur-md rounded-2xl bg-black/40 border border-white/10 px-7 py-5 text-white pointer-events-auto min-w-[200px]">
            <p className="text-[12px] font-bold tracking-wide text-[#a8f3dd]">
              {phase === 'recording' ? `RECORDING ${currentVideoNum}` : 'GET READY'}
            </p>
            <div className="mt-2 min-h-[56px] flex items-center">
              {!isActive && !activeError ? (
                <span className="inline-flex items-center gap-2.5 py-3">
                  <span className="size-3.5 rounded-full bg-[#a8f3dd] animate-bounce [animation-delay:-0.3s]" />
                  <span className="size-3.5 rounded-full bg-[#a8f3dd] animate-bounce [animation-delay:-0.15s]" />
                  <span className="size-3.5 rounded-full bg-[#a8f3dd] animate-bounce" />
                </span>
              ) : phase === 'recording' ? (
                <p className="text-[56px] font-black leading-none tracking-[-0.07em]">
                  {remainingWholeSeconds}s
                </p>
              ) : phase === 'uploading' ? (
                <span className="inline-flex items-center gap-2.5 py-3">
                  <span className="size-3.5 rounded-full bg-[#a8f3dd] animate-bounce [animation-delay:-0.3s]" />
                  <span className="size-3.5 rounded-full bg-[#a8f3dd] animate-bounce [animation-delay:-0.15s]" />
                  <span className="size-3.5 rounded-full bg-[#a8f3dd] animate-bounce" />
                </span>
              ) : (
                <p className="text-[56px] font-black leading-none tracking-[-0.07em]">
                  {formattedSS}
                </p>
              )}
            </div>

            {phase === 'recording' ? (
              <div className="mt-3 h-1.5 w-40 overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-full bg-[#a8f3dd] transition-all duration-100"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            ) : (
              <p className="mt-2 text-[14px] text-[#c5eee1]">
                {!isActive && !activeError
                  ? 'Starting camera feed...'
                  : phase === 'uploading'
                    ? 'Saving video...'
                    : `${timeLeft}s to recording`}
              </p>
            )}
          </div>

          {/* Center Pill */}
          <div className="backdrop-blur-md rounded-full bg-black/40 border border-white/10 px-7 py-3 text-[17px] font-mono font-black text-white pointer-events-auto">
            {formatElapsed(recordingElapsed)}
          </div>

          {/* Right Progress Indicators */}
          <div className="backdrop-blur-md rounded-2xl bg-black/40 border border-white/10 px-6 py-5 text-white pointer-events-auto">
            <p className="text-[13px] text-[#c5eee1]">Stops automatically</p>
            <div className="mt-2 flex gap-2">
              {[1, 2, 3].map((num) => {
                const isDone = num < currentVideoNum;
                const isCurrent = num === currentVideoNum;
                return (
                  <span
                    key={num}
                    className={`size-3.5 rounded-full transition ${
                      isDone
                        ? 'bg-[#a8f3dd]'
                        : isCurrent && phase === 'recording'
                          ? 'bg-[#ef4444] animate-ping'
                          : isCurrent
                            ? 'bg-[#a8f3dd]'
                            : 'bg-white/40'
                    }`}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
