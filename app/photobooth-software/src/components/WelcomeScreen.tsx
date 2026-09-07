import { useEffect, useRef, useState } from 'react';
import { useFlipbookStore } from '../store/flipbook-store';
import { usePhotoStripStore } from '../store/photostrip-store';
import { useSessionStore } from '../store/session-store';
import { SELECTED_CAMERA_STORAGE_KEY } from '../hooks/useCamera';

export interface WelcomeScreenProps {
  preview?: boolean;
}

export function WelcomeScreen({ preview = false }: WelcomeScreenProps = {}) {
  const { setStep: setFlipbookStep } = useFlipbookStore();
  const { setStep: setPhotoStripStep } = usePhotoStripStore();
  const { setActiveSession } = useSessionStore();
  const [cameraChoice, setCameraChoice] = useState<'photo_strip' | 'flipbook' | null>(null);
  const [stage, setStage] = useState<'welcome' | 'choose_experience'>('welcome');

  const handleTouchScreen = () => {
    if (preview) return;
    setStage('choose_experience');
  };

  const handleStartPhotoStrip = () => {
    if (preview) return;
    setCameraChoice('photo_strip');
  };

  const handleStartFlipbook = () => {
    if (preview) return;
    setCameraChoice('flipbook');
  };

  const handleCameraReady = () => {
    if (cameraChoice === 'photo_strip') {
      setActiveSession({ id: '', type: 'photo_strip' });
      setPhotoStripStep('setup');
    } else if (cameraChoice === 'flipbook') {
      setActiveSession({ id: '', type: 'flipbook' });
      setFlipbookStep('setup');
    }
    setCameraChoice(null);
  };

  if (stage === 'welcome') {
    return (
      <div
        onClick={handleTouchScreen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') handleTouchScreen();
        }}
        tabIndex={0}
        role="button"
        aria-label="Welcome screen. Touch the screen to begin"
        className="relative flex h-[100dvh] w-full flex-col justify-between overflow-hidden bg-[#8ac6ff] select-none cursor-pointer outline-none"
      >
        {/* Top & Middle Landscape Area */}
        <div className="relative flex-1 w-full flex flex-col items-center pt-4 sm:pt-6 md:pt-8 pb-0 overflow-hidden">
          {/* Pixel Background Image (Sky, Clouds, Green Hill) */}
        <div
          className="absolute inset-0 bg-cover bg-no-repeat pointer-events-none"
          style={{
            backgroundImage: "url('/assets/images/bg-first-page.svg')",
            backgroundPosition: "center calc(100%)", 
          }}
        />

          {/* SIC / University of Makati Seal Logo */}
          <div className="relative z-10 flex justify-center">
            <img
              src="/assets/images/logo.svg"
              alt="University of Makati - Society of Innovative Computing"
              className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 lg:w-28 lg:h-28 object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.15)] transition-transform duration-300 hover:scale-105"
            />
          </div>

          {/* Center Graphic Headline: sic-here-to-make-memories.svg */}
          <div className="relative z-10 w-full px-4 max-w-l sm:max-w-2xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl">
            <img
              src="/assets/images/sic-here-to-make-memories.svg"
              alt="Here To Make Memories!"
              className="w-full h-auto max-h-[140px] sm:max-h-[170px] md:max-h-[200px] lg:max-h-[230px] object-contain drop-shadow-[0_6px_16px_rgba(0,0,0,0.15)] select-none pointer-events-none"
            />
          </div>

          {/* Left Robot Mascot with Megaphone (Clipped to very left edge) */}
          <div className="absolute -left-2 sm:-left-4 md:-left-6 lg:-left-8 bottom-[-40px] z-10 w-[46%] sm:w-[46%] md:w-[44%] lg:w-[42%] max-w-[520px] sm:max-w-[580px] md:max-w-[660px] lg:max-w-[740px] pointer-events-none translate-y-6 sm:translate-y-8 md:translate-y-12">
            <img
              src="/assets/images/left-bot.svg"
              alt="SIC Robot Mascot with Megaphone"
              className="w-full h-auto object-contain object-left-bottom drop-shadow-[0_12px_24px_rgba(0,0,0,0.25)]"
            />
          </div>

          {/* Right Robot Mascot with Lightbulb (Clipped to very right edge) */}
          <div className="absolute -right-2 sm:-right-4 md:-right-6 lg:-right-8 bottom-0 z-10 w-[45%] sm:w-[40%] md:w-[37%] lg:w-[35%] max-w-[420px] sm:max-w-[480px] md:max-w-[560px] lg:max-w-[640px] pointer-events-none flex justify-end translate-y-6 sm:translate-y-8 md:translate-y-12">
            <img
              src="/assets/images/right-bot.svg"
              alt="SIC Robot Mascot with Lightbulb"
              className="w-full h-auto object-contain object-right-bottom drop-shadow-[0_12px_24px_rgba(0,0,0,0.25)]"
            />
          </div>
        </div>

        {/* Bottom Section: Solid White Div Overlapping the Background and Mascots */}
        <div className="relative z-20 w-full bg-white py-6 sm:py-7 md:py-9 px-7 flex flex-col items-center justify-center text-center shadow-[0_-12px_30px_rgba(0,0,0,0.06)]">
          <p className="text-2xl sm:text-3xl md:text-4xl lg:text-[40px] font-bold tracking-tight uppercase text-[#276d4e]">
            SIC PHOTOBOOTH
          </p>
          <div className="mt-1.5 sm:mt-2.5 flex items-center justify-center gap-2.5 sm:gap-3 text-lg sm:text-xl md:text-2xl lg:text-[26px] font-normal tracking-normal text-[#276d4e]">
            <span>Touch the screen</span>
            <img
              src="/assets/images/touch-screen-icon.svg"
              alt="Touch icon"
              className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 object-contain animate-bounce"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-[100dvh] w-full flex-col items-center justify-center gap-8 sm:gap-12 overflow-hidden bg-[#ecfff8] px-6 sm:px-8 py-8 sm:py-12 text-[#113b33]">
      {/* Back to Welcome Screen Button */}
      <button
        type="button"
        onClick={() => setStage('welcome')}
        className="absolute top-6 left-6 flex items-center gap-2 rounded-xl border border-[#92c9b9] bg-white px-4 py-2.5 text-sm font-bold text-[#155847] shadow-sm hover:bg-[#e6f7f0] transition active:scale-95"
      >
        <span>←</span>
        <span>Back to Welcome</span>
      </button>

      <div className="text-center mt-4">
        <p className="text-xs sm:text-sm font-bold tracking-[0.22em] text-[#276d4e] mb-3 uppercase">
          SIC PHOTOBOOTH
        </p>
        <h2 className="text-4xl sm:text-5xl md:text-6xl font-black leading-[0.95] tracking-[-0.05em] text-[#113b33]">
          What are we creating today?
        </h2>
        <p className="mt-3 text-sm sm:text-base text-[#467266] max-w-lg mx-auto">
          Choose your favorite photobooth experience to get started.
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-8 max-w-4xl w-full">
        {/* Photo Strips Option */}
        <button
          type="button"
          onClick={handleStartPhotoStrip}
          className="group flex flex-1 min-w-[280px] max-w-[360px] flex-col items-center gap-6 overflow-hidden rounded-3xl bg-[#276d4e] px-10 py-12 shadow-2xl transition hover:-translate-y-2 hover:bg-[#1f5940] hover:shadow-[0_20px_35px_rgba(39,109,78,0.35)] active:scale-[0.98] cursor-pointer"
        >
          <div className="visual-strip size-40 rounded-2xl bg-[#174834] flex items-center justify-center font-black text-[#9ef0dc] text-xl shadow-inner border border-white/10 group-hover:scale-105 transition duration-300">
            PHOTO STRIP
          </div>
          <div className="text-center">
            <h3 className="text-2xl font-black tracking-[-0.03em] text-white">
              PHOTO STRIPS
            </h3>
            <p className="mt-1.5 text-xs text-[#a3ecd9] font-medium">
              3 classic captures on a printable template
            </p>
          </div>
        </button>

        {/* Flipbook Option */}
        <button
          type="button"
          onClick={handleStartFlipbook}
          className="group flex flex-1 min-w-[280px] max-w-[360px] flex-col items-center gap-6 overflow-hidden rounded-3xl bg-[#276d4e] px-10 py-12 shadow-2xl transition hover:-translate-y-2 hover:bg-[#1f5940] hover:shadow-[0_20px_35px_rgba(39,109,78,0.35)] active:scale-[0.98] cursor-pointer"
        >
          <div className="visual-flip size-40 rounded-2xl bg-[#174834] flex items-center justify-center font-black text-[#9ef0dc] text-xl shadow-inner border border-white/10 group-hover:scale-105 transition duration-300">
            FLIPBOOK
          </div>
          <div className="text-center">
            <h3 className="text-2xl font-black tracking-[-0.03em] text-white">
              FLIPBOOK
            </h3>
            <p className="mt-1.5 text-xs text-[#a3ecd9] font-medium">
              Cover photo + 6-second video loop into animated GIF
            </p>
          </div>
        </button>
      </div>

      {cameraChoice && (
        <CameraSetup
          experience={cameraChoice}
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
  onCancel,
  onContinue,
}: {
  experience: 'photo_strip' | 'flipbook';
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
            <button type="button" disabled={requesting || !!error || !selectedDeviceId} onClick={onContinue} className="flex-1 rounded-xl bg-[#146a56] px-5 py-3 text-sm font-bold text-white shadow-[0_8px_18px_rgba(20,106,86,0.22)] disabled:cursor-not-allowed disabled:opacity-50">Continue</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export { WelcomeScreen as WelcomeExperienceScreen };
