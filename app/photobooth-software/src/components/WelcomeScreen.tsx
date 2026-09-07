import { useEffect, useRef, useState } from 'react';
import { useFlipbookStore } from '../store/flipbook-store';
import { usePhotoStripStore } from '../store/photostrip-store';
import { useSessionStore } from '../store/session-store';
import { boothApi } from '../services/api';
import { SELECTED_CAMERA_STORAGE_KEY } from '../hooks/useCamera';

export interface WelcomeScreenProps {
  preview?: boolean;
}

export function WelcomeScreen({ preview = false }: WelcomeScreenProps = {}) {
  const { setSession: setFlipbookSession, setStep: setFlipbookStep } = useFlipbookStore();
  const { setStep: setPhotoStripStep } = usePhotoStripStore();
  const { setActiveSession } = useSessionStore();
  const [loading, setLoading] = useState(false);
  const [cameraChoice, setCameraChoice] = useState<'photo_strip' | 'flipbook' | null>(null);

  const handleStartPhotoStrip = () => {
    if (preview) return;
    setCameraChoice('photo_strip');
  };

  const handleStartFlipbook = async () => {
    if (preview) return;
    setCameraChoice('flipbook');
  };

  const handleCameraReady = async () => {
    if (cameraChoice === 'photo_strip') {
      setActiveSession({ id: '', type: 'photo_strip' });
      setPhotoStripStep('setup');
      setCameraChoice(null);
      return;
    }

    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const session = await boothApi.createSession('SIC General Assembly', today, 'Operator', 'flipbook');
      setFlipbookSession(session.sessionId, session.token);
      setActiveSession({ id: session.sessionId, type: 'flipbook', token: session.token });
      setFlipbookStep('instructions');
    } catch {
      setFlipbookSession('mock-flipbook-session-id', 'mock-token');
      setActiveSession({ id: 'mock-flipbook-session-id', type: 'flipbook' });
      setFlipbookStep('instructions');
    } finally {
      setLoading(false);
      setCameraChoice(null);
    }
  };

  return (
    <div className="relative flex min-h-[100vh] w-full flex-col items-center justify-center gap-14 overflow-hidden bg-[#ecfff8] px-8 py-16 text-[#113b33]">
      <div className="text-center">
        <p className="text-xs font-bold tracking-[0.22em] text-[#28806c] mb-3">SIC PHOTOBOOTH</p>
        <h4 className="text-[52px] md:text-[64px] font-black leading-[0.92] tracking-[-0.06em]">
          What are we creating today?
        </h4>
      </div>

      <div className="flex flex-wrap justify-center gap-8 max-w-4xl w-full">
        {/* Photo Strips */}
        <button
          type="button"
          disabled={loading}
          onClick={handleStartPhotoStrip}
          className="group flex flex-1 min-w-[280px] max-w-[340px] flex-col items-center gap-6 overflow-hidden rounded-3xl bg-[#176754] px-12 py-12 shadow-2xl transition hover:-translate-y-1.5 hover:bg-[#135848] active:scale-[0.99] cursor-pointer"
        >
          <div className="visual-strip size-40 rounded-2xl bg-[#0e473d] flex items-center justify-center font-black text-[#9ef0dc] text-xl shadow-inner">
            PHOTO STRIP
          </div>
          <h5 className="text-[24px] font-black tracking-[-0.04em] text-white">
            {loading ? 'Starting...' : 'PHOTO STRIPS'}
          </h5>
        </button>

        {/* Flipbook */}
        <button
          type="button"
          disabled={loading}
          onClick={handleStartFlipbook}
          className="group flex flex-1 min-w-[280px] max-w-[340px] flex-col items-center gap-6 overflow-hidden rounded-3xl bg-[#176754] px-12 py-12 shadow-2xl transition hover:-translate-y-1.5 hover:bg-[#135848] active:scale-[0.99]"
        >
          <div className="visual-flip size-40 rounded-2xl bg-[#0e473d] flex items-center justify-center font-black text-[#9ef0dc] text-xl shadow-inner">
            FLIPBOOK
          </div>
          <h5 className="text-[24px] font-black tracking-[-0.04em] text-white">
            {loading ? 'Starting...' : 'FLIPBOOK'}
          </h5>
        </button>
      </div>

      {cameraChoice && (
        <CameraSetup
          experience={cameraChoice}
          busy={loading}
          onCancel={() => setCameraChoice(null)}
          onContinue={handleCameraReady}
        />
      )}
    </div>
  );
}

type CameraDevice = { deviceId: string; label: string };

function CameraSetup({
  experience,
  busy,
  onCancel,
  onContinue,
}: {
  experience: 'photo_strip' | 'flipbook';
  busy: boolean;
  onCancel: () => void;
  onContinue: () => void;
}) {
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
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is not available in this browser.');
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
      const activeId = deviceId || stream.getVideoTracks()[0]?.getSettings().deviceId || nextDevices[0]?.deviceId || '';
      setSelectedDeviceId(activeId);
      if (activeId) window.localStorage.setItem(SELECTED_CAMERA_STORAGE_KEY, activeId);
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
    void requestCamera(window.localStorage.getItem(SELECTED_CAMERA_STORAGE_KEY) || undefined);
    return stopPreview;
  }, []);

  const handleSelect = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    void requestCamera(deviceId);
  };

  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-[#071d1a]/80 p-6 backdrop-blur-md">
      <div className="grid w-full max-w-3xl gap-7 rounded-[2rem] bg-[#f3fff9] p-6 text-left text-[#113b33] shadow-2xl md:grid-cols-[1.15fr_1fr] md:p-8">
        <div className="relative min-h-64 overflow-hidden rounded-2xl bg-[#071d1a]">
          <video ref={previewRef} autoPlay playsInline muted className="size-full object-cover -scale-x-100" />
          {requesting && !previewReady && <div className="absolute inset-0 grid place-items-center bg-[#071d1a]/60 text-sm font-bold text-[#a8f3dd]">ASKING FOR CAMERA ACCESS...</div>}
          {!requesting && error && !previewReady && <div className="absolute inset-0 grid place-items-center p-8 text-center text-sm font-semibold text-white">{error}</div>}
        </div>
        <div className="flex flex-col justify-center">
          <p className="text-xs font-black tracking-[0.2em] text-[#28806c]">CAMERA SETUP</p>
          <h3 className="mt-3 text-3xl font-black tracking-[-0.05em]">Choose your camera.</h3>
          <p className="mt-3 text-sm leading-6 text-[#56796f]">We need camera access for your {experience === 'photo_strip' ? 'photo strip' : 'flipbook'}. Your selection will be used for every capture.</p>
          <label className="mt-6 text-xs font-black tracking-[0.14em] text-[#28806c]" htmlFor="camera-select">AVAILABLE CAMERAS</label>
          <select id="camera-select" value={selectedDeviceId} onChange={(event) => handleSelect(event.target.value)} disabled={requesting || devices.length === 0} className="mt-2 rounded-xl border border-[#a6d8c8] bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#146a56]">
            {devices.length === 0 ? <option value="">No cameras found</option> : devices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
          </select>
          {error && <button type="button" onClick={() => void requestCamera(selectedDeviceId || undefined)} className="mt-4 text-left text-sm font-bold text-[#b91c1c] underline underline-offset-4">Try camera permission again</button>}
          <div className="mt-7 flex gap-3">
            <button type="button" onClick={onCancel} className="rounded-xl border border-[#92c9b9] bg-white px-5 py-3 text-sm font-bold text-[#155847]">Cancel</button>
            <button type="button" disabled={requesting || !!error || !selectedDeviceId || busy} onClick={onContinue} className="flex-1 rounded-xl bg-[#146a56] px-5 py-3 text-sm font-bold text-white shadow-[0_8px_18px_rgba(20,106,86,0.22)] disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Starting...' : 'Continue'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export { WelcomeScreen as WelcomeExperienceScreen };
