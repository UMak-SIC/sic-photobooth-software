import { useState } from 'react';
import { useFlipbookStore } from '../../store/flipbook-store';
import { boothApi } from '../../services/api';

export function InstructionsScreen() {
  const { sessionId, setStep, errorMessage, setError } = useFlipbookStore();
  const [loading, setLoading] = useState(false);

  const handleStart = async () => {
    if (!sessionId) {
      setStep('frame_select');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await boothApi.acknowledgeInstructions(sessionId);
      setStep('frame_select');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      // Fallback navigate
      setStep('frame_select');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex w-full min-h-[100vh] flex-col items-center justify-center overflow-hidden bg-[#ecfff8] px-8 py-14 text-center text-[#113b33]">
      <p className="text-[13px] font-bold tracking-[0.14em] text-[#28806c]">
        FLIPBOOK INSTRUCTIONS
      </p>
      <h4 className="mt-3 text-[48px] md:text-[56px] font-black tracking-[-0.06em]">
        Bring your motion.
      </h4>

      {errorMessage && (
        <div className="mt-4 flex items-center gap-3 rounded-xl bg-[#b91c1c] px-6 py-3 text-white shadow-md">
          <svg className="size-5 text-white shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="text-sm font-semibold">{errorMessage}</span>
        </div>
      )}

      <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-7 text-left w-full max-w-5xl">
        <div className="rounded-3xl bg-[#d9f7ed] p-8 shadow-sm">
          <span className="text-[14px] font-black text-[#20745f]">01</span>
          <h5 className="mt-6 text-[22px] font-black">Choose your frame</h5>
          <p className="mt-3 text-[15px] leading-6 text-[#56796f]">
            Select a custom design for your booklet covers and pages.
          </p>
        </div>

        <div className="rounded-3xl bg-[#d9f7ed] p-8 shadow-sm">
          <span className="text-[14px] font-black text-[#20745f]">02</span>
          <h5 className="mt-6 text-[22px] font-black">Hold your pose &amp; move</h5>
          <p className="mt-3 text-[15px] leading-6 text-[#56796f]">
            Capture 3 still cover photos, followed by 3 short video recordings.
          </p>
        </div>

        <div className="rounded-3xl bg-[#d9f7ed] p-8 shadow-sm">
          <span className="text-[14px] font-black text-[#20745f]">03</span>
          <h5 className="mt-6 text-[22px] font-black">Pick your favorites</h5>
          <p className="mt-3 text-[15px] leading-6 text-[#56796f]">
            Choose your favorite cover and video clip to create your animated flipbook.
          </p>
        </div>
      </div>

      <div className="mt-14">
        <button
          type="button"
          disabled={loading}
          onClick={handleStart}
          className="rounded-2xl bg-[#146a56] px-12 py-4 text-[16px] font-bold text-white shadow-[0_8px_20px_rgba(20,106,86,0.25)] transition hover:bg-[#115746] active:scale-[0.98] cursor-pointer"
        >
          {loading ? 'Starting...' : 'Choose Frame →'}
        </button>
      </div>
    </div>
  );
}
