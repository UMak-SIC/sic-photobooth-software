import React, { useState, useEffect, useCallback } from 'react';
import { useFlipbookStore } from '../../store/flipbook-store';
import { boothApi, type FrameItem, resolveAssetUrl } from '../../services/api';
import { useCountdown } from '../../hooks/useCountdown';
import { LoopingMotionPreview } from './LoopingMotionPreview';
import { FLIPBOOK_CONFIG } from '../../config/flipbook';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const DEFAULT_FRAMES: FrameItem[] = [
  {
    id: 'gensic-arcade',
    name: 'GenSIC Arcade',
    type: 'flipbook',
    isActive: true,
  },
  {
    id: 'umak-sic-classic',
    name: 'UMak SIC Classic',
    type: 'flipbook',
    isActive: true,
  },
  {
    id: 'herons-welcome',
    name: 'Herons Welcome',
    type: 'flipbook',
    isActive: true,
  },
  {
    id: 'pioneers-neon',
    name: 'Pioneers Neon',
    type: 'flipbook',
    isActive: true,
  },
  {
    id: 'cyber-green',
    name: 'Cyber Green',
    type: 'flipbook',
    isActive: true,
  },
  {
    id: 'retro-wave',
    name: 'Retro Wave',
    type: 'flipbook',
    isActive: true,
  },
];

const FRAMES_PER_PAGE = 6;
const FRAME_SELECTION_SECONDS = 60;

interface FrameSelectScreenProps {
  onBack?: () => void;
}

export function FrameSelectScreen({ onBack }: FrameSelectScreenProps = {}) {
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

  const [frames, setFrames] = useState<FrameItem[]>(DEFAULT_FRAMES);
  const [selectedId, setSelectedId] = useState<string>(DEFAULT_FRAMES[0].id);
  const [loading, setLoading] = useState(false);
  const [fetchingFrames, setFetchingFrames] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);

  useEffect(() => {
    let isMounted = true;
    setFetchingFrames(true);
    boothApi
      .listFrames()
      .then((data) => {
        if (!isMounted) return;
        if (Array.isArray(data) && data.length > 0) {
          setFrames(data);
          setSelectedId((prev) => (data.some((f) => f.id === prev) ? prev : data[0].id));
          setCurrentPage(0);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.warn('Could not fetch frames from backend, using fallbacks:', err);
      })
      .finally(() => {
        if (isMounted) {
          setFetchingFrames(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const selectedFrame = frames.find((f) => f.id === selectedId) || frames[0] || DEFAULT_FRAMES[0];
  const pageCount = Math.max(1, Math.ceil(frames.length / FRAMES_PER_PAGE));
  const visibleFrames = frames.slice(
    currentPage * FRAMES_PER_PAGE,
    (currentPage + 1) * FRAMES_PER_PAGE,
  );

  useEffect(() => {
    if (currentPage >= pageCount) {
      setCurrentPage(pageCount - 1);
    }
  }, [currentPage, pageCount]);

  const handlePageChange = (page: number) => {
    const nextPage = Math.max(0, Math.min(page, pageCount - 1));
    setCurrentPage(nextPage);
    const firstFrame = frames[nextPage * FRAMES_PER_PAGE];
    if (firstFrame) {
      setSelectedId(firstFrame.id);
    }
  };
  const previewCoverUrl = coverUrls[selectedCoverIndex - 1] || coverUrls[0];
  const selectedMotionFrames = videoFrames[selectedVideoIndex - 1] || [];
  const motionGifUrl = outputGifUrl
    ? `${outputGifUrl}?variant=motion`
    : publicId
      ? `${API_BASE_URL}/photos/${publicId}?variant=motion`
      : null;

  const coverSheetUrl = resolveAssetUrl(selectedFrame?.coverPath ?? null);
  const motionSheetUrl = resolveAssetUrl(selectedFrame?.backgroundPath ?? null);

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
      confirmFrameSelection();
    } finally {
      setLoading(false);
    }
  }, [selectedFrame, loading, sessionId, setSelectedFrame, setError, confirmFrameSelection]);

  // Auto-confirm the selected frame if unattended
  const { timeLeft } = useCountdown({
    seconds: FRAME_SELECTION_SECONDS,
    autoStart: true,
    onExpire: () => {
      handleConfirm();
    },
  });

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      const nextIndex = (index + 1) % frames.length;
      setSelectedId(frames[nextIndex].id);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevIndex = (index - 1 + frames.length) % frames.length;
      setSelectedId(frames[prevIndex].id);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setSelectedId(frames[index].id);
    }
  };

  return (
    <div className="relative flex h-full min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-[#f4f6f5] select-none font-['Nunito',sans-serif]">
      {/* Centered Kiosk Display Frame matching TemplatePicker */}
      <div className="relative flex h-[800px] max-h-[800px] w-full max-w-[1180px] flex-col justify-between overflow-hidden px-6 pt-2 pb-3 sm:px-10 sm:pt-3 sm:pb-3 text-[#1a202c]">
        {/* Main Content: Left 2-Column Grid & Right 4-Tier Booklet Preview */}
        <div className="flex flex-1 min-h-0 w-full gap-8 lg:gap-15 items-stretch overflow-visible">
          {/* Left Column: 2-Column Grid */}
          <div className="flex flex-col flex-1 min-w-0 h-full overflow-visible">
            <div className="shrink-0 mb-2 flex items-center justify-center gap-5 pt-2 text-center">
              <h1 className="text-xl sm:text-2xl lg:text-[32px] font-bold tracking-tight text-[#1d1f26]">
                Pick your Frame
              </h1>
              <div
                className="relative flex size-16 items-center justify-center sm:size-20"
                aria-live="polite"
                aria-label={`Auto continue in ${timeLeft} seconds`}
              >
                <svg className="size-full -rotate-90 transform" viewBox="0 0 64 64" aria-hidden="true">
                  <circle
                    cx="32"
                    cy="32"
                    r="27"
                    className="stroke-[#c4c9c6]"
                    strokeWidth="4"
                    fill="white"
                  />
                  <circle
                    cx="32"
                    cy="32"
                    r="27"
                    className="stroke-[#3f4642] transition-all duration-300 ease-linear"
                    strokeWidth="4"
                    strokeDasharray={169.65}
                    strokeDashoffset={
                      169.65 * (1 - Math.max(0, Math.min(1, timeLeft / FRAME_SELECTION_SECONDS)))
                    }
                    strokeLinecap="round"
                    fill="transparent"
                  />
                </svg>
                <span className="absolute font-['PressStart2P','Arcade_Gamer',monospace] text-lg font-bold leading-none text-[#3f4642] drop-shadow-xs sm:text-xl">
                  {timeLeft}
                </span>
              </div>
            </div>

            {errorMessage && (
              <div className="mb-3 flex items-center gap-3 rounded-xl bg-[#b91c1c] px-4 py-2 text-white shadow-md">
                <svg
                  className="size-4 text-white shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <span className="text-xs font-semibold">{errorMessage}</span>
              </div>
            )}

            {/* Scrollable Frames Grid */}
            {fetchingFrames && frames.length === 0 ? (
              <div className="flex flex-1 items-center justify-center">
                <div className="size-8 rounded-full border-3 border-[#058d51] border-t-transparent animate-spin" />
              </div>
            ) : (
              <div
                role="radiogroup"
                aria-label="Flipbook Frame Selection"
                className="flex flex-1 min-h-0 flex-col pr-4 lg:pr-6 pb-1 pt-1 mr-1"
              >
                <div className="grid flex-none grid-cols-2 gap-x-6 gap-y-8 lg:gap-x-8 lg:gap-y-9 pb-2 pt-1">
                  {visibleFrames.map((frame, index) => {
                    const frameIndex = currentPage * FRAMES_PER_PAGE + index;
                    const isSelected = frame.id === selectedId;
                    const frameCoverUrl = resolveAssetUrl(frame.coverPath ?? null);

                    return (
                      <button
                        key={frame.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => setSelectedId(frame.id)}
                        onKeyDown={(e) => handleKeyDown(e, frameIndex)}
                        className={`group flex scale-[1.02] flex-col items-start rounded-none bg-white p-2 shadow-xs border transition-all duration-150 active:scale-95 cursor-pointer text-left outline-none hover:shadow-md ${
                          isSelected
                            ? 'border-2 border-[#058d51] ring-2 ring-[#058d51]/40'
                            : 'border border-gray-200/80 hover:border-gray-300'
                        }`}
                      >
                        {/* Preview Artboard inside white card */}
                        <div
                          className={`relative w-full aspect-[8/3] rounded-none overflow-hidden border ${
                            isSelected ? 'border-[#058d51]/50' : 'border-gray-200'
                          } bg-gradient-to-r from-[#d8b4fe] via-[#f472b6] to-[#c084fc]`}
                        >
                          {frameCoverUrl ? (
                            <div className="size-full overflow-hidden relative">
                              <img
                                src={frameCoverUrl}
                                alt={frame.name}
                                className="absolute top-0 left-0 w-full"
                                style={{
                                  height: '400%',
                                  objectFit: 'fill',
                                  objectPosition: 'top',
                                }}
                              />
                            </div>
                          ) : (
                            <div className="size-full flex items-center justify-between px-3 py-1.5 bg-gradient-to-r from-[#d8b4fe] via-[#f472b6] to-[#c084fc]">
                              <div className="flex flex-col justify-center">
                                <span className="text-[10px] font-black text-white/90 uppercase tracking-wider">
                                  SIC
                                </span>
                              </div>
                              <div className="w-[45%] h-[75%] rounded-none bg-white/90 border border-white/80 flex items-center justify-center shadow-xs">
                                <span className="text-[8px] font-bold text-gray-400">PHOTO</span>
                              </div>
                              <span className="text-[11px] font-black text-white/95 tracking-tighter drop-shadow-xs">
                                GenSIC
                              </span>
                            </div>
                          )}

                          {/* Selected Checkmark Overlay */}
                          {isSelected && (
                            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/10 backdrop-blur-[0.5px]">
                              <img
                                src="/assets/images/check-mark.svg"
                                alt="Selected"
                                className="size-10 sm:size-12 drop-shadow-md"
                              />
                            </div>
                          )}
                        </div>

                        {/* Title of the Frame under the preview thumbnail */}
                        <p
                          className="text-sm mt-1.5 font-bold truncate max-w-full tracking-tight"
                          style={{ color: isSelected ? '#058d51' : '#2d3748' }}
                        >
                          {frame.name}
                        </p>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-auto flex shrink-0 items-center justify-center gap-4 py-2">
                  {pageCount > 1 && (
                    <button
                      type="button"
                      aria-label="Previous frame page"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 0}
                      className="flex size-14 items-center justify-center rounded-full bg-white text-[#4a5568] shadow-[0_4px_12px_rgba(0,0,0,0.12)] transition hover:text-[#058d51] active:scale-95 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <svg className="size-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m15 18-6-6 6-6" />
                      </svg>
                    </button>
                  )}

                  <div
                    className="flex min-w-32 items-center justify-center gap-2.5 rounded-xl bg-white px-6 py-3.5 shadow-[0_4px_12px_rgba(0,0,0,0.08)]"
                    aria-label={`Frame page ${currentPage + 1} of ${pageCount}`}
                  >
                    {Array.from({ length: pageCount }, (_, page) => (
                      <span
                        key={page}
                        className={`rounded-full border transition-all duration-300 ${
                          page === currentPage
                            ? 'size-4 border-[#058d51] bg-[#058d51] shadow-[0_0_0_3px_rgba(5,141,81,0.16)] animate-pulse'
                            : 'size-3 border-[#64748b] bg-white'
                        }`}
                      />
                    ))}
                  </div>

                  {pageCount > 1 && (
                    <button
                      type="button"
                      aria-label="Next frame page"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === pageCount - 1}
                      className="flex size-14 items-center justify-center rounded-full bg-white text-[#4a5568] shadow-[0_4px_12px_rgba(0,0,0,0.12)] transition hover:text-[#058d51] active:scale-95 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <svg className="size-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: 4-Tier Booklet Preview & Action Buttons (compact width so height doesn't get cut off) */}
          <div className="flex flex-col w-[300px] sm:w-[320px] lg:w-[335px] shrink-0 h-full justify-between items-center py-0">
            {/* 4 Preview Instances Stack */}
            <div className="flex flex-col w-full gap-2 my-auto">
              {/* Instance 1: Front Cover */}
              <div className="flex flex-col w-full gap-0.5">
                <span className="text-xs sm:text-sm font-bold text-[#1d1f26]">Front Cover</span>
                <div className="relative w-full aspect-[8/3] rounded-none overflow-hidden shadow-xs border border-gray-200/80 bg-gradient-to-r from-[#d8b4fe] to-[#f472b6]">
                  {coverSheetUrl ? (
                    <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
                      <img
                        src={coverSheetUrl}
                        alt="Front Cover Frame"
                        className="absolute top-0 left-0 w-full max-w-none"
                        style={{ height: '400%', objectFit: 'fill', objectPosition: 'top' }}
                      />
                    </div>
                  ) : (
                    <div className="size-full flex items-center justify-between px-3 py-1 bg-gradient-to-r from-[#d8b4fe] via-[#f472b6] to-[#c084fc]">
                      <div className="flex flex-col justify-center">
                        <span className="text-[9px] font-black text-white/90 uppercase tracking-wider">
                          SIC
                        </span>
                      </div>
                      <div className="w-[50%] h-[80%] rounded-none bg-white border border-white/80 shadow-xs flex items-center justify-center">
                        <span className="text-[8px] font-bold text-gray-400 uppercase tracking-wider">
                          Front Cover
                        </span>
                      </div>
                      <span className="text-[11px] font-black text-white tracking-tighter drop-shadow-xs">
                        GenSIC
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Instance 2: Cover Photo */}
              <div className="flex flex-col w-full gap-0.5">
                <span className="text-xs sm:text-sm font-bold text-[#1d1f26]">Cover Photo</span>
                <div className="relative w-full aspect-[8/3] rounded-none overflow-hidden shadow-xs border border-gray-200/80 bg-[#f3e8ff]">
                  {motionSheetUrl ? (
                    <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
                      <img
                        src={motionSheetUrl}
                        alt="Cover Photo Frame"
                        className="absolute top-0 left-0 w-full max-w-none"
                        style={{ height: '400%', objectFit: 'fill', objectPosition: 'top' }}
                      />
                    </div>
                  ) : null}

                  {/* Photo Slot */}
                  <div
                    className="absolute rounded-none overflow-hidden bg-black/20 z-10 shadow-xs"
                    style={getStripSlotStyle(selectedFrame)}
                  >
                    {previewCoverUrl ? (
                      <img
                        src={previewCoverUrl}
                        alt="Cover Photo Preview"
                        className="size-full object-cover transition-opacity duration-200"
                      />
                    ) : (
                      <div className="size-full flex flex-col items-center justify-center text-center p-1 bg-[#a3a3a3]/80">
                        <span className="text-[8px] font-bold text-white/90 uppercase tracking-wider">
                          YOUR PHOTO HERE
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Instance 3: Motion Pages */}
              <div className="flex flex-col w-full gap-0.5">
                <span className="text-xs sm:text-sm font-bold text-[#1d1f26]">Motion Pages</span>
                <div className="relative w-full aspect-[8/3] rounded-none overflow-hidden shadow-xs border border-gray-200/80 bg-[#f3e8ff]">
                  {motionSheetUrl ? (
                    <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
                      <img
                        src={motionSheetUrl}
                        alt="Motion Pages Frame"
                        className="absolute top-0 left-0 w-full max-w-none"
                        style={{ height: '400%', objectFit: 'fill', objectPosition: 'top' }}
                      />
                    </div>
                  ) : null}

                  {/* Motion Slot */}
                  <div
                    className="absolute rounded-none overflow-hidden bg-black/20 z-10 shadow-xs"
                    style={getStripSlotStyle(selectedFrame)}
                  >
                    {selectedMotionFrames.length > 0 || motionGifUrl ? (
                      <LoopingMotionPreview
                        frames={selectedMotionFrames.slice(0, FLIPBOOK_CONFIG.motionFrameCount)}
                        motionGifUrl={motionGifUrl}
                        fallbackUrl={previewCoverUrl}
                      />
                    ) : (
                      <div className="size-full flex flex-col items-center justify-center text-center p-1 bg-[#a3a3a3]/80">
                        <span className="text-[8px] font-bold text-white/90 uppercase tracking-wider">
                          YOUR PHOTO HERE
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Instance 4: Back Cover */}
              <div className="flex flex-col w-full gap-0.5">
                <span className="text-xs sm:text-sm font-bold text-[#1d1f26]">Back Cover</span>
                <div className="relative w-full aspect-[8/3] rounded-none overflow-hidden shadow-xs border border-gray-200/80 bg-gradient-to-r from-[#d8b4fe] via-[#c084fc] to-[#e879f9] flex items-center justify-center text-white">
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
                    <div className="flex flex-col items-center justify-center text-center p-1.5">
                      <span className="text-[10px] font-black uppercase tracking-wider text-white drop-shadow-xs">
                        University of Makati
                      </span>
                      <span className="text-[8px] font-medium text-white/90 italic mt-0.5 drop-shadow-xs">
                        &quot;Where Peers Become Pioneers&quot;
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom: Action Controls Row */}
            <div className="flex items-end justify-between w-full mt-3 mb-1 gap-3 shrink-0">
              {/* Back Button */}
              {onBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  className="inline-flex items-center gap-2 px-5 sm:px-6 py-2 sm:py-2.5 rounded-full border-2 border-[#2d3748] text-[#2d3748] text-base sm:text-lg font-bold opacity-70 hover:bg-gray-100 hover:opacity-100 transition active:scale-95 cursor-pointer"
                >
                  <svg
                    className="size-5 stroke-current stroke-[2.5]"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  <span>Back</span>
                </button>
              ) : (
                <div />
              )}

              {/* I LIKE THIS Button */}
              <button
                type="button"
                disabled={loading || !selectedFrame}
                onClick={handleConfirm}
                className="inline-flex items-center gap-2.5 px-4 sm:px-6 py-4 sm:py-4 rounded-full bg-[#1b6d5b] hover:bg-[#145a49] text-white text-lg sm:text-xl font-bold tracking-wide shadow-[0_6px_20px_rgba(27,109,91,0.3)] transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <span>{loading ? 'Confirming...' : 'I LIKE THIS'}</span>
                <img
                  src="/assets/images/like-icon.svg"
                  alt=""
                  className="size-6 sm:size-7 object-contain pointer-events-none drop-shadow-xs"
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
