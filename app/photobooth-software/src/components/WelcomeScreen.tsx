import { useState } from 'react';
import { useFlipbookStore } from '../store/flipbook-store';
import { usePhotoStripStore } from '../store/photostrip-store';
import { useSessionStore } from '../store/session-store';
import { boothApi } from '../services/api';

export interface WelcomeScreenProps {
  preview?: boolean;
}

export function WelcomeScreen({ preview = false }: WelcomeScreenProps = {}) {
  const { setSession: setFlipbookSession, setStep: setFlipbookStep } = useFlipbookStore();
  const { setStep: setPhotoStripStep } = usePhotoStripStore();
  const { setActiveSession } = useSessionStore();
  const [loading, setLoading] = useState(false);

  const handleStartPhotoStrip = () => {
    if (preview) return;
    setActiveSession({ id: '', type: 'photo_strip' });
    setPhotoStripStep('setup');
  };

  const handleStartFlipbook = async () => {
    if (preview) return;
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const session = await boothApi.createSession(
        'SIC General Assembly',
        today,
        'Operator',
        'flipbook',
      );
      setFlipbookSession(session.sessionId, session.token);
      setActiveSession({ id: session.sessionId, type: 'flipbook', token: session.token });
      setFlipbookStep('instructions');
    } catch {
      // Offline fallback
      setFlipbookSession('mock-flipbook-session-id', 'mock-token');
      setActiveSession({ id: 'mock-flipbook-session-id', type: 'flipbook' });
      setFlipbookStep('instructions');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex w-full min-h-[calc(100vh-77px)] flex-col items-center justify-center gap-14 overflow-hidden bg-[#ecfff8] px-8 py-16 text-[#113b33]">
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
    </div>
  );
}

export { WelcomeScreen as WelcomeExperienceScreen };
