import { useState, useEffect } from 'react';
import { useFlipbookStore } from '../../store/flipbook-store';
import { boothApi, type FrameItem } from '../../services/api';

export function FrameSelectScreen() {
  const { sessionId, setSelectedFrame, setStep, setError } = useFlipbookStore();
  const [frames, setFrames] = useState<FrameItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    boothApi
      .listFrames()
      .then((data) => {
        setFrames(data);
        if (data.length > 0) {
          setSelectedId(data[0].id);
        }
      })
      .catch((err) => {
        setError(err.message);
      });
  }, [setError]);

  const handleContinue = async () => {
    const frame = frames.find((f) => f.id === selectedId);
    if (!frame) return;

    setSelectedFrame(frame);
    setError(null);

    if (!sessionId) {
      setStep('instructions');
      return;
    }

    setLoading(true);
    try {
      await boothApi.selectFrame(sessionId, frame.id);
      setStep('instructions');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const selectedFrame = frames.find((f) => f.id === selectedId);
  const { errorMessage } = useFlipbookStore();

  return (
    <div className="relative flex w-full min-h-[calc(100vh-77px)] flex-col items-center justify-center overflow-hidden bg-[#ecfff8] px-8 py-12 text-center text-[#113b33]">
      <p className="text-[13px] font-bold tracking-[0.14em] text-[#28806c]">FLIPBOOK</p>
      <h4 className="mt-2 text-[44px] md:text-[52px] font-black tracking-[-0.06em]">
        Choose a frame.
      </h4>

      {errorMessage && (
        <div className="mt-4 flex items-center gap-3 rounded-xl bg-[#b91c1c] px-6 py-3 text-white shadow-md">
          <span className="font-bold">⚠️</span>
          <span className="text-sm font-semibold">{errorMessage}</span>
        </div>
      )}

      <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8 text-left w-full max-w-5xl">
        {frames.map((frame) => {
          const isSelected = frame.id === selectedId;
          return (
            <button
              key={frame.id}
              type="button"
              onClick={() => setSelectedId(frame.id)}
              className={`rounded-3xl border-2 p-6 text-left transition-all ${
                isSelected
                  ? 'border-[#1a7e67] bg-[#e7fff7] ring-4 ring-[#79d6bf]/60 shadow-xl scale-[1.02]'
                  : 'border-[#c0e2d8] bg-white hover:border-[#8ec5b6] hover:shadow-md'
              }`}
            >
              <div className="frame-art flex items-center justify-center h-44 rounded-2xl bg-[#dcf5ec] text-[#145a49] font-black text-2xl">
                <span>{frame.name}</span>
              </div>
              <strong className="mt-5 block text-[20px] font-bold">{frame.name}</strong>
              <small className="mt-1 block text-[14px] text-[#5b8176]">Flipbook overlay</small>
            </button>
          );
        })}
      </div>

      <div className="mt-12">
        <button
          type="button"
          disabled={loading || !selectedId}
          onClick={handleContinue}
          className="rounded-2xl bg-[#146a56] px-12 py-4 text-[16px] font-bold text-white shadow-[0_8px_20px_rgba(20,106,86,0.25)] transition hover:bg-[#115746] active:scale-[0.98] disabled:opacity-50"
        >
          {loading ? 'Setting up...' : `Use ${selectedFrame?.name || 'Selected Frame'}`}
        </button>
      </div>
    </div>
  );
}
