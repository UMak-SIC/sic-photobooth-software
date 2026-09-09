import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { fireCelebrationConfetti } from '../../utils/confetti';

export interface PrintModalProps {
  publicId?: string;
  qrUrl?: string;
  outputImageUrl?: string;
  templateName?: string;
  orientation?: 'portrait' | 'landscape';
  outputWidth?: number;
  outputHeight?: number;
  preview?: boolean;
  isPrinted?: boolean;
  copiesPrinted?: number;
  eventDate?: string;
  onPrintConfirmed?: (copies: number, recordOnly?: boolean) => Promise<void> | void;
  onFinishSession?: () => void;
}

export const PrintModal: React.FC<PrintModalProps> = ({
  publicId = 'M7p4XaV',
  qrUrl = 'https://myphotobooth.com/M7p4XaV',
  outputImageUrl = '',
  preview = false,
  isPrinted: externalIsPrinted = false,
  eventDate,
  onPrintConfirmed,
  onFinishSession,
}) => {
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [hasPrinted, setHasPrinted] = useState<boolean>(externalIsPrinted);
  const [printError, setPrintError] = useState<string | null>(null);
  const [showPrintRecord, setShowPrintRecord] = useState<boolean>(false);
  const [recoveryCopies, setRecoveryCopies] = useState<number>(1);
  const [showUnprintedWarning, setShowUnprintedWarning] = useState<boolean>(false);

  useEffect(() => {
    if (!preview) {
      fireCelebrationConfetti();
    }
  }, [preview]);

  useEffect(() => {
    if (externalIsPrinted) {
      setHasPrinted(true);
    }
  }, [externalIsPrinted]);

  useEffect(() => {
    if (preview) return;
    if (qrUrl) {
      QRCode.toDataURL(qrUrl, {
        margin: 1,
        width: 320,
        color: { dark: '#000000', light: '#ffffff' },
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.warn('QR code generation failed:', err));
    }
  }, [qrUrl, preview]);

  const handleDirectPrint = () => {
    setPrintError(null);
    setShowUnprintedWarning(false);
    window.print();
    setShowPrintRecord(true);
    if (onPrintConfirmed) {
      onPrintConfirmed(1, false);
    }
    setHasPrinted(true);
  };

  const handleRecordManualCopies = async (copiesToRecord: number = 1) => {
    setIsPrinting(true);
    try {
      if (onPrintConfirmed) {
        await onPrintConfirmed(copiesToRecord, true);
      }
      setHasPrinted(true);
      setPrintError(null);
    } catch (err) {
      console.error('Failed to record print status:', err);
      setPrintError(
        'Printing was not confirmed. Complete printing in Firefox/CUPS, then record the printed copy count.',
      );
    } finally {
      setIsPrinting(false);
    }
  };

  const handleFinishAttempt = () => {
    if (!hasPrinted) {
      setShowUnprintedWarning(true);
      return;
    }
    if (onFinishSession) {
      onFinishSession();
    }
  };

  const handleForceFinish = () => {
    setShowUnprintedWarning(false);
    if (onFinishSession) {
      onFinishSession();
    }
  };

  const formattedPublicId = publicId || 'M7p4XaV';

  const stripDate = (() => {
    if (eventDate) {
      const parsed = new Date(eventDate);
      if (!isNaN(parsed.getTime())) {
        return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      }
      return eventDate;
    }
    return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  })();

  return (
    <>
      <div className="print-only-target" aria-hidden="true">
        {outputImageUrl ? (
          <div className="relative size-full">
            <img src={outputImageUrl} alt={`Photo Strip ${formattedPublicId}`} />
            <div className="absolute bottom-3.5 left-4 pointer-events-none">
             <span className="font-['Nunito',sans-serif] text-xs sm:text-sm font-bold tracking-wide text-white/80 bg-black/20 px-2 py-0.5 rounded">
                {stripDate}
              </span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="relative flex min-h-[100dvh] w-full flex-col items-center justify-center overflow-hidden bg-white px-6 sm:px-12 py-8 select-none font-['Nunito',sans-serif] text-[#1f2937]">
        <div className="flex flex-col lg:flex-row items-center justify-center gap-14 lg:gap-24 xl:gap-32 w-full max-w-7xl my-auto">
          <div className="flex flex-col items-center justify-center">
            <div className="relative flex items-center justify-center overflow-hidden rounded-2xl bg-white shadow-2xl transition-all">
              {outputImageUrl ? (
                <div className="relative">
                  <img
                    src={outputImageUrl}
                    alt={`Photo Strip Output ${formattedPublicId}`}
                    className="max-h-[calc(100dvh-120px)] w-auto object-contain rounded-2xl"
                  />
                  <div className="absolute bottom-3.5 left-4 pointer-events-none">
                    <span className="text-xs sm:text-sm font-bold tracking-wide text-white bg-black/5 rounded-full p-2 px-3 drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
                      {stripDate}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex size-full min-h-[420px] min-w-[240px] flex-col items-center justify-center rounded-2xl bg-[#f3f4f6] text-[#6b7280] font-bold p-8">
                  <span>Photo Strip Ready</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col items-center justify-center text-center w-full max-w-[440px]">
            <div className="flex items-center justify-center">
              <img
                src="/assets/images/logo.svg"
                alt="SIC Photobooth Logo"
                className="w-14 h-14 sm:w-16 sm:h-16 object-contain pointer-events-none drop-shadow-sm"
              />
            </div>

            <p className="mt-2 text-xs sm:text-sm font-bold text-[#4b5563] tracking-widest uppercase">
              SIC PHOTOBOOTH
            </p>

            <h1 className="mt-1 text-3xl sm:text-4xl md:text-5xl font-bold text-[#1f2937] leading-tight tracking-tight ">
              Your masterpiece is ready!
            </h1>

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

            <p className="mt-5 text-xl sm:text-2xl font-bold text-[#1f2937] tracking-tight">
              Scan to see your copy!
            </p>

            <p className="mt-1 font-['Nunito',sans-serif] text-xl sm:text-2xl font-extrabold text-[#008037] tracking-wider">
              {formattedPublicId}
            </p>

            {(printError || showPrintRecord) && (
              <div
                className={`mt-4 flex w-full flex-col gap-2.5 rounded-xl border p-3.5 text-left text-xs font-bold shadow-md ${
                  printError
                    ? 'border-red-300 bg-red-50 text-red-800'
                    : 'border-[#7bc6a5] bg-[#f0faf5] text-[#146a56]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p>
                    {printError ||
                      'After printing, record the printed copy count if needed.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setPrintError(null);
                      setShowPrintRecord(false);
                    }}
                    className="text-xs font-bold underline hover:opacity-80 cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
                <div className="flex items-center gap-2 border-t border-current/15 pt-2">
                  <input
                    type="number"
                    min="1"
                    max="10"
                    aria-label="Printed copy count"
                    value={recoveryCopies}
                    onChange={(e) =>
                      setRecoveryCopies(Math.max(1, parseInt(e.target.value, 10) || 1))
                    }
                    className="w-14 rounded border border-current/30 bg-white px-2 py-1 text-xs font-bold"
                  />
                  <button
                    type="button"
                    onClick={() => handleRecordManualCopies(recoveryCopies)}
                    disabled={isPrinting}
                    className="cursor-pointer rounded-lg px-3 py-1 text-xs font-bold text-white bg-[#146a56] hover:bg-[#0f5444]"
                  >
                    Record copies
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-center gap-4 sm:gap-6 w-full mt-6 sm:mt-8">
              <button
                type="button"
                onClick={handleFinishAttempt}
                className="flex-1 rounded-full px-6 sm:px-8 py-3.5 sm:py-4 bg-[#e5e7eb] hover:bg-[#d8dbdf] active:scale-95 text-[#1f2937] font-bold text-base sm:text-lg transition shadow-sm cursor-pointer whitespace-nowrap"
              >
                Session Done!
              </button>

              <button
                type="button"
                onClick={handleDirectPrint}
                disabled={isPrinting}
                className="flex-1 rounded-full px-7 sm:px-9 py-2.5 sm:py-3 bg-[#1e6147] hover:bg-[#164e39] active:scale-95 text-white font-bold text-xl sm:text-2xl transition shadow-md cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2 whitespace-nowrap"
              >
                {isPrinting ? (
                  <>
                    <span className="inline-block size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Printing...</span>
                  </>
                ) : (
                  'Print'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {showUnprintedWarning && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="unprinted-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
        >
          <div className="relative w-full max-w-sm sm:max-w-md rounded-3xl bg-white p-6 sm:p-8 shadow-2xl text-center flex flex-col items-center">
            <div className="flex size-14 sm:size-16 items-center justify-center rounded-full bg-amber-100 text-amber-600 mb-4">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
            </div>

            <h3 id="unprinted-modal-title" className="text-xl sm:text-2xl font-bold text-[#1f2937]">
              Not printed yet?
            </h3>
            <p className="mt-2 text-sm sm:text-base font-bold text-[#4b5563]">
              Your photo strip hasn't been printed yet. Would you like to print now before exiting?
            </p>

            <div className="mt-6 flex flex-col gap-3 w-full">
              <button
                type="button"
                onClick={handleDirectPrint}
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
    </>
  );
};
