'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import jsQR from 'jsqr';
import {
  QRCodeReader,
  RGBLuminanceSource,
  BinaryBitmap,
  HybridBinarizer,
  GlobalHistogramBinarizer,
} from '@zxing/library';
import {
  CameraOff,
  RefreshCw,
  Loader2,
  ScanLine,
  Upload,
  Camera,
  Video,
  AlertCircle,
  X,
} from 'lucide-react';
import { parsePublicId, isValidPublicId } from '@photobooth/public-output';

interface QrScannerProps {
  onScanSuccess: (publicId: string) => void;
}

function extractIdFromQrData(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();

  // 1. Direct parser check (handles https://myphotobooth.com/:id, raw 7-char base62 IDs, etc.)
  const parsed = parsePublicId(trimmed);
  if (parsed) return parsed;

  // 2. URL extraction for any domain or IP (e.g. http://192.168.100.25:5174/:id)
  try {
    const url = new URL(trimmed);
    const segments = url.pathname.split('/').filter(Boolean);
    const candidate = segments[segments.length - 1];
    if (candidate && isValidPublicId(candidate)) {
      return candidate;
    }
  } catch {
    // Non-URL
  }

  // 3. Regex pattern extraction anywhere in string
  const regexMatch = trimmed.match(/[0-9a-zA-Z]{7}/);
  if (regexMatch && isValidPublicId(regexMatch[0])) {
    return regexMatch[0];
  }

  return null;
}

function decodeImageDataWithZXing(imageData: ImageData): string | null {
  try {
    const luminanceSource = new RGBLuminanceSource(
      imageData.data,
      imageData.width,
      imageData.height,
    );

    // 1. HybridBinarizer (adaptive thresholding for uneven lighting and shadows)
    try {
      const bitmap = new BinaryBitmap(new HybridBinarizer(luminanceSource));
      const reader = new QRCodeReader();
      const result = reader.decode(bitmap);
      if (result && result.getText()) {
        const parsed = extractIdFromQrData(result.getText());
        if (parsed) return parsed;
      }
    } catch {
      // Try next
    }

    // 2. GlobalHistogramBinarizer (global thresholding for high contrast/screen captures)
    try {
      const bitmap = new BinaryBitmap(new GlobalHistogramBinarizer(luminanceSource));
      const reader = new QRCodeReader();
      const result = reader.decode(bitmap);
      if (result && result.getText()) {
        const parsed = extractIdFromQrData(result.getText());
        if (parsed) return parsed;
      }
    } catch {
      // Continue
    }
  } catch {
    // Ignore decode error
  }
  return null;
}

export function QrScanner({ onScanSuccess }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [activeTab, setActiveTab] = useState<'snap' | 'live'>('snap');
  const [cameraState, setCameraState] = useState<'idle' | 'requesting' | 'active' | 'denied'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [previewThumb, setPreviewThumb] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  const triggerErrorToast = useCallback((msg: string) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setErrorMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setErrorMessage(null);
    }, 5000);
  }, []);

  const stopCamera = useCallback(() => {
    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraState('idle');
  }, []);

  const scanFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      animationFrameIdRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      animationFrameIdRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Pass 1: jsQR
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert',
    });
    if (code && code.data) {
      const parsedId = extractIdFromQrData(code.data);
      if (parsedId) {
        stopCamera();
        onScanSuccess(parsedId);
        return;
      }
    }

    // Pass 2: ZXing
    const zxingResult = decodeImageDataWithZXing(imageData);
    if (zxingResult) {
      stopCamera();
      onScanSuccess(zxingResult);
      return;
    }

    animationFrameIdRef.current = requestAnimationFrame(scanFrame);
  }, [onScanSuccess, stopCamera]);

  const startCamera = useCallback(async () => {
    stopCamera();
    setErrorMessage(null);
    setCameraState('requesting');

    if (
      typeof window !== 'undefined' &&
      !window.isSecureContext &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1'
    ) {
      setCameraState('denied');
      triggerErrorToast(
        'Live video streaming requires HTTPS on mobile networks. Tap "Snap Photo" for instant scanning!',
      );
      return;
    }

    if (!navigator?.mediaDevices?.getUserMedia) {
      setCameraState('denied');
      triggerErrorToast('Live video streaming is not available on this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        video.muted = true;
        await video.play();
      }

      setCameraState('active');
      animationFrameIdRef.current = requestAnimationFrame(scanFrame);
    } catch (err: unknown) {
      console.warn('Camera permission denied or failed:', err);
      setCameraState('denied');
      triggerErrorToast('Camera permission was not granted or is restricted.');
    }
  }, [facingMode, scanFrame, stopCamera, triggerErrorToast]);

  // Handle Tab Switch
  const handleTabChange = (tab: 'snap' | 'live') => {
    setActiveTab(tab);
    setErrorMessage(null);
    if (tab === 'snap') {
      stopCamera();
    } else {
      startCamera();
    }
  };

  useEffect(() => {
    return () => {
      stopCamera();
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, [stopCamera]);

  const handleImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingImage(true);
    setErrorMessage(null);

    // Instant, memory-safe blob URL
    const objectUrl = URL.createObjectURL(file);
    setPreviewThumb(objectUrl);

    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load captured image.'));
        img.src = objectUrl;
      });

      // 1. Hardware-Accelerated BarcodeDetector (Chrome Android / iOS 17+)
      if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
          const barcodes = await detector.detect(img);
          if (barcodes && barcodes.length > 0) {
            for (const barcode of barcodes) {
              if (barcode.rawValue) {
                const parsedId = extractIdFromQrData(barcode.rawValue);
                if (parsedId) {
                  URL.revokeObjectURL(objectUrl);
                  setIsProcessingImage(false);
                  onScanSuccess(parsedId);
                  return;
                }
              }
            }
          }
        } catch (detectorErr) {
          console.warn('BarcodeDetector direct pass failed, continuing to multi-scale scan:', detectorErr);
        }
      }

      // 2. Multi-Scale and Multi-Crop Passes (Full Downscaled + Center Crops)
      const canvas = canvasRef.current || document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      if (ctx) {
        const naturalWidth = img.naturalWidth || img.width;
        const naturalHeight = img.naturalHeight || img.height;

        const scanTargets = [
          // Full image downscaled
          { sx: 0, sy: 0, sWidth: naturalWidth, sHeight: naturalHeight, targetSize: 1200 },
          { sx: 0, sy: 0, sWidth: naturalWidth, sHeight: naturalHeight, targetSize: 800 },
          // Center 60% crop (natural phone aiming)
          {
            sx: Math.round(naturalWidth * 0.2),
            sy: Math.round(naturalHeight * 0.2),
            sWidth: Math.round(naturalWidth * 0.6),
            sHeight: Math.round(naturalHeight * 0.6),
            targetSize: 800,
          },
          // Center 40% crop
          {
            sx: Math.round(naturalWidth * 0.3),
            sy: Math.round(naturalHeight * 0.3),
            sWidth: Math.round(naturalWidth * 0.4),
            sHeight: Math.round(naturalHeight * 0.4),
            targetSize: 800,
          },
          // High-res pass
          { sx: 0, sy: 0, sWidth: naturalWidth, sHeight: naturalHeight, targetSize: 1600 },
        ];

        for (const target of scanTargets) {
          let destWidth = target.sWidth;
          let destHeight = target.sHeight;
          const maxSize = target.targetSize;

          if (destWidth > maxSize || destHeight > maxSize) {
            if (destWidth > destHeight) {
              destHeight = Math.round((destHeight * maxSize) / destWidth);
              destWidth = maxSize;
            } else {
              destWidth = Math.round((destWidth * maxSize) / destHeight);
              destHeight = maxSize;
            }
          }

          canvas.width = destWidth;
          canvas.height = destHeight;
          ctx.clearRect(0, 0, destWidth, destHeight);
          ctx.drawImage(
            img,
            target.sx,
            target.sy,
            target.sWidth,
            target.sHeight,
            0,
            0,
            destWidth,
            destHeight,
          );

          // Try BarcodeDetector on cropped canvas
          if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
              const barcodes = await detector.detect(canvas);
              if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                const parsedId = extractIdFromQrData(barcodes[0].rawValue);
                if (parsedId) {
                  URL.revokeObjectURL(objectUrl);
                  setIsProcessingImage(false);
                  onScanSuccess(parsedId);
                  return;
                }
              }
            } catch {
              // Continue
            }
          }

          const imageData = ctx.getImageData(0, 0, destWidth, destHeight);

          // Try ZXing (Hybrid & GlobalHistogram binarizers)
          const zxingResult = decodeImageDataWithZXing(imageData);
          if (zxingResult) {
            URL.revokeObjectURL(objectUrl);
            setIsProcessingImage(false);
            onScanSuccess(zxingResult);
            return;
          }

          // Try jsQR
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'attemptBoth',
          });
          if (code && code.data) {
            const parsedId = extractIdFromQrData(code.data);
            if (parsedId) {
              URL.revokeObjectURL(objectUrl);
              setIsProcessingImage(false);
              onScanSuccess(parsedId);
              return;
            }
          }
        }
      }

      URL.revokeObjectURL(objectUrl);
      setIsProcessingImage(false);
      setPreviewThumb(null);
      triggerErrorToast(
        'Could not detect a photobooth QR code. Please hold the camera closer and center the QR code.',
      );
    } catch (err: unknown) {
      console.error('Photo decode failed:', err);
      URL.revokeObjectURL(objectUrl);
      setIsProcessingImage(false);
      setPreviewThumb(null);
      triggerErrorToast('Could not process photo. Please try again or enter the 7-character code below.');
    } finally {
      e.target.value = '';
    }
  };

  const toggleCameraFacing = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
    startCamera();
  };

  return (
    <div className="relative w-full overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-[#0e2a24] to-[#071d1a] shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
      {/* Hidden processing canvas & native input hooks */}
      <canvas ref={canvasRef} className="sr-only opacity-0 pointer-events-none" />
      <input
        id="qr-camera-input"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleImageFile}
        className="sr-only opacity-0 absolute size-0 pointer-events-none"
      />
      <input
        id="qr-gallery-input"
        type="file"
        accept="image/*"
        onChange={handleImageFile}
        className="sr-only opacity-0 absolute size-0 pointer-events-none"
      />

      {/* Floating Error Toast */}
      {errorMessage && (
        <div className="fixed bottom-6 inset-x-4 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border border-rose-500/30 bg-[#150a0c]/95 px-4 py-3 text-left text-xs font-semibold text-rose-200 shadow-[0_10px_40px_rgba(0,0,0,0.8)] backdrop-blur-xl animate-fade-in sm:bottom-8 sm:inset-x-auto">
          <div className="flex items-center gap-2.5">
            <div className="grid size-7 shrink-0 place-items-center rounded-xl bg-rose-500/20 text-rose-400">
              <AlertCircle className="size-4" />
            </div>
            <p className="leading-snug">{errorMessage}</p>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="grid size-6 shrink-0 place-items-center rounded-lg text-rose-400/80 hover:bg-rose-500/20 hover:text-rose-200 transition"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Top Header & Tab Switcher Bar */}
      <div className="flex items-center justify-between border-b border-white/10 bg-black/40 px-4 py-3 sm:px-6">
        {/* Tab Controls */}
        <div className="flex items-center gap-1.5 rounded-2xl bg-white/5 p-1 border border-white/10 shadow-inner">
          <button
            type="button"
            onClick={() => handleTabChange('snap')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition cursor-pointer ${
              activeTab === 'snap'
                ? 'bg-[#a8f3dd] text-[#145142] shadow-sm'
                : 'text-[#9ec4b9] hover:text-white'
            }`}
          >
            <Camera className="size-3.5" />
            <span>Snap Photo</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[9px] font-black uppercase ${
                activeTab === 'snap' ? 'bg-[#145142]/20 text-[#145142]' : 'bg-emerald-500/20 text-[#a8f3dd]'
              }`}
            >
              Fast
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('live')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
              activeTab === 'live'
                ? 'bg-[#a8f3dd] text-[#145142] shadow-sm'
                : 'text-[#9ec4b9] hover:text-white'
            }`}
          >
            <Video className="size-3.5" />
            <span>Live Video</span>
          </button>
        </div>

        {/* Gallery Upload Button */}
        <label
          htmlFor="qr-gallery-input"
          title="Upload QR Code from Gallery"
          className="flex items-center justify-center size-9 rounded-xl bg-white/5 border border-white/10 text-[#a8f3dd] hover:bg-white/15 hover:text-white transition active:scale-95 shadow-sm cursor-pointer"
        >
          <Upload className="size-4" />
        </label>
      </div>

      {/* Viewport / Action Area */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-black/90 flex items-center justify-center">
        {/* Tab 1: Snap Photo Mode View */}
        {activeTab === 'snap' && (
          <div className="flex size-full flex-col items-center justify-center p-6 text-center text-white">
            {isProcessingImage ? (
              /* Decoding Image Progress State */
              <div className="flex flex-col items-center justify-center gap-3">
                <div className="relative size-24 rounded-2xl overflow-hidden border-2 border-[#a8f3dd] shadow-[0_0_25px_rgba(168,243,221,0.4)]">
                  {previewThumb && (
                    <img src={previewThumb} alt="QR Thumbnail" className="size-full object-cover blur-[2px]" />
                  )}
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <Loader2 className="size-8 animate-spin text-[#a8f3dd]" />
                  </div>
                </div>
                <div>
                  <p className="text-sm font-black text-white">Decoding QR Code...</p>
                  <p className="text-xs text-[#9ec4b9] mt-0.5">Matching photobooth session</p>
                </div>
              </div>
            ) : (
              /* Default Snap Camera CTA */
              <div className="flex flex-col items-center justify-center gap-3 max-w-sm">
                <div className="relative">
                  <div className="absolute -inset-2 rounded-full bg-[#a8f3dd]/20 blur-lg animate-pulse-slow" />
                  <label
                    htmlFor="qr-camera-input"
                    className="relative grid size-20 place-items-center rounded-full bg-gradient-to-tr from-[#146a56] to-[#48c4a1] border-2 border-[#a8f3dd] text-white shadow-[0_10px_30px_rgba(72,196,161,0.4)] transition hover:scale-105 active:scale-95 cursor-pointer"
                  >
                    <Camera className="size-8 text-[#071d1a]" />
                  </label>
                </div>

                <div className="mt-2">
                  <h3 className="text-base sm:text-lg font-black text-white">
                    Snap a Photo of Your QR
                  </h3>
                  <p className="mt-1 text-xs text-[#9ec4b9] leading-relaxed">
                    Point your camera at the printed QR code on your slip or card to retrieve your photo instantly.
                  </p>
                </div>

                <label
                  htmlFor="qr-camera-input"
                  className="mt-2 inline-flex items-center gap-2 rounded-2xl bg-[#a8f3dd] px-6 py-3 text-xs font-black text-[#145142] shadow-[0_10px_25px_rgba(168,243,221,0.25)] transition hover:bg-[#90e8d0] active:scale-[0.98] cursor-pointer"
                >
                  <Camera className="size-4 text-[#145142]" />
                  <span>Open Camera to Snap</span>
                </label>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Live Stream Mode View */}
        {activeTab === 'live' && (
          <>
            {/* Live Video Element */}
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className={`size-full object-cover ${cameraState === 'active' ? 'block' : 'hidden'}`}
            />

            {/* Active Live Scanner Overlay */}
            {cameraState === 'active' && (
              <>
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
                  <div className="relative size-52 sm:size-60 rounded-2xl border border-white/20 shadow-[0_0_0_9999px_rgba(3,27,22,0.5)]">
                    {/* Reticle Corners */}
                    <div className="absolute -left-1 -top-1 size-6 border-l-[3px] border-t-[3px] border-[#a8f3dd] rounded-tl-lg shadow-[0_0_10px_rgba(168,243,221,0.6)]" />
                    <div className="absolute -right-1 -top-1 size-6 border-r-[3px] border-t-[3px] border-[#a8f3dd] rounded-tr-lg shadow-[0_0_10px_rgba(168,243,221,0.6)]" />
                    <div className="absolute -bottom-1 -left-1 size-6 border-b-[3px] border-l-[3px] border-[#a8f3dd] rounded-bl-lg shadow-[0_0_10px_rgba(168,243,221,0.6)]" />
                    <div className="absolute -bottom-1 -right-1 size-6 border-b-[3px] border-r-[3px] border-[#a8f3dd] rounded-br-lg shadow-[0_0_10px_rgba(168,243,221,0.6)]" />

                    {/* Laser Scan line */}
                    <div className="absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-[#a8f3dd] to-transparent shadow-[0_0_12px_#a8f3dd] animate-[scan_2.2s_ease-in-out_infinite]" />
                  </div>

                  <div className="absolute bottom-4 flex items-center gap-2 rounded-full bg-black/75 px-4 py-1.5 text-xs font-semibold text-[#a8f3dd] backdrop-blur-md border border-white/10 shadow-lg">
                    <ScanLine className="size-3.5 text-[#48c4a1] animate-pulse" />
                    Align QR code within reticle
                  </div>
                </div>

                {/* Flip Camera Control */}
                <div className="absolute top-4 right-4">
                  <button
                    type="button"
                    onClick={toggleCameraFacing}
                    title="Switch Camera"
                    className="flex items-center justify-center size-10 rounded-full bg-black/60 text-white backdrop-blur-md border border-white/15 hover:bg-black/80 hover:border-white/30 transition active:scale-95 shadow-md"
                  >
                    <RefreshCw className="size-4 text-[#a8f3dd]" />
                  </button>
                </div>
              </>
            )}

            {/* Requesting Live State */}
            {cameraState === 'requesting' && (
              <div className="flex flex-col items-center justify-center text-center text-[#a8f3dd] p-8">
                <Loader2 className="size-9 animate-spin text-[#48c4a1] mb-3" />
                <p className="text-sm font-bold text-white">Starting camera...</p>
                <p className="text-xs text-[#9ec4b9] mt-1">Please allow camera permissions if prompted</p>
              </div>
            )}

            {/* Denied / HTTP Notice State */}
            {cameraState === 'denied' && (
              <div className="flex flex-col items-center justify-center p-6 sm:p-8 text-center text-white max-w-sm">
                <div className="grid size-12 place-items-center rounded-2xl bg-white/5 border border-white/10 text-white/80 mb-2.5 shadow-inner">
                  <CameraOff className="size-5 text-[#9ec4b9]" />
                </div>
                <h3 className="text-sm sm:text-base font-bold text-[#e8fff5]">Live Video Notice</h3>
                <p className="mt-1.5 text-xs text-[#9ec4b9] leading-relaxed">
                  Live stream is not supported in this environment. Tap below to use instant photo mode.
                </p>

                <div className="mt-5 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleTabChange('snap')}
                    className="inline-flex items-center gap-2 rounded-2xl bg-[#a8f3dd] px-5 py-3 text-xs font-black text-[#145142] shadow-[0_10px_25px_rgba(168,243,221,0.3)] transition hover:bg-[#90e8d0] active:scale-[0.98]"
                  >
                    <Camera className="size-4" />
                    <span>Use Snap Photo Mode</span>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}



