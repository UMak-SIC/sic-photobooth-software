import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { fireCelebrationConfetti } from '../../utils/confetti';
import { generatePhotoStripPdf, uploadPdfBlob, printPdfBlobUrl } from '../../services/flipbook-pdf';
import { boothApi, API_BASE_URL } from '../../services/api';

export interface PrintModalProps {
  sessionId?: string;
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
  onPrintConfirmed?: (copies: number, recordOnly?: boolean) => Promise<void> | void;
  onFinishSession?: () => void;
}

export const PrintModal: React.FC<PrintModalProps> = ({
  sessionId,
  publicId = 'M7p4XaV',
  qrUrl = 'https://myphotobooth.com/M7p4XaV',
  outputImageUrl = '',
  preview = false,
  isPrinted: externalIsPrinted = false,
  onPrintConfirmed,
  onFinishSession,
}) => {
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [hasPrinted, setHasPrinted] = useState<boolean>(externalIsPrinted);
  const [printError, setPrintError] = useState<string | null>(null);
  const [showPrintRecord, setShowPrintRecord] = useState<boolean>(false);
  const [recoveryCopies, setRecoveryCopies] = useState<number | ''>(1);
  const [showUnprintedWarning, setShowUnprintedWarning] = useState<boolean>(false);
  const [recordToast, setRecordToast] = useState<string | null>(null);

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

  useEffect(() => {
    if (!recordToast) return;
    const timeoutId = window.setTimeout(() => setRecordToast(null), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [recordToast]);

  const [printProgress, setPrintProgress] = useState<string | null>(null);

  const handleDirectPrint = async () => {
    setPrintError(null);
    setShowUnprintedWarning(false);
    setIsPrinting(true);
    setPrintProgress('Preparing 300 DPI PDF...');

    try {
      const formattedPublicId = publicId || 'M7p4XaV';
      if (outputImageUrl) {
        const { blob, url } = await generatePhotoStripPdf(outputImageUrl, formattedPublicId, 1);
        if (sessionId && !sessionId.startsWith('mock-')) {
          void boothApi.uploadSessionPdf(sessionId, blob);
        }
        void uploadPdfBlob(`${API_BASE_URL}/api/publications/${formattedPublicId}/pdf`, blob);
        setPrintProgress('Opening print dialog...');
        await printPdfBlobUrl(url);
      } else {
        window.print();
      }

      setHasPrinted(true);
      setShowPrintRecord(true);
    } catch (err) {
      console.error('Photo strip PDF printing failed, falling back to window.print():', err);
      try {
        window.print();
        setHasPrinted(true);
        setShowPrintRecord(true);
      } catch {
        setPrintError('Printing failed. Please try again.');
      }
    } finally {
      setIsPrinting(false);
      setPrintProgress(null);
    }
  };

  const handleRecordManualCopies = async (copiesToRecord: number = 1) => {
    setIsPrinting(true);
    setRecordToast(null);
    try {
      if (onPrintConfirmed) {
        await onPrintConfirmed(copiesToRecord, true);
      }
      setHasPrinted(true);
      setPrintError(null);
      setShowPrintRecord(false);
      setRecordToast(
        `${copiesToRecord} ${copiesToRecord === 1 ? 'copy' : 'copies'} recorded.`,
      );
    } catch (err) {
      console.error('Failed to record print status:', err);
      setHasPrinted(true);
      setPrintError(null);
      setShowPrintRecord(false);
      setRecordToast(
        `${copiesToRecord} ${copiesToRecord === 1 ? 'copy' : 'copies'} recorded.`,
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

  return (
    <>
      <div className="print-only-target" aria-hidden="true">
        {outputImageUrl ? (
          <div className="relative size-full">
            <img src={outputImageUrl} alt={`Photo Strip ${formattedPublicId}`} />
          </div>
        ) : null}
      </div>

      {/* 2. Main Screen Interface */}
      <div className="relative flex min-h-[100dvh] w-full flex-col items-center justify-center overflow-hidden bg-white px-6 sm:px-12 py-8 select-none font-['Nunito',sans-serif] text-[#1f2937]">
        {/* Main Content: 2-Column Split Layout */}
        <div className="flex flex-col lg:flex-row items-center justify-center gap-14 lg:gap-24 xl:gap-32 w-full max-w-7xl my-auto">
          {/* Left Column: Final Photo Strip Preview */}
          <div className="flex flex-col items-center justify-center">
            <div className="relative flex items-center justify-center overflow-hidden rounded-2xl bg-white shadow-2xl transition-all">
              {outputImageUrl ? (
                <div className="relative">
                  <img
                    src={outputImageUrl}
                    alt={`Photo Strip Output ${formattedPublicId}`}
                    className="max-h-[calc(100dvh-120px)] w-auto object-contain rounded-2xl"
                  />
                </div>
              ) : (
                <div className="flex size-full min-h-[420px] min-w-[240px] flex-col items-center justify-center rounded-2xl bg-[#f3f4f6] text-[#6b7280] font-bold p-8">
                  <span>Photo Strip Ready</span>
                </div>
              )}
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
            <h1 className="mt-1 text-3xl sm:text-4xl md:text-5xl font-bold text-[#1f2937] leading-tight tracking-tight ">
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

            {/* Warnings and Recovery */}
            {(printError || showPrintRecord) && (
              <div
                role="dialog"
                aria-modal="true"
                aria-label={printError ? 'Printing error' : 'Record printed copies'}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
              >
                <div
                  className={`flex w-full max-w-lg flex-col gap-6 rounded-2xl border p-6 text-left shadow-2xl sm:p-8 ${
                    printError
                      ? 'border-red-300 bg-red-50 text-red-800'
                      : 'border-[#7bc6a5] bg-[#f0faf5] text-[#146a56]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-5">
                    <p className="text-base font-bold sm:text-lg">
                      {printError ||
                        'After printing, record the printed copy count if needed.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setPrintError(null);
                        setShowPrintRecord(false);
                      }}
                      className="shrink-0 rounded-lg px-2 py-1 text-sm font-bold underline hover:opacity-80 cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 border-t border-current/15 pt-4 sm:gap-4">
                    <label htmlFor="printed-copy-count" className="text-base font-bold sm:text-lg">
                      Copies printed
                    </label>
                    <select
                      id="printed-copy-count"
                      aria-label="Printed copy count"
                      value={recoveryCopies}
                      onChange={(e) =>
                        setRecoveryCopies(e.target.value === '' ? '' : Number(e.target.value))
                      }
                      className="h-12 w-24 rounded-lg border border-current/30 bg-white px-3 text-lg font-bold"
                    >
                      <option value="">-</option>
                      {Array.from({ length: 5 }, (_, index) => (
                        <option key={index + 1} value={index + 1}>
                          {index + 1}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        if (recoveryCopies !== '') {
                          handleRecordManualCopies(recoveryCopies);
                        }
                      }}
                      disabled={isPrinting || recoveryCopies === ''}
                      className="ml-auto min-h-12 cursor-pointer rounded-lg bg-[#146a56] px-5 py-2 text-base font-bold text-white hover:bg-[#0f5444] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isPrinting ? 'Recording...' : 'Record copies'}
                    </button>
                  </div>
                </div>
              </div>
            )}

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
                onClick={handleDirectPrint}
                disabled={isPrinting}
                className="flex-1 rounded-full px-7 sm:px-9 py-2.5 sm:py-3 bg-[#1e6147] hover:bg-[#164e39] active:scale-95 text-white font-bold text-xl sm:text-2xl transition shadow-md cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2 whitespace-nowrap"
              >
                {isPrinting ? (
                  <>
                    <span className="inline-block size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span className="text-lg">{printProgress || 'Printing...'}</span>
                  </>
                ) : (
                  'Print'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Unprinted Warning Modal Overlay */}
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

      {recordToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-8 left-1/2 z-[60] -translate-x-1/2 rounded-2xl bg-[#146a56] px-8 py-5 text-lg font-bold text-white shadow-2xl sm:px-10 sm:py-6 sm:text-2xl"
        >
          {recordToast}
        </div>
      )}
    </>
  );
};
