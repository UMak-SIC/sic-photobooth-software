import React, { useEffect, useRef, useState, useCallback } from 'react';
import { CountdownTimer } from './CountdownTimer';

interface CameraViewfinderProps {
  countdownSeconds?: 3 | 5 | 10;
  isCountingDown: boolean;
  onCountdownComplete: (blob: Blob) => void;
  onCancelCountdown?: () => void;
}

export const CameraViewfinder: React.FC<CameraViewfinderProps> = ({
  countdownSeconds = 5,
  isCountingDown,
  onCountdownComplete,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [hasCamera, setHasCamera] = useState<boolean>(true);
  const [streamError, setStreamError] = useState<string | null>(null);

  // Enumerate cameras
  useEffect(() => {
    async function getDevices() {
      try {
        if (!navigator.mediaDevices?.enumerateDevices) return;
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const videoDevs = allDevices.filter((d) => d.kind === 'videoinput');
        setDevices(videoDevs);
        if (videoDevs.length > 0 && !selectedDeviceId) {
          setSelectedDeviceId(videoDevs[0].deviceId);
        }
      } catch (err) {
        console.warn('Could not enumerate media devices:', err);
      }
    }
    getDevices();
  }, [selectedDeviceId]);

  // Start stream
  useEffect(() => {
    let currentStream: MediaStream | null = null;

    async function startStream() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setHasCamera(false);
          return;
        }

        const constraints: MediaStreamConstraints = {
          audio: false,
          video: selectedDeviceId
            ? {
                deviceId: { exact: selectedDeviceId },
                aspectRatio: 16 / 9,
                width: { ideal: 1920 },
                height: { ideal: 1080 },
              }
            : { aspectRatio: 16 / 9, width: { ideal: 1920 }, height: { ideal: 1080 } },
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        currentStream = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setHasCamera(true);
        setStreamError(null);
      } catch (err) {
        console.warn('Camera stream failed:', err);
        setHasCamera(false);
        setStreamError('Camera feed unavailable. Operating in mock capture mode.');
      }
    }

    startStream();

    return () => {
      if (currentStream) {
        currentStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [selectedDeviceId]);

  const isCapturingRef = useRef(false);

  // Capture frame from video or fallback synthetic canvas
  const handleCountdownFinished = useCallback(() => {
    if (isCapturingRef.current) return;
    isCapturingRef.current = true;

    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      if (hasCamera && videoRef.current && videoRef.current.readyState >= 2) {
        ctx.drawImage(videoRef.current, 0, 0, 1920, 1080);
      } else {
        // Fallback test card
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, 1920, 1080);
        ctx.fillStyle = '#10b981';
        ctx.font = 'bold 64px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('SIC PHOTOBOOTH CAPTURE', 960, 500);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '36px sans-serif';
        ctx.fillText(new Date().toLocaleTimeString(), 960, 580);
      }
    }

    canvas.toBlob(
      (blob) => {
        isCapturingRef.current = false;
        if (blob) {
          onCountdownComplete(blob);
        }
      },
      'image/jpeg',
      0.95,
    );
  }, [hasCamera, onCountdownComplete]);

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center bg-zinc-950 overflow-hidden rounded-2xl border border-zinc-800 shadow-2xl">
      {/* Video Viewport (16:9) */}
      <div className="relative w-full max-w-5xl aspect-video bg-black rounded-xl overflow-hidden shadow-inner flex items-center justify-center">
        {hasCamera ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover -scale-x-100"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-center p-8">
            <div className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-4">
              <span className="text-3xl">📷</span>
            </div>
            <p className="text-white font-medium text-lg">Mock Camera Mode</p>
            {streamError && <p className="text-zinc-400 text-sm mt-1">{streamError}</p>}
          </div>
        )}

        {/* Framing Grid Overlay */}
        <div className="absolute inset-0 pointer-events-none border border-white/10 grid grid-cols-3 grid-rows-3 opacity-30">
          <div className="border-r border-b border-white/20" />
          <div className="border-r border-b border-white/20" />
          <div className="border-b border-white/20" />
          <div className="border-r border-b border-white/20" />
          <div className="border-r border-b border-white/20" />
          <div className="border-b border-white/20" />
          <div className="border-r border-white/20" />
          <div className="border-r border-white/20" />
          <div />
        </div>

        {/* Countdown Overlay */}
        <CountdownTimer
          seconds={countdownSeconds}
          active={isCountingDown}
          onComplete={handleCountdownFinished}
        />
      </div>

      {/* Camera device picker toolbar (for operator) */}
      {devices.length > 1 && (
        <div className="mt-4 flex items-center gap-3 px-4 py-2 bg-zinc-900/80 backdrop-blur rounded-full border border-zinc-800 text-xs text-zinc-400">
          <span>Camera Device:</span>
          <select
            value={selectedDeviceId}
            onChange={(e) => setSelectedDeviceId(e.target.value)}
            className="bg-zinc-800 text-white rounded px-2 py-1 outline-none focus:ring-1 focus:ring-emerald-400"
          >
            {devices.map((d, i) => (
              <option key={d.deviceId || i} value={d.deviceId}>
                {d.label || `Camera ${i + 1}`}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
};
