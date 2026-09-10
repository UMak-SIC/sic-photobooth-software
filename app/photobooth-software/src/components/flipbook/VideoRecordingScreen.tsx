import { useState, useEffect, useCallback, useRef } from 'react';
import { useFlipbookStore } from '../../store/flipbook-store';
import { useCamera } from '../../hooks/useCamera';
import { useCountdown } from '../../hooks/useCountdown';
import { boothApi } from '../../services/api';
import { FLIPBOOK_CONFIG } from '../../config/flipbook';
import { LoopingMotionPreview } from './LoopingMotionPreview';

export function VideoRecordingScreen() {
  const {
    sessionId,
    videoUrls,
    videoFrames,
    addVideoCapture,
    setStep,
    errorMessage,
    setError,
    selectedFrame,
  } = useFlipbookStore();
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

  const primarySlot = selectedFrame?.placements?.[0];
  const slotWidth = primarySlot?.width || 620;
  const slotHeight = primarySlot?.height || 348.75;
  const slotRatio = slotWidth / slotHeight;
  const slotAspectRatio = `${slotWidth} / ${slotHeight}`;

  // Start video recording when countdown finishes
  const handleCountdownExpire = useCallback(async () => {
    if (phase !== 'countdown') return;
    setPhase('recording');
    setRecordingElapsed(0);

    const sampledFrames: string[] = [];
    const sampleCanvas = document.createElement('canvas');
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
        if (sampleCanvas.width !== vWidth || sampleCanvas.height !== vHeight) {
          sampleCanvas.width = vWidth;
          sampleCanvas.height = vHeight;
        }

        try {
          sampleCtx.drawImage(video, 0, 0, vWidth, vHeight);
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
      // Fallback synthetic video blob if physical recording fails
      const fallbackBlob = new Blob(['mock-video-clip'], { type: 'video/webm' });
      addVideoCapture(fallbackBlob, sampledFrames.length > 0 ? sampledFrames : []);
      const updatedCount = useFlipbookStore.getState().videoUrls.length;
      if (updatedCount >= 3) {
        stopCamera();
        setStep('review_cover');
      } else {
        setRecordingElapsed(0);
        setPhase('countdown');
      }
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

  const remainingWholeSeconds = Math.max(
    0,
    Math.ceil(FLIPBOOK_CONFIG.videoRecordingDurationSeconds - recordingElapsed),
  );

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

        {/* Low-opacity screen that says Get Ready! before taking video / while camera initializes */}
        {!isActive && !activeError && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-xs text-center transition-opacity duration-300">
            <div className="flex flex-col items-center">
              <h3 className="font-['Arcade_Gamer','PressStart2P',monospace] text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white uppercase drop-shadow-2xl animate-pulse">
                Get Ready!
              </h3>
              <p className="mt-3 font-['Arcade_Gamer','PressStart2P',monospace] text-xs sm:text-sm md:text-base text-[#a8f3dd] tracking-wider uppercase">
                Video clip {currentVideoNum} of 3
              </p>
            </div>
          </div>
        )}

        {/* Top-Left: Mode Label in Arcade Gamer font */}
        <div className="absolute top-4 left-5 sm:top-6 sm:left-7 z-20">
          <div className="z-30 flex items-center select-none">
            <span className="font-['Arcade_Gamer','PressStart2P',monospace] text-white text-sm sm:text-base md:text-lg font-bold tracking-wider drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
              Video
            </span>
          </div>
        </div>

        {/* Top-Right: Recording Indicator Badge */}
        {phase === 'recording' && (
          <div className="absolute top-4 right-5 sm:top-6 sm:right-7 z-20 rounded-full bg-red-600/90 px-5 py-1.5 text-xs sm:text-sm font-bold text-white backdrop-blur-sm shadow-md uppercase tracking-wider font-['Arcade_Gamer','PressStart2P',monospace] flex items-center gap-2 animate-pulse">
            <span className="size-2.5 rounded-full bg-white animate-ping" />
            <span>RECORDING</span>
          </div>
        )}

        {/* Top-Center: Circular Timer (Countdown or Recording Ring) */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 sm:top-6 z-20">
          <div className="z-30 flex items-center justify-center select-none">
            <div
              className={`relative flex items-center justify-center size-16 sm:size-20 md:size-24 ${
                phase === 'countdown' && timeLeft > 0 && timeLeft <= 3 ? 'scale-125' : ''
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
                    phase === 'recording'
                      ? 'stroke-red-500'
                      : timeLeft <= 1
                        ? 'stroke-red-500'
                        : timeLeft <= 3
                          ? 'stroke-amber-300'
                          : 'stroke-white'
                  }`}
                  strokeWidth="4"
                  strokeDasharray={163.36}
                  strokeDashoffset={
                    phase === 'recording'
                      ? 163.36 *
                        (1 -
                          Math.max(
                            0,
                            Math.min(
                              1,
                              (FLIPBOOK_CONFIG.videoRecordingDurationSeconds - recordingElapsed) /
                                (FLIPBOOK_CONFIG.videoRecordingDurationSeconds || 5),
                            ),
                          ))
                      : 163.36 *
                        (1 -
                          Math.max(
                            0,
                            Math.min(
                              1,
                              timeLeft / (FLIPBOOK_CONFIG.videoPoseCountdownSeconds || 5),
                            ),
                          ))
                  }
                  strokeLinecap="round"
                  fill="transparent"
                />
              </svg>
              <span className={`absolute font-['Arcade_Gamer','PressStart2P',monospace] text-lg sm:text-xl md:text-2xl font-bold drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] ${
                phase === 'recording'
                  ? 'text-red-500'
                  : timeLeft <= 1
                    ? 'text-red-500'
                    : timeLeft <= 3
                      ? 'text-amber-300'
                      : 'text-white'
              }`}>
                {phase === 'recording'
                  ? `${remainingWholeSeconds}`
                  : phase === 'uploading'
                    ? '⏳'
                    : timeLeft}
              </span>
            </div>
          </div>
        </div>

        {/* Bottom: 3 Slot Cards */}
        <div className="absolute bottom-4 left-0 right-0 z-20 flex items-center justify-center px-4 pointer-events-none">
          <div className="z-30 flex items-center justify-center gap-2 sm:gap-3 md:gap-3.5 max-w-full flex-wrap pointer-events-auto select-none">
            {Array.from({ length: 3 }).map((_, i) => {
              const slotNum = i + 1;
              const hasVideo = i < videoUrls.length;
              const isCurrent = slotNum === currentVideoNum;

              return (
                <div
                  key={slotNum}
                  className={`relative flex items-center justify-center rounded-xl overflow-hidden backdrop-blur-sm transition-all duration-200 shadow-xl size-14 sm:size-17 md:size-20 ${
                    isCurrent && phase === 'recording'
                      ? 'border-2 border-red-500 ring-2 ring-red-400/80 bg-red-500/20 scale-105 shadow-[0_0_15px_rgba(239,68,68,0.5)]'
                      : isCurrent
                        ? 'border-2 border-white ring-2 ring-white/70 bg-white/20 scale-105 shadow-[0_0_15px_rgba(255,255,255,0.4)]'
                        : hasVideo
                          ? 'border-2 border-white/80 bg-black/60'
                          : 'border-2 border-white/40 bg-black/50 opacity-80'
                  }`}
                >
                  {hasVideo ? (
                    videoFrames[i] && videoFrames[i].length > 0 ? (
                      <LoopingMotionPreview
                        frames={videoFrames[i]}
                        fallbackUrl={videoUrls[i]}
                        className="size-full object-cover pointer-events-none"
                      />
                    ) : (
                      <video
                        src={videoUrls[i]}
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="size-full object-cover pointer-events-none"
                      />
                    )
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
                setRecordingElapsed(0);
                setPhase('countdown');
              }}
              className="rounded-lg bg-white px-4 py-1.5 text-xs font-bold text-red-700 hover:bg-white/90 transition"
            >
              Retry Recording
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

