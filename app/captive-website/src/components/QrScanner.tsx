'use client';

import React, { useRef, useState, useCallback, useEffect, useSyncExternalStore } from 'react';
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

function getLiveCameraAvailable() {
  return window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
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
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [activeTab, setActiveTab] = useState<'snap' | 'live'>('snap');
  const [cameraState, setCameraState] = useState<'idle' | 'requesting' | 'active' | 'denied'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [previewThumb, setPreviewThumb] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const liveCameraAvailable = useSyncExternalStore(
    () => () => {},
    getLiveCameraAvailable,
    () => false,
  );

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

  function scanFrame() {
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
  }

  async function startCamera() {
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
  }

  // Handle Tab Switch
  const handleTabChange = (tab: 'snap' | 'live') => {
    if (tab === 'live' && !liveCameraAvailable) {
      triggerErrorToast('Live video needs HTTPS. Use Scan with camera instead.');
      return;
    }

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
      // Keep image decoding separate from the live camera canvas.
      const canvas = document.createElement('canvas');
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
    <div className="portal-panel relative w-full overflow-hidden rounded-[1.25rem]">
      {/* Hidden processing canvas & native input hooks */}
      <canvas ref={canvasRef} className="sr-only pointer-events-none" />
      <input
        id="qr-camera-input"
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleImageFile}
        className="sr-only"
      />
      <input
        id="qr-gallery-input"
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageFile}
        className="sr-only"
      />

      {/* Floating Error Toast */}
      {errorMessage && (
        <div className="fixed bottom-6 inset-x-4 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl border border-[#9d3947] bg-[#150a0c] px-4 py-3 text-left text-xs font-semibold text-rose-200 sm:bottom-8 sm:inset-x-auto">
          <div className="flex items-center gap-2.5">
            <div className="grid size-7 shrink-0 place-items-center rounded-xl bg-[#5b202b] text-rose-200">
              <AlertCircle className="size-4" />
            </div>
            <p className="leading-snug">{errorMessage}</p>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="portal-action grid size-6 shrink-0 place-items-center rounded-lg text-rose-200 hover:bg-[#5b202b]"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Top Header & Tab Switcher Bar */}
      <div className="flex items-center gap-2 border-b border-[#1c4a40] bg-[#071b17] px-4 py-3 sm:px-6">
        {/* Tab Controls */}
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-1 rounded-xl border border-[#1c4a40] bg-[#0b2420] p-1">
          <button
            type="button"
            onClick={() => handleTabChange('snap')}
            className={`portal-action inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-bold ${
              activeTab === 'snap'
                ? 'bg-[#a8f3dd] text-[#145142]'
                : 'text-[#9ec4b9] hover:text-white'
            }`}
          >
            <Camera className="size-3.5" />
            <span>Photo</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('live')}
            className={`portal-action inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-bold ${
              activeTab === 'live'
                ? 'bg-[#a8f3dd] text-[#145142]'
                : liveCameraAvailable
                  ? 'cursor-pointer text-[#9ec4b9] hover:text-white'
                  : 'cursor-not-allowed text-[#64877d]'
            }`}
            title={liveCameraAvailable ? 'Scan with live video' : 'Live video requires HTTPS'}
          >
            <Video className="size-3.5" />
            <span>Live camera</span>
          </button>
        </div>

        {/* Gallery Upload Button */}
        <button
          type="button"
          onClick={() => galleryInputRef.current?.click()}
          title="Upload QR Code from Gallery"
          className="portal-action flex size-10 shrink-0 items-center justify-center rounded-xl border border-[#1c4a40] bg-[#0b2420] text-[#a8f3dd] hover:bg-[#164137] hover:text-white"
        >
          <Upload className="size-4" />
        </button>
      </div>

      {/* Viewport / Action Area */}
      <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-[#071411]">
        {/* Tab 1: Snap Photo Mode View */}
        {activeTab === 'snap' && (
          <div className="flex size-full flex-col items-center justify-center p-6 text-center text-white">
            {isProcessingImage ? (
              /* Decoding Image Progress State */
              <div className="flex flex-col items-center justify-center gap-3">
                <div className="relative size-24 overflow-hidden rounded-xl border-2 border-[#a8f3dd]">
                  {previewThumb && (
                    <img src={previewThumb} alt="QR Thumbnail" className="size-full object-cover" />
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-[#071411]">
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
                   <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                     className="portal-action relative grid size-20 place-items-center rounded-full border-2 border-[#a8f3dd] bg-[#146a56] text-white hover:bg-[#1d8068]"
                  >
                    <Camera className="size-8 text-[#071d1a]" />
                  </button>
                </div>

                <div className="mt-2">
                  <h3 className="text-base sm:text-lg font-black text-white">
                     Scan your QR code
                  </h3>
                  <p className="mt-1 text-xs text-[#9ec4b9] leading-relaxed">
                    Point your camera at the printed QR code on your slip or card to retrieve your photo instantly.
                  </p>
                </div>

                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                     className="portal-action mt-2 inline-flex items-center gap-2 rounded-xl bg-[#a8f3dd] px-5 py-3 text-xs font-black text-[#145142] hover:bg-[#c7fbe9]"
                  >
                    <Camera className="size-4 text-[#145142]" />
                     <span>Open camera</span>
                  </button>
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
                    <div className="relative size-52 rounded-xl border border-[#a8f3dd] bg-[#061715] sm:size-60">
                    {/* Reticle Corners */}
                    <div className="absolute -left-1 -top-1 size-6 rounded-tl-lg border-l-[3px] border-t-[3px] border-[#a8f3dd]" />
                    <div className="absolute -right-1 -top-1 size-6 rounded-tr-lg border-r-[3px] border-t-[3px] border-[#a8f3dd]" />
                    <div className="absolute -bottom-1 -left-1 size-6 rounded-bl-lg border-b-[3px] border-l-[3px] border-[#a8f3dd]" />
                    <div className="absolute -bottom-1 -right-1 size-6 rounded-br-lg border-b-[3px] border-r-[3px] border-[#a8f3dd]" />

                    {/* Laser Scan line */}
                    <div className="absolute inset-x-5 top-1/2 h-px bg-[#a8f3dd]" />
                  </div>

                  <div className="absolute bottom-4 flex items-center gap-2 rounded-xl border border-[#1c4a40] bg-[#071411] px-4 py-1.5 text-xs font-semibold text-[#a8f3dd]">
                    <ScanLine className="size-3.5 text-[#48c4a1]" />
                    Align QR code within reticle
                  </div>
                </div>

                {/* Flip Camera Control */}
                <div className="absolute top-4 right-4">
                  <button
                    type="button"
                    onClick={toggleCameraFacing}
                    title="Switch Camera"
                    className="portal-action flex size-10 items-center justify-center rounded-xl border border-[#2a6457] bg-[#071411] text-white hover:border-[#a8f3dd] hover:bg-[#0e2a24]"
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
                <div className="mb-2.5 grid size-12 place-items-center rounded-xl border border-[#1c4a40] bg-[#0b2420] text-white">
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
                    className="portal-action inline-flex items-center gap-2 rounded-xl bg-[#a8f3dd] px-5 py-3 text-xs font-black text-[#145142] hover:bg-[#c7fbe9]"
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
