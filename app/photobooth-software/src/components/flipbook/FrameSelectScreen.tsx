import { useState, useEffect, useCallback } from 'react';
import { useFlipbookStore } from '../../store/flipbook-store';
import { boothApi, type FrameItem } from '../../services/api';
import { useCountdown } from '../../hooks/useCountdown';
import { LoopingMotionPreview } from './LoopingMotionPreview';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export function FrameSelectScreen() {
  const {
    sessionId,
    coverUrls,
    videoFrames,
    selectedCoverIndex,
    selectedVideoIndex,
    publicId,
    outputGifUrl,
    setSelectedFrame,
    confirmFrameSelection,
    errorMessage,
    setError,
  } = useFlipbookStore();

  const [frames, setFrames] = useState<FrameItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [fetchingFrames, setFetchingFrames] = useState(true);

  useEffect(() => {
    setFetchingFrames(true);
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
      })
      .finally(() => {
        setFetchingFrames(false);
      });
  }, [setError]);

  const selectedFrame = frames.find((f) => f.id === selectedId) || frames[0];
  const previewCoverUrl = coverUrls[selectedCoverIndex - 1] || coverUrls[0];
  const selectedMotionFrames = videoFrames[selectedVideoIndex - 1] || [];
  const motionGifUrl = outputGifUrl
    ? `${outputGifUrl}?variant=motion`
    : (publicId ? `${API_BASE_URL}/photos/${publicId}?variant=motion` : null);

  const resolveAssetUrl = (p: string | null | undefined) => {
    if (!p) return null;
    return p.startsWith('http') ? p : `${API_BASE_URL}${p}`;
  };

  const coverSheetUrl = resolveAssetUrl(selectedFrame?.coverPath);
  const motionSheetUrl = resolveAssetUrl(selectedFrame?.backgroundPath);

  const getStripSlotStyle = (frame: FrameItem | undefined | null) => {
    const p = frame?.placements?.[0];
    if (!p) {
      return {
        left: `${(290 / 1200) * 100}%`,
        top: `${(150 / 450) * 100}%`,
        width: `${(620 / 1200) * 100}%`,
        height: `${(348.75 / 450) * 100}%`,
      };
    }
    return {
      left: `${(p.x / 1200) * 100}%`,
      top: `${((p.y % 450) / 450) * 100}%`,
      width: `${(p.width / 1200) * 100}%`,
      height: `${(p.height / 450) * 100}%`,
    };
  };

  const handleConfirm = useCallback(async () => {
    if (!selectedFrame || loading) return;
    setSelectedFrame(selectedFrame);
    setError(null);

    if (!sessionId) {
      confirmFrameSelection();
      return;
    }

    setLoading(true);
    try {
      await boothApi.selectFrame(sessionId, selectedFrame.id);
      confirmFrameSelection();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [selectedFrame, loading, sessionId, setSelectedFrame, setError, confirmFrameSelection]);

  // 5-minute countdown auto-confirming the selected frame if unattended
  const { formattedMMSS } = useCountdown({
    seconds: 300,
    autoStart: true,
    onExpire: () => {
      handleConfirm();
    },
  });

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = (index + 1) % frames.length;
      setSelectedId(frames[nextIndex].id);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = (index - 1 + frames.length) % frames.length;
      setSelectedId(frames[prevIndex].id);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setSelectedId(frames[index].id);
    }
  };

  return (
    <div className="relative flex w-full min-h-[calc(100vh-77px)] flex-col items-center justify-center overflow-hidden bg-[#ecfff8] px-6 lg:px-12 py-6 text-[#113b33]">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 w-full max-w-6xl items-center my-auto">
        {/* Left Column: Exclusive 4-Instance Booklet Preview */}
        <div className="lg:col-span-6 flex flex-col items-start gap-2.5 w-full">
          <div className="flex items-center gap-2">
            <p className="text-xs font-black tracking-widest text-[#28806c] uppercase">
              PREVIEW
            </p>
            <span className="text-[10px] font-bold text-[#146a56] bg-[#146a56]/10 px-2.5 py-0.5 rounded-none">
              4.0&quot; × 1.5&quot; Booklet • {selectedFrame?.name || 'SIC Seal'}
            </span>
          </div>

          <div className="w-full max-w-[420px] flex flex-col gap-2.5 transition-all duration-300">
            {/* Instance 1: Front Cover (Page 1) - Clean artwork without photo overlay */}
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between text-[10px] font-bold text-[#28806c] px-0.5">
                <span>Front Cover</span>
                <span>Page 1</span>
              </div>
              <div className="relative w-full aspect-[8/3] rounded-none bg-[#c2ffe1] overflow-hidden shadow-sm flex items-center justify-between p-1 transition-colors duration-200">
                {coverSheetUrl ? (
                  /* Strip 1 of 4R Cover Sheet as Base Layer */
                  <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
                    <img
                      src={coverSheetUrl}
                      alt="Cover Frame"
                      className="absolute top-0 left-0 w-full max-w-none"
                      style={{ height: '400%', objectFit: 'fill', objectPosition: 'top' }}
                    />
                  </div>
                ) : (
                  <>
                    {/* Left Binding & Brand Seal */}
                    <div className="flex flex-col items-center justify-center w-[36%] h-full pr-1.5 text-center">
                      <div className="size-6 rounded-none bg-[#0e473d] text-[8px] font-black text-[#e8fff5] flex items-center justify-center">
                        SIC
                      </div>
                      <span className="mt-0.5 text-[9px] font-black tracking-wider text-[#145a49] uppercase truncate max-w-full">
                        {selectedFrame?.name || 'SIC SEAL'}
                      </span>
                    </div>

                    {/* Right Front Cover Design Area */}
                    <div className="w-[60%] h-full rounded-none flex items-center justify-center text-center px-2">
                      <span className="text-[10px] font-black tracking-wider text-[#145a49] uppercase truncate max-w-full">
                        {selectedFrame?.name || 'FRONT COVER'}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Instance 2: Cover Photo Page (Page 2 / Frame 01) - Still Cover Photo overlay in Motion Frame */}
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between text-[10px] font-bold text-[#28806c] px-0.5">
                <span>Cover Photo</span>
                <span>Page 2</span>
              </div>
              <div className="relative w-full aspect-[8/3] rounded-none bg-[#c2ffe1] overflow-hidden shadow-sm flex items-center justify-between p-1 transition-colors duration-200">
                {motionSheetUrl ? (
                  <>
                    {/* Strip 1 of 4R Motion Sheet as Base Layer (z-0) */}
                    <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
                      <img
                        src={motionSheetUrl}
                        alt="Motion Frame"
                        className="absolute top-0 left-0 w-full max-w-none"
                        style={{ height: '400%', objectFit: 'fill', objectPosition: 'top' }}
                      />
                    </div>
                    {/* Still Cover Photo placed ON TOP of slot using template placement (z-10) */}
                    <div
                      className="absolute rounded-none overflow-hidden bg-black/20 z-10 shadow-sm"
                      style={getStripSlotStyle(selectedFrame)}
                    >
                      {previewCoverUrl ? (
                        <img
                          src={previewCoverUrl}
                          alt="Cover Photo Preview"
                          className="size-full object-cover transition-opacity duration-200"
                        />
                      ) : (
                        <div className="size-full flex items-center justify-center text-[9px] font-bold text-[#145a49]">
                          COVER PHOTO
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    {/* Left Binding & Brand Seal */}
                    <div className="flex flex-col items-center justify-center w-[36%] h-full pr-1.5 text-center">
                      <div className="size-6 rounded-none bg-[#0e473d] text-[8px] font-black text-[#e8fff5] flex items-center justify-center">
                        SIC
                      </div>
                      <span className="mt-0.5 text-[9px] font-black tracking-wider text-[#145a49] uppercase truncate max-w-full">
                        {selectedFrame?.name || 'SIC SEAL'}
                      </span>
                    </div>

                    {/* Right Slot: Still Cover Photo */}
                    <div className="w-[60%] h-full rounded-none overflow-hidden bg-black/20 relative">
                      {previewCoverUrl ? (
                        <img
                          src={previewCoverUrl}
                          alt="Cover Photo Preview"
                          className="size-full object-cover transition-opacity duration-200"
                        />
                      ) : (
                        <div className="size-full flex items-center justify-center text-[9px] font-bold text-[#145a49]">
                          COVER PHOTO
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Instance 3: Flipbook Motion Frame (Strip 1 of Motion Sheet) - Frames 02-20 (Motion) */}
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between text-[10px] font-bold text-[#28806c] px-0.5">
                <span>Motion Pages</span>
                <span>Pages 3–21</span>
              </div>
              <div className="relative w-full aspect-[8/3] rounded-none bg-[#c2ffe1] overflow-hidden shadow-sm flex items-center justify-between p-1 transition-colors duration-200">
                {motionSheetUrl ? (
                  <>
                    {/* Strip 1 of 4R Motion Sheet as Base Layer (z-0) */}
                    <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
                      <img
                        src={motionSheetUrl}
                        alt="Motion Frame"
                        className="absolute top-0 left-0 w-full max-w-none"
                        style={{ height: '400%', objectFit: 'fill', objectPosition: 'top' }}
                      />
                    </div>
                    {/* 19 Looping Motion Frames placed ON TOP of video slot using template placement (z-10) */}
                    <div
                      className="absolute rounded-none overflow-hidden bg-black/20 z-10 shadow-sm"
                      style={getStripSlotStyle(selectedFrame)}
                    >
                      <LoopingMotionPreview
                        frames={selectedMotionFrames.slice(0, 19)}
                        motionGifUrl={motionGifUrl}
                        fallbackUrl={previewCoverUrl}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    {/* Left Binding & Brand Seal */}
                    <div className="flex flex-col items-center justify-center w-[36%] h-full pr-1.5 text-center">
                      <div className="size-6 rounded-none bg-[#0e473d] text-[8px] font-black text-[#e8fff5] flex items-center justify-center">
                        SIC
                      </div>
                      <span className="mt-0.5 text-[9px] font-black tracking-wider text-[#145a49] uppercase truncate max-w-full">
                        {selectedFrame?.name || 'SIC SEAL'}
                      </span>
                    </div>

                    {/* Right Slot: 19 Looping Motion Frames */}
                    <div className="w-[60%] h-full rounded-none overflow-hidden bg-black/20 relative">
                      <LoopingMotionPreview
                        frames={selectedMotionFrames.slice(0, 19)}
                        motionGifUrl={motionGifUrl}
                        fallbackUrl={previewCoverUrl}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Instance 4: Back Cover (Strip 2 of Cover Sheet) */}
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between text-[10px] font-bold text-[#28806c] px-0.5">
                <span>Back Cover</span>
                <span>Page 22</span>
              </div>
              <div className="relative w-full aspect-[8/3] rounded-none bg-[#0e473d] overflow-hidden shadow-sm flex items-center justify-between p-1 transition-colors duration-200 text-white">
                {coverSheetUrl ? (
                  <div className="absolute inset-0 overflow-hidden">
                    <img
                      src={coverSheetUrl}
                      alt="Back Cover Frame"
                      className="absolute left-0 w-full max-w-none"
                      style={{ height: '400%', top: '-100%', objectFit: 'fill' }}
                    />
                  </div>
                ) : (
                  <>
                    {/* Left Binding Area */}
                    <div className="flex flex-col items-center justify-center w-[36%] h-full pr-1.5 text-center">
                      <div className="size-6 rounded-none bg-[#146a56] text-[8px] font-black text-[#e8fff5] flex items-center justify-center">
                        SIC
                      </div>
                      <span className="mt-0.5 text-[7px] font-mono text-[#a8f3dd] tracking-wider uppercase">
                        BINDING
                      </span>
                    </div>

                    {/* Right Template Closing Graphic */}
                    <div className="w-[60%] h-full flex flex-col items-center justify-center text-center px-2">
                      <p className="text-[10px] font-black tracking-widest text-[#a8f3dd] uppercase truncate max-w-full">
                        {selectedFrame?.name || 'SOCIETY OF INNOVATIVE COMPUTING'}
                      </p>
                      <p className="text-[8px] text-[#c5eee1] mt-0.5">
                        UMak-SIC
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Header, Timer Badge, Frame Selector & Action Button */}
        <div className="lg:col-span-6 flex flex-col gap-4 w-full">
          {/* Top Row: Category Label + Auto-select Timer Badge */}
          <div className="flex items-center justify-between w-full">
            <p className="text-[12px] font-bold tracking-[0.14em] text-[#28806c] uppercase">
              FLIPBOOK
            </p>
            <span className="rounded-none bg-[#146a56]/10 border border-[#146a56]/20 px-3.5 py-1 text-[12px] font-bold text-[#146a56] shadow-sm">
              Auto-selects in {formattedMMSS}
            </span>
          </div>

          {/* Heading */}
          <div>
            <h4 className="text-[36px] md:text-[40px] font-black tracking-[-0.05em] leading-none text-[#113b33]">
              Choose a frame.
            </h4>
          </div>

          {errorMessage && (
            <div className="flex items-center gap-3 rounded-none bg-[#b91c1c] px-4 py-2 text-white shadow-md">
              <svg className="size-4 text-white shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="text-xs font-semibold">{errorMessage}</span>
            </div>
          )}

          {/* Available Designs Header */}
          <div className="flex items-center justify-between pt-1">
            <p className="text-xs font-black tracking-widest text-[#28806c] uppercase">AVAILABLE DESIGNS</p>
            <span className="text-xs text-[#5b8176] font-semibold">{frames.length} options</span>
          </div>

          {/* Scrollable Frame List with Miniature Swatches */}
          <div
            role="radiogroup"
            aria-label="Booklet Frame Selection"
            className="flex flex-col gap-2.5 overflow-y-auto max-h-[290px] md:max-h-[320px] pr-2"
          >
            {fetchingFrames ? (
              // Loading Skeleton
              [1, 2, 3].map((n) => (
                <div key={n} className="h-14 w-full bg-white/60 animate-pulse rounded-none" />
              ))
            ) : (
              frames.map((frame, index) => {
                const isSelected = frame.id === selectedId;
                const frameCoverUrl = resolveAssetUrl(frame.coverPath);
                return (
                  <button
                    key={frame.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setSelectedId(frame.id)}
                    onKeyDown={(e) => handleKeyDown(e, index)}
                    className={`rounded-none border-0 px-4 py-3 text-left transition-all cursor-pointer flex items-center justify-between gap-3.5 ${
                      isSelected
                        ? 'bg-[#e7fff7] shadow-md ring-2 ring-[#1a7e67]'
                        : 'bg-white hover:bg-[#f2faf7] shadow-sm'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Mini Visual Swatch */}
                      <div className={`size-10 shrink-0 rounded-none overflow-hidden relative border ${
                        isSelected ? 'border-[#146a56] bg-[#c2ffe1]' : 'border-gray-200 bg-gray-100'
                      }`}>
                        {frameCoverUrl ? (
                          <div className="size-full overflow-hidden relative">
                            <img
                              src={frameCoverUrl}
                              alt={frame.name}
                              className="absolute top-0 left-0 w-full"
                              style={{ height: '400%', objectFit: 'cover', objectPosition: 'top' }}
                            />
                          </div>
                        ) : (
                          <div className="size-full flex items-center justify-between p-0.5">
                            <div className="w-[35%] h-full bg-[#0e473d] flex items-center justify-center text-[6px] font-black text-white">
                              SIC
                            </div>
                            <div className="w-[60%] h-full bg-black/15" />
                          </div>
                        )}
                      </div>

                      <strong className="block text-[15px] font-bold text-[#113b33] truncate">
                        {frame.name}
                      </strong>
                    </div>

                    <span className={`shrink-0 rounded-none px-2.5 py-1 text-[11px] font-bold transition ${
                      isSelected
                        ? 'bg-[#146a56] text-white shadow-sm'
                        : 'bg-[#146a56]/10 text-[#146a56]'
                    }`}>
                      {isSelected ? '✓ Selected' : 'Choose'}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* Confirm Action Button */}
          <div className="pt-1">
            <button
              type="button"
              disabled={loading || !selectedFrame}
              onClick={handleConfirm}
              className="w-full rounded-xl bg-[#146a56] px-6 py-3.5 text-[15px] font-black text-white shadow-[0_6px_16px_rgba(20,106,86,0.2)] transition hover:bg-[#115746] active:scale-[0.98] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin size-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Confirming frame...</span>
                </>
              ) : (
                <span>Use {selectedFrame?.name || 'Frame'} →</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
