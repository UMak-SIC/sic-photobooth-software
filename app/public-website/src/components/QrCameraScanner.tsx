'use client';

import { parsePublicId } from '@photobooth/public-output';
import jsQR from 'jsqr';
import { useEffect, useRef, useState } from 'react';

export function QrCameraScanner({ onScan }: { onScan: (publicId: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    let stream: MediaStream | null = null;
    let frameId: number | null = null;
    let cancelled = false;
    let lastScan = 0;

    async function startCamera() {
      if (!window.isSecureContext) {
        setError('Camera scanning needs HTTPS. Use the code field instead.');
        return;
      }

      try {
        const cameraStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled || !videoRef.current) {
          cameraStream.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = cameraStream;

        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        const scanFrame = (timestamp: number) => {
          const video = videoRef.current;
          const canvas = canvasRef.current;
          if (!video || !canvas || cancelled) return;

          if (
            video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
            timestamp - lastScan >= 150
          ) {
            lastScan = timestamp;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const context = canvas.getContext('2d', { willReadFrequently: true });
            if (context) {
              context.drawImage(video, 0, 0, canvas.width, canvas.height);
              const image = context.getImageData(0, 0, canvas.width, canvas.height);
              const result = jsQR(image.data, image.width, image.height, {
                inversionAttempts: 'attemptBoth',
              });
              const publicId = result ? parsePublicId(result.data) : null;
              if (publicId) {
                cameraStream.getTracks().forEach((track) => track.stop());
                onScan(publicId);
                return;
              }
            }
          }
          frameId = requestAnimationFrame(scanFrame);
        };

        frameId = requestAnimationFrame(scanFrame);
      } catch {
        setError('We could not access your camera. Allow camera access or enter the code instead.');
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      if (frameId) cancelAnimationFrame(frameId);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [isOpen, onScan]);

  if (!isOpen) {
    return (
      <button className="lookup-camera-toggle" type="button" onClick={() => setIsOpen(true)}>
        Scan the QR code with your camera
      </button>
    );
  }

  return (
    <section className="lookup-camera" aria-label="QR code camera scanner">
      <video ref={videoRef} className="lookup-camera-video" muted playsInline />
      <canvas ref={canvasRef} hidden />
      <div className="lookup-camera-controls">
        <p aria-live="polite">{error || 'Point your camera at the QR code on your card.'}</p>
        <button className="lookup-camera-toggle" type="button" onClick={() => setIsOpen(false)}>
          Close camera
        </button>
      </div>
    </section>
  );
}
