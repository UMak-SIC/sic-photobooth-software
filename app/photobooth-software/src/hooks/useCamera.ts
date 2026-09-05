import { useState, useEffect, useRef, useCallback } from 'react';
import { FLIPBOOK_CONFIG } from '../config/flipbook';

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const [isActive, setIsActive] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const startOperationIdRef = useRef(0);

  // Start Physical Camera Stream
  const startCamera = useCallback(async () => {
    const currentOpId = ++startOperationIdRef.current;
    setError(null);
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error('MediaDevices API not available');
      }

      let stream: MediaStream;
      try {
        // High quality 720p @ 30fps (reliable 16:9 macroblocks, prevents green pixel glitches)
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30, max: 30 },
            facingMode: 'user',
          },
          audio: false,
        });
      } catch {
        // Fallback: standard camera constraints
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      // Discard if component unmounted or another start was triggered
      if (startOperationIdRef.current !== currentOpId) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        try {
          await videoRef.current.play();
        } catch (playErr: unknown) {
          if (playErr instanceof Error && playErr.name !== 'AbortError') {
            console.warn('Video play warning:', playErr);
          }
        }
      }
      setIsActive(true);
      setError(null);
    } catch (err: unknown) {
      console.error('Failed to acquire physical camera feed:', err);
      if (startOperationIdRef.current === currentOpId) {
        setError('Camera capture failed. Check the camera feed and retake this photo.');
        setIsActive(false);
      }
    }
  }, []);

  // Stop Camera Stream
  const stopCamera = useCallback(() => {
    startOperationIdRef.current++;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsActive(false);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopCamera();
    };
  }, [stopCamera]);

  // Capture static photo snapshot from active video stream
  const capturePhoto = useCallback(async (): Promise<Blob> => {
    if (!videoRef.current || !streamRef.current) {
      console.error('capturePhoto failed: videoRef or streamRef is null');
      throw new Error('Camera capture failed. Check the camera feed and retake this photo.');
    }

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    const width = video.videoWidth > 0 ? video.videoWidth : 1280;
    const height = video.videoHeight > 0 ? video.videoHeight : 720;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error('capturePhoto failed: could not get 2d canvas context');
      throw new Error('Camera capture failed. Check the camera feed and retake this photo.');
    }

    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    } catch (drawErr) {
      console.error('capturePhoto failed during ctx.drawImage:', drawErr);
      throw new Error('Camera capture failed. Check the camera feed and retake this photo.');
    }

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob && blob.size > 0) {
            resolve(blob);
          } else {
            console.error('capturePhoto failed: canvas.toBlob returned null or empty blob');
            reject(
              new Error('Camera capture failed. Check the camera feed and retake this photo.'),
            );
          }
        },
        'image/jpeg',
        0.92,
      );
    });
  }, []);

  // Record a video clip using MediaRecorder
  const recordVideoClip = useCallback(
    async (
      durationSeconds: number = FLIPBOOK_CONFIG.videoRecordingDurationSeconds,
    ): Promise<Blob> => {
      if (!streamRef.current) {
        console.error('recordVideoClip failed: streamRef is null');
        throw new Error('Camera capture failed. Check the camera feed and retake this photo.');
      }

      recordedChunksRef.current = [];

      const candidates = [
        'video/webm;codecs=vp8',
        'video/webm;codecs=vp9',
        'video/webm',
        'video/mp4',
      ];
      let selectedMimeType = '';
      for (const mime of candidates) {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) {
          selectedMimeType = mime;
          break;
        }
      }

      const recorder = new MediaRecorder(
        streamRef.current,
        selectedMimeType
          ? { mimeType: selectedMimeType, videoBitsPerSecond: 2500000 }
          : { videoBitsPerSecond: 2500000 },
      );
      mediaRecorderRef.current = recorder;

      return new Promise((resolve, reject) => {
        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            recordedChunksRef.current.push(event.data);
          }
        };

        recorder.onstop = () => {
          setIsRecording(false);
          const mime = recorder.mimeType || selectedMimeType || 'video/webm';
          const fullBlob = new Blob(recordedChunksRef.current, {
            type: mime,
          });

          if (fullBlob.size === 0) {
            reject(
              new Error('Camera capture failed. Check the camera feed and retake this photo.'),
            );
            return;
          }

          resolve(fullBlob);
        };

        recorder.onerror = (recErr) => {
          console.error('MediaRecorder error:', recErr);
          setIsRecording(false);
          reject(new Error('Camera capture failed. Check the camera feed and retake this photo.'));
        };

        recorder.start(100);
        setIsRecording(true);

        // Auto stop after exact duration
        setTimeout(() => {
          if (recorder.state === 'recording') {
            try {
              recorder.requestData();
            } catch {
              // ignore if not supported
            }
            recorder.stop();
          }
        }, durationSeconds * 1000);
      });
    },
    [],
  );

  return {
    videoRef,
    isActive,
    isRecording,
    error,
    startCamera,
    stopCamera,
    capturePhoto,
    recordVideoClip,
  };
}
