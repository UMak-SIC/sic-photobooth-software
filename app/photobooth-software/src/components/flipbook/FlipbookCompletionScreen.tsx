import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { useFlipbookStore } from '../../store/flipbook-store';
import { boothApi } from '../../services/api';
import { FlipbookPrintModal } from './FlipbookPrintModal';
import { LoopingMotionPreview } from './LoopingMotionPreview';

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

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  const previewCoverUrl = coverUrls[selectedCoverIndex - 1] || coverUrls[0];
  const selectedVideoUrl = videoUrls[selectedVideoIndex - 1] || videoUrls[0];
  const selectedMotionFrames = videoFrames[selectedVideoIndex - 1] || [];
  const publicCode = publicId || 'M7p4XaV';
  const qrDisplayUrl = qrUrl || `https://myphotobooth.com/${publicCode}`;
  const motionGifUrl = outputGifUrl
    ? `${outputGifUrl}?variant=motion`
    : publicId
      ? `${API_BASE_URL}/photos/${publicId}?variant=motion`
      : null;

  useEffect(() => {
    let isCurrent = true;
    QRCode.toDataURL(qrDisplayUrl, {
      width: 320,
      margin: 1,
      color: {
        dark: '#0e473d',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (isCurrent) {
          setQrDataUrl(url);
        }
      })
      .catch((err: unknown) => {
        console.error('Failed to generate QR code:', err);
      });

    return () => {
      isCurrent = false;
    };
  }, [qrDisplayUrl]);

  const handlePrintConfirmed = async (copies: number) => {
    if (sessionId) {
      try {
        await boothApi.recordPrint(sessionId, copies);
      } catch (err) {
        console.warn('Backend recordPrint failed:', err);
      }
    }
  };

  const handleFinish = () => {
    resetFlipbook();
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
    <div className="relative flex min-h-[100dvh] w-full flex-col items-center justify-center overflow-hidden bg-[#ecfff8] px-6 py-6 text-center text-[#113b33] lg:px-12">
      <div className="text-center max-w-xl">
        <p className="text-[12px] font-bold tracking-[0.14em] text-[#28806c]">FLIPBOOK COMPLETE</p>
        <h4 className="mt-1 text-[34px] md:text-[40px] font-black leading-none tracking-[-0.05em]">
          Keep this memory close.
        </h4>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-8 lg:gap-12 max-w-5xl w-full my-auto">
        {/* Left Column: 4-Instance Booklet Preview Stack (Clean, no extra headers/labels) */}
        <div className="w-full max-w-[360px] md:max-w-[380px] flex flex-col gap-2 transition-all duration-300">
          {/* Instance 1: Front Cover (Strip 1 of Cover Sheet) - Clean artwork without photo overlay */}
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

          {/* Instance 2: Cover Photo Page (Page 2 / Frame 01) - Still Cover Photo overlay in Motion Frame */}
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

          {/* Instance 3: Flipbook Motion Frame (Strip 1 of Motion Sheet) - Frames 02-20 (Motion) */}
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

          {/* Instance 4: Back Cover (Strip 2 of Cover Sheet) */}
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
                  <p className="text-[8px] text-[#c5eee1] mt-0.5">UMak-SIC</p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* QR Code & Actions Box based on App.tsx design sheet */}
        <aside className="rounded-3xl bg-[#0e473d] p-6 text-white shadow-2xl w-full max-w-[320px] text-center">
          {/* Real QR Code Display */}
          <div className="mx-auto size-40 rounded-2xl bg-white p-2.5 flex flex-col items-center justify-center shadow-inner overflow-hidden">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`QR Code for ${publicCode}`}
                className="size-full object-contain"
              />
            ) : (
              <div className="text-xs text-[#0e473d] font-bold animate-pulse">Generating QR...</div>
            )}
          </div>

          <p className="mt-4 text-[13px] font-bold text-white">Scan to retrieve</p>
          <code className="mt-0.5 block text-xs text-[#9ec4b9] font-mono tracking-wider">
            {publicCode}
          </code>

          <div className="mt-5 grid gap-2.5">
            <button
              type="button"
              onClick={() => setIsPrintModalOpen(true)}
              className="rounded-xl bg-[#a8f3dd] py-2.5 text-[13px] font-bold text-[#145142] hover:bg-[#91ebd2] shadow transition cursor-pointer active:scale-[0.98]"
            >
              Open print handoff
            </button>
            <button
              type="button"
              onClick={handleFinish}
              className="rounded-xl border border-white/25 py-2.5 text-[13px] font-bold hover:bg-white/10 transition cursor-pointer active:scale-[0.98]"
            >
              Finish session
            </button>
          </div>
        </aside>
      </div>

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
    </div>
  );
}
