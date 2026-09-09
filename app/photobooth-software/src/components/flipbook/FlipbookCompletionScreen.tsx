import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { useFlipbookStore } from '../../store/flipbook-store';
import { useSessionStore } from '../../store/session-store';
import { boothApi } from '../../services/api';
import { FlipbookPrintModal } from './FlipbookPrintModal';
import { LoopingMotionPreview } from './LoopingMotionPreview';
import { fireCelebrationConfetti } from '../../utils/confetti';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export function FlipbookCompletionScreen() {
  const {
    sessionId,
    publicId,
    qrUrl,
    coverUrls,
    videoUrls,
    videoFrames,
    selectedCoverIndex,
    selectedVideoIndex,
    selectedFrame,
    outputGifUrl,
    resetFlipbook,
  } = useFlipbookStore();
  const { backToExperienceChoice } = useSessionStore();

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [hasPrinted, setHasPrinted] = useState<boolean>(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);
  const [showUnprintedWarning, setShowUnprintedWarning] = useState<boolean>(false);
  const [isFinishing, setIsFinishing] = useState<boolean>(false);

  const previewCoverUrl = coverUrls[selectedCoverIndex - 1] || coverUrls[0];
  const selectedVideoUrl = videoUrls[selectedVideoIndex - 1] || videoUrls[0];
  const selectedMotionFrames = videoFrames[selectedVideoIndex - 1] || [];
  const publicCode = publicId || 'M7p4XaV';
  const formattedPublicId = publicCode;
  const qrDisplayUrl = qrUrl || `https://myphotobooth.com/${publicCode}`;
  const motionGifUrl = outputGifUrl
    ? `${outputGifUrl}?variant=motion`
    : publicId
      ? `${API_BASE_URL}/photos/${publicId}?variant=motion`
      : null;

  useEffect(() => {
    fireCelebrationConfetti();
  }, []);

  useEffect(() => {
    let isCurrent = true;
    QRCode.toDataURL(qrDisplayUrl, {
      margin: 1,
      width: 320,
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((url) => {
        if (isCurrent) {
          setQrDataUrl(url);
        }
      })
      .catch((err: unknown) => {
        console.warn('QR code generation failed:', err);
      });

    return () => {
      isCurrent = false;
    };
  }, [qrDisplayUrl]);

  const handlePrintConfirmed = async (copies: number) => {
    setHasPrinted(true);
    if (sessionId) {
      try {
        await boothApi.recordPrint(sessionId, copies);
      } catch (err) {
        console.warn('Backend recordPrint failed:', err);
      }
    }
  };

  const handleFinish = () => {
    if (isFinishing) return;
    setIsFinishing(true);
    resetFlipbook();
    backToExperienceChoice();
    setIsFinishing(false);
  };

  const handleFinishAttempt = () => {
    if (!hasPrinted) {
      setShowUnprintedWarning(true);
      return;
    }
    handleFinish();
  };

  const handleForceFinish = () => {
    setShowUnprintedWarning(false);
    handleFinish();
  };

  const resolveAssetUrl = (p: string | null | undefined) => {
    if (!p) return null;
    return p.startsWith('http') ? p : `${API_BASE_URL}${p}`;
  };

  const coverSheetUrl = resolveAssetUrl(selectedFrame?.coverPath);
  const motionSheetUrl = resolveAssetUrl(selectedFrame?.backgroundPath);

  const getStripSlotStyle = (frame: typeof selectedFrame) => {
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

  return (
    <>
      {/* Main Screen Interface with exact PrintModal layout & typography */}
      <div className="relative flex min-h-[100dvh] w-full flex-col items-center justify-center overflow-hidden bg-white px-6 sm:px-12 py-8 select-none font-['Nunito',sans-serif] text-[#1f2937]">
        {/* Main Content: 2-Column Split Layout */}
        <div className="flex flex-col lg:flex-row items-center justify-center gap-10 lg:gap-14 xl:gap-20 w-full max-w-7xl my-auto">
          {/* Left Column: Final Flipbook Booklet Stack Preview with section labels */}
          <div className="flex flex-col items-center justify-center w-full max-w-[350px] lg:max-w-[410px] xl:max-w-[450px]">
            <div className="w-full rounded-2xl sm:rounded-3xl p-3 sm:p-4 transition-all flex flex-col gap-2.5">
              {/* Instance 1: Front Cover */}
              <div className="flex flex-col w-full gap-0.5 text-left">
                <span className="text-xs sm:text-sm font-bold text-[#1d1f26]">Front Cover</span>
                <div className="relative w-full aspect-[8/3] rounded-lg sm:rounded-xl overflow-hidden shadow-sm flex items-center justify-between p-1 transition-colors duration-200 bg-gradient-to-r from-[#d8b4fe] to-[#f472b6]">
                  {coverSheetUrl ? (
                    <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
                      <img
                        src={coverSheetUrl}
                        alt="Cover Frame"
                        className="absolute top-0 left-0 w-full max-w-none"
                        style={{ height: '400%', objectFit: 'fill', objectPosition: 'top' }}
                      />
                    </div>
                  ) : (
                    <div className="size-full flex items-center justify-between px-3 py-1 bg-gradient-to-r from-[#d8b4fe] via-[#f472b6] to-[#c084fc]">
                      <div className="flex flex-col justify-center">
                        <span className="text-[10px] font-black text-white/90 uppercase tracking-wider">
                          SIC
                        </span>
                      </div>
                      <div className="w-[50%] h-[80%] rounded-md bg-white border border-white/80 shadow-xs flex items-center justify-center">
                        <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                          Front Cover
                        </span>
                      </div>
                      <span className="text-xs font-black text-white tracking-tighter drop-shadow-xs">
                        {selectedFrame?.name || 'GenSIC'}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Instance 2: Cover Photo */}
              <div className="flex flex-col w-full gap-0.5 text-left">
                <span className="text-xs sm:text-sm font-bold text-[#1d1f26]">Cover Photo</span>
                <div className="relative w-full aspect-[8/3] rounded-lg sm:rounded-xl overflow-hidden shadow-sm flex items-center justify-between p-1 transition-colors duration-200 bg-[#f3e8ff]">
                  {motionSheetUrl ? (
                    <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
                      <img
                        src={motionSheetUrl}
                        alt="Motion Frame"
                        className="absolute top-0 left-0 w-full max-w-none"
                        style={{ height: '400%', objectFit: 'fill', objectPosition: 'top' }}
                      />
                    </div>
                  ) : null}

                  {/* Photo Slot */}
                  <div
                    className="absolute rounded-md overflow-hidden bg-black/20 z-10 shadow-sm"
                    style={getStripSlotStyle(selectedFrame)}
                  >
                    {previewCoverUrl ? (
                      <img
                        src={previewCoverUrl}
                        alt="Cover Photo Preview"
                        className="size-full object-cover transition-opacity duration-200"
                      />
                    ) : (
                      <div className="size-full flex items-center justify-center text-[10px] sm:text-xs font-bold text-[#145a49] bg-[#a3a3a3]/80 text-white">
                        YOUR PHOTO HERE
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Instance 3: Motion Pages */}
              <div className="flex flex-col w-full gap-0.5 text-left">
                <span className="text-xs sm:text-sm font-bold text-[#1d1f26]">Motion Pages</span>
                <div className="relative w-full aspect-[8/3] rounded-lg sm:rounded-xl overflow-hidden shadow-sm flex items-center justify-between p-1 transition-colors duration-200 bg-[#f3e8ff]">
                  {motionSheetUrl ? (
                    <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
                      <img
                        src={motionSheetUrl}
                        alt="Motion Frame"
                        className="absolute top-0 left-0 w-full max-w-none"
                        style={{ height: '400%', objectFit: 'fill', objectPosition: 'top' }}
                      />
                    </div>
                  ) : null}

                  {/* Motion Slot */}
                  <div
                    className="absolute rounded-md overflow-hidden bg-black/20 z-10 shadow-sm"
                    style={getStripSlotStyle(selectedFrame)}
                  >
                    {selectedMotionFrames.length > 0 || motionGifUrl ? (
                      <LoopingMotionPreview
                        frames={selectedMotionFrames.slice(0, 19)}
                        motionGifUrl={motionGifUrl}
                        fallbackUrl={previewCoverUrl}
                      />
                    ) : previewCoverUrl ? (
                      <img
                        src={previewCoverUrl}
                        alt="Motion Preview"
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="size-full flex items-center justify-center text-[10px] sm:text-xs font-bold text-white bg-[#a3a3a3]/80">
                        YOUR PHOTO HERE
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Instance 4: Back Cover */}
              <div className="flex flex-col w-full gap-0.5 text-left">
                <span className="text-xs sm:text-sm font-bold text-[#1d1f26]">Back Cover</span>
                <div className="relative w-full aspect-[8/3] rounded-lg sm:rounded-xl overflow-hidden shadow-sm flex items-center justify-center p-1 transition-colors duration-200 text-white bg-gradient-to-r from-[#d8b4fe] via-[#c084fc] to-[#e879f9]">
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
                      <span className="text-[11px] font-black uppercase tracking-wider text-white drop-shadow-xs">
                        University of Makati
                      </span>
                      <span className="text-[9px] font-medium text-white/90 italic mt-0.5 drop-shadow-xs">
                        &quot;Where Peers Become Pioneers&quot;
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Logo, Headline, QR Card, Text & Action Buttons */}
          <div className="flex flex-col items-center justify-center text-center w-full max-w-[440px]">
            {/* Logo */}
            <div className="flex items-center justify-center">
              <img
                src="/assets/images/logo.svg"
                alt="SIC Photobooth Logo"
                className="w-14 h-14 sm:w-16 sm:h-16 object-contain pointer-events-none drop-shadow-sm"
              />
            </div>

            {/* Subtitle */}
            <p className="mt-2 text-xs sm:text-sm font-bold text-[#4b5563] tracking-widest uppercase">
              SIC PHOTOBOOTH
            </p>

            {/* Headline */}
            <h1 className="mt-1 text-3xl sm:text-4xl md:text-5xl font-bold text-[#1f2937] leading-tight tracking-tight">
              Your masterpiece is ready!
            </h1>

            {/* QR Code Container with Gradient Background, White Border & Shadow */}
            <div className="mt-6 flex items-center justify-center rounded-3xl sm:rounded-[32px] bg-gradient-to-b from-[#7bc6a5] to-[#3ea079] p-3 sm:p-4 border-4 sm:border-[6px] border-white shadow-[0_16px_36px_rgba(62,160,121,0.32)] transition-transform hover:scale-[1.02]">
              <div className="size-48 sm:size-56 md:size-60 rounded-2xl sm:rounded-[22px] bg-white p-2.5 sm:p-3 flex items-center justify-center overflow-hidden shadow-inner">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt={`QR Code for ${formattedPublicId}`}
                    className="size-full object-contain pointer-events-none"
                  />
                ) : (
                  <div className="size-full bg-gray-100 rounded-xl animate-pulse" />
                )}
              </div>
            </div>

            {/* Text Below QR */}
            <p className="mt-5 text-xl sm:text-2xl font-bold text-[#1f2937] tracking-tight">
              Scan to see your copy!
            </p>

            {/* Public ID in Pixel Font */}
            <p className="mt-1 font-['PressStart2P','Arcade_Gamer',monospace] text-lg sm:text-xl font-bold text-[#008037] tracking-wider">
              {formattedPublicId}
            </p>

            {/* Action Buttons Row */}
            <div className="flex items-center justify-center gap-4 sm:gap-6 w-full mt-6 sm:mt-8">
              {/* Session Done! Button */}
              <button
                type="button"
                onClick={handleFinishAttempt}
                className="flex-1 rounded-full px-6 sm:px-8 py-3.5 sm:py-4 bg-[#e5e7eb] hover:bg-[#d8dbdf] active:scale-95 text-[#1f2937] font-bold text-base sm:text-lg transition shadow-sm cursor-pointer whitespace-nowrap"
              >
                Session Done!
              </button>

              {/* Print Button */}
              <button
                type="button"
                onClick={() => {
                  setShowUnprintedWarning(false);
                  setIsPrintModalOpen(true);
                }}
                className="flex-1 rounded-full px-7 sm:px-9 py-2.5 sm:py-3 bg-[#1e6147] hover:bg-[#164e39] active:scale-95 text-white font-bold text-xl sm:text-2xl transition shadow-md cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2 whitespace-nowrap"
              >
                Print
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Unprinted Warning Modal Overlay */}
      {showUnprintedWarning && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="unprinted-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
        >
          <div className="relative w-full max-w-sm sm:max-w-md rounded-3xl bg-white p-6 sm:p-8 shadow-2xl text-center flex flex-col items-center">
            {/* Warning Icon */}
            <div className="flex size-14 sm:size-16 items-center justify-center rounded-full bg-amber-100 text-amber-600 mb-4">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
            </div>

            <h3 id="unprinted-modal-title" className="text-xl sm:text-2xl font-bold text-[#1f2937]">
              Not printed yet?
            </h3>
            <p className="mt-2 text-sm sm:text-base font-bold text-[#4b5563]">
              Your flipbook hasn&apos;t been printed yet. Would you like to print now before exiting?
            </p>

            <div className="mt-6 flex flex-col gap-3 w-full">
              <button
                type="button"
                onClick={() => {
                  setShowUnprintedWarning(false);
                  setIsPrintModalOpen(true);
                }}
                className="w-full rounded-full bg-[#1e6147] hover:bg-[#164e39] active:scale-95 px-6 py-3.5 text-base sm:text-lg font-bold text-white shadow-md transition cursor-pointer"
              >
                Print Now
              </button>
              <button
                type="button"
                onClick={handleForceFinish}
                className="w-full rounded-full bg-[#e5e7eb] hover:bg-[#d8dbdf] active:scale-95 px-6 py-3 text-sm sm:text-base font-bold text-[#1f2937] transition cursor-pointer"
              >
                Exit Anyway
              </button>
              <button
                type="button"
                onClick={() => setShowUnprintedWarning(false)}
                className="pt-1 text-sm font-bold text-[#6b7280] hover:text-[#1f2937] underline cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print Handoff Modal */}
      {isPrintModalOpen && (
        <FlipbookPrintModal
          publicId={publicCode}
          coverUrl={previewCoverUrl}
          videoUrl={selectedVideoUrl || undefined}
          motionFrames={selectedMotionFrames}
          frame={selectedFrame}
          onPrintConfirmed={handlePrintConfirmed}
          onClose={() => setIsPrintModalOpen(false)}
        />
      )}
    </>
  );
}
