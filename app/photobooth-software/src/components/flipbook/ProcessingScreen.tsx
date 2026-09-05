import { useState, useEffect, useRef } from 'react';
import { useFlipbookStore } from '../../store/flipbook-store';
import { boothApi } from '../../services/api';

export function ProcessingScreen() {
  const { sessionId, setConfirmedOutput, resetToCoverCapture } = useFlipbookStore();
  const [progress, setProgress] = useState(15);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const hasTriggeredRef = useRef(false);

  useEffect(() => {
    if (hasTriggeredRef.current) return;
    hasTriggeredRef.current = true;

    // Progress animation ticker up to 90%
    const interval = setInterval(() => {
      setProgress((prev) => (prev < 90 ? prev + 5 : prev));
    }, 400);

    // Strict 2-minute (120s) client watchdog
    const timeoutTimer = setTimeout(async () => {
      clearInterval(interval);
      setErrorStatus('GIF processing took too long. Please recapture this flipbook.');
      if (sessionId) {
        await boothApi.resetRecovery(sessionId);
      }
      setTimeout(() => {
        resetToCoverCapture();
      }, 3000);
    }, 120000);

    // Call backend processing endpoint
    const executeProcessing = async () => {
      try {
        if (!sessionId) {
          // Mock response for UI testing
          setTimeout(() => {
            clearInterval(interval);
            clearTimeout(timeoutTimer);
            setProgress(100);
            setConfirmedOutput('aB3x9Z1', 'https://myphotobooth.com/aB3x9Z1');
          }, 2000);
          return;
        }

        const data = await boothApi.processFlipbookGif(sessionId);
        clearInterval(interval);
        clearTimeout(timeoutTimer);
        setProgress(100);
        setConfirmedOutput(data.publicId, data.qrUrl);
      } catch (err: unknown) {
        clearInterval(interval);
        clearTimeout(timeoutTimer);
        const msg =
          err instanceof Error
            ? err.message
            : 'GIF processing took too long. Please recapture this flipbook.';
        setErrorStatus(msg);

        if (sessionId) {
          await boothApi.resetRecovery(sessionId);
        }
        setTimeout(() => {
          resetToCoverCapture();
        }, 3000);
      }
    };

    executeProcessing();

    return () => {
      clearInterval(interval);
      clearTimeout(timeoutTimer);
    };
  }, [sessionId, setConfirmedOutput, resetToCoverCapture]);

  return (
    <div className="relative grid w-full min-h-[calc(100vh-77px)] place-items-center overflow-hidden bg-[#ecfff8] px-8 text-[#113b33]">
      <div className="max-w-[620px] text-center px-8">
        {/* Visual Orb Spinner */}
        <div className="relative mx-auto grid size-52 place-items-center">
          <div className="size-48 rounded-full border-4 border-[#a8f3dd] border-t-[#146a56] animate-spin" />
          <span className="absolute text-[32px] font-black text-[#146a56]">{progress}%</span>
        </div>

        <p className="mt-10 text-[13px] font-bold tracking-[0.15em] text-[#28806c]">
          CREATING YOUR FLIPBOOK
        </p>
        <h4 className="mt-3 text-[44px] font-black tracking-[-0.06em]">
          Your motion is taking shape.
        </h4>
        <p className="mt-5 text-[16px] leading-7 text-[#5b8176]">
          We are building a looping GIF from your selected cover and clip. This usually takes a
          moment.
        </p>

        {/* Error / Timeout Recovery Notice */}
        {errorStatus && (
          <div className="mt-8 rounded-xl bg-[#b91c1c] p-4 text-white font-bold shadow-lg animate-bounce">
            <p className="text-sm">{errorStatus}</p>
            <p className="text-xs font-normal mt-1 opacity-90">Restarting at cover capture...</p>
          </div>
        )}
      </div>
    </div>
  );
}
