import { useEffect, useRef, useState } from 'react';
import { SELECTED_CAMERA_STORAGE_KEY } from '../hooks/useCamera';

export type CameraDevice = { deviceId: string; label: string };

export interface CameraSetupModalProps {
  experience?: 'photo_strip' | 'flipbook' | 'general';
  onCancel: () => void;
  onContinue: () => void;
}

export function CameraSetupModal({
  experience: _experience,
  onCancel,
  onContinue,
}: CameraSetupModalProps) {
  const previewRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(true);
  const [previewReady, setPreviewReady] = useState(false);

  const stopPreview = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setPreviewReady(false);
    if (previewRef.current) previewRef.current.srcObject = null;
  };

  const requestCamera = async (deviceId?: string) => {
    setRequesting(true);
    setError(null);
    stopPreview();
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera access is not available in this browser.');
      }
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' },
          audio: false,
        });
      } catch (cameraError) {
        // A previously selected USB camera may have been unplugged. Re-ask with any camera.
        if (!deviceId || (cameraError instanceof DOMException && cameraError.name === 'NotAllowedError')) {
          throw cameraError;
        }
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = stream;
      if (previewRef.current) {
        previewRef.current.srcObject = stream;
        setPreviewReady(true);
        try {
          await previewRef.current.play();
        } catch (playError) {
          if (!stream.active) throw playError;
        }
      }
      const nextDevices = (await navigator.mediaDevices.enumerateDevices())
        .filter((device) => device.kind === 'videoinput')
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Camera ${index + 1}`,
        }));
      setDevices(nextDevices);
      const activeId =
        deviceId || stream.getVideoTracks()[0]?.getSettings().deviceId || nextDevices[0]?.deviceId || '';
      setSelectedDeviceId(activeId);
      if (activeId && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(SELECTED_CAMERA_STORAGE_KEY, activeId);
      }
    } catch (cameraError) {
      const hasLivePreview = streamRef.current?.active && previewRef.current?.srcObject === streamRef.current;
      if (!hasLivePreview) {
        setPreviewReady(false);
        setError(
          cameraError instanceof DOMException && cameraError.name === 'NotAllowedError'
            ? 'Camera permission is required to make your photos. Allow access, then try again.'
            : cameraError instanceof Error
              ? cameraError.message
              : 'We could not start a camera.',
        );
      }
    } finally {
      setRequesting(false);
    }
  };

  useEffect(() => {
    const savedId = typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem(SELECTED_CAMERA_STORAGE_KEY) : null;
    void requestCamera(savedId || undefined);
    return stopPreview;
  }, []);

  const handleSelect = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    void requestCamera(deviceId);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 sm:p-6 backdrop-blur-sm font-['Nunito',sans-serif]">
      <div className="relative flex w-full max-w-2xl flex-col gap-6 rounded-[28px] bg-white p-6 sm:p-8 md:p-10 shadow-2xl">
        {/* Title */}
        <h2 className="text-center text-3xl font-extrabold tracking-tight text-black sm:text-4xl">
          Choose your <span className="text-[#1b6941]">camera!</span>
        </h2>

        {/* Camera Select Dropdown */}
        <div className="relative w-full">
          <select
            id="camera-select"
            value={selectedDeviceId}
            onChange={(event) => handleSelect(event.target.value)}
            disabled={requesting || devices.length === 0}
            className="w-full appearance-none rounded-xl border-2 border-black bg-white px-5 py-3.5 pr-12 text-base font-bold text-gray-900 outline-none transition-colors focus:border-[#1b6941] disabled:opacity-60 cursor-pointer"
          >
            {devices.length === 0 ? (
              <option value="">No cameras found</option>
            ) : (
              devices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </option>
              ))
            )}
          </select>
          <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-700">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Video Preview Box */}
        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black md:rounded-2xl">
          <video
            ref={previewRef}
            autoPlay
            playsInline
            muted
            className="size-full object-cover -scale-x-100"
          />
          {requesting && !previewReady && (
            <div className="absolute inset-0 grid place-items-center bg-black/70 p-4 text-center text-sm font-bold text-white">
              ASKING FOR CAMERA ACCESS...
            </div>
          )}
          {!requesting && error && !previewReady && (
            <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm font-semibold text-white">
              <div>
                <p className="mb-3 text-red-400">{error}</p>
                <button
                  type="button"
                  onClick={() => void requestCamera(selectedDeviceId || undefined)}
                  className="rounded-full bg-white/20 px-4 py-2 text-xs font-bold text-white hover:bg-white/30 cursor-pointer"
                >
                  Try camera permission again
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Actions */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 rounded-full border-2 border-black bg-white px-6 py-2.5 text-base font-bold text-black transition-colors hover:bg-gray-100 cursor-pointer active:scale-95"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Cancel
          </button>
          <button
            type="button"
            disabled={requesting || !!error || !selectedDeviceId}
            onClick={onContinue}
            className="inline-flex items-center gap-2 rounded-full bg-[#1b6941] px-8 py-2.5 text-base font-bold text-white shadow-md transition-colors hover:bg-[#145333] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer active:scale-95"
          >
            <span>Apply Camera</span>
            <svg className="h-5 w-5 stroke-current stroke-[2.5]" fill="none" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}


