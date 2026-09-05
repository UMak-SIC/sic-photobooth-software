import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';

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
  onPrintConfirmed?: (copies: number, recordOnly?: boolean) => Promise<void> | void;
  onFinishSession?: () => void;
}

export const PrintModal: React.FC<PrintModalProps> = ({
  publicId = 'M7p4XaV',
  qrUrl = 'https://myphotobooth.com/M7p4XaV',
  outputImageUrl = '',
  templateName = 'Pioneers',
  orientation = 'portrait',
  outputWidth = 1200,
  outputHeight = 1800,
  preview = false,
  isPrinted: externalIsPrinted = false,
  copiesPrinted: externalCopiesPrinted = 0,
  onPrintConfirmed,
  onFinishSession,
}) => {
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [hasPrinted, setHasPrinted] = useState<boolean>(externalIsPrinted);
  const [totalCopiesPrinted, setTotalCopiesPrinted] = useState<number>(externalCopiesPrinted);
  const [printError, setPrintError] = useState<string | null>(null);
  const [recoveryCopies, setRecoveryCopies] = useState<number>(1);
  const [showUnprintedWarning, setShowUnprintedWarning] = useState<boolean>(false);

  const isLandscape = orientation === 'landscape' || outputWidth > outputHeight;
  const sizeBadge = isLandscape ? '6.0" × 4.0" Landscape' : '4.0" × 6.0" Print';

  useEffect(() => {
    if (externalIsPrinted) {
      setHasPrinted(true);
      setTotalCopiesPrinted(externalCopiesPrinted);
    }
  }, [externalIsPrinted, externalCopiesPrinted]);

  useEffect(() => {
    if (preview) return;
    if (qrUrl) {
      QRCode.toDataURL(qrUrl, {
        margin: 1,
        width: 320,
        color: { dark: '#0b3b32', light: '#ffffff' },
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.warn('QR code generation failed:', err));
    }
  }, [qrUrl, preview]);

  const handleDirectPrint = async () => {
    setPrintError(null);
    setShowUnprintedWarning(false);
    setIsPrinting(true);

    try {
      if (onPrintConfirmed) {
        await onPrintConfirmed(1, false);
      }
      setHasPrinted(true);
      setTotalCopiesPrinted((prev) => prev + 1);
    } catch (err: unknown) {
      console.error('Direct CUPS print failed:', err);
      const message =
        err instanceof Error
          ? err.message
          : 'Printing was not confirmed. Complete printing in Firefox/CUPS, then record the printed copy count.';
      setPrintError(message);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleRecordManualCopies = async (copiesToRecord: number = 1) => {
    setIsPrinting(true);
    try {
      if (onPrintConfirmed) {
        await onPrintConfirmed(copiesToRecord, true);
      }
      setHasPrinted(true);
      setTotalCopiesPrinted((prev) => prev + copiesToRecord);
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

  return (
    <>
      {/* 1. Dedicated 4R Print Target (Only visible during print via global.css) */}
      <div className="print-only-target" aria-hidden="true">
        {outputImageUrl ? (
          <img src={outputImageUrl} alt={`Photo Strip ${publicId}`} />
        ) : null}
      </div>

      {/* 2. Screen Interface */}
      <div className="artboard relative flex min-h-[calc(100vh-77px)] w-full flex-col items-center justify-center overflow-x-hidden bg-[#ecfff8] px-6 py-10 text-center text-[#113b33]">
        {/* Header */}
        <p className="text-[13px] font-bold tracking-[0.16em] text-[#247e68]">
          YOUR PHOTO STRIP IS READY
        </p>
        <h4 className="mt-2 text-[40px] md:text-[50px] font-black leading-tight tracking-[-0.05em] text-[#0d3b32]">
          Keep this memory close.
        </h4>

        {/* PRD Contract Print Error Banner */}
        {printError && (
          <div className="mt-4 flex w-full max-w-3xl flex-col gap-3 rounded-xl border border-[#e2827d] bg-[#fdf2f1] p-4 text-left text-[14px] text-[#93231e] shadow-md animate-fade-in">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-xl">⚠️</span>
                <p className="font-semibold">{printError}</p>
              </div>
              <button
                type="button"
                onClick={() => setPrintError(null)}
                className="text-xs font-bold text-[#93231e] hover:underline"
              >
                Dismiss
              </button>
            </div>
            <div className="flex items-center gap-3 pt-2 border-t border-[#f5c2bf]">
              <span className="text-xs font-bold text-[#93231e]">Printed copy count:</span>
              <input
                type="number"
                min="1"
                max="10"
                value={recoveryCopies}
                onChange={(e) => setRecoveryCopies(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-16 rounded border border-[#e2827d] bg-white px-2 py-1 text-xs font-bold text-[#93231e]"
              />
              <button
                type="button"
                onClick={() => handleRecordManualCopies(recoveryCopies)}
                disabled={isPrinting}
                className="rounded-lg bg-[#93231e] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#781c18] cursor-pointer"
              >
                Record printed copy count
              </button>
            </div>
          </div>
        )}

        {/* Unprinted Session Warning */}
        {showUnprintedWarning && (
          <div className="mt-4 flex w-full max-w-3xl flex-col gap-3 rounded-xl border border-[#eab308] bg-[#fefce8] p-4 text-left text-[14px] text-[#854d0e] shadow-md animate-fade-in">
            <div className="flex items-center gap-2 font-bold">
              <span>⚠️</span>
              <span>Session Not Yet Marked As Printed</span>
            </div>
            <p className="text-[13px] text-[#713f12]">
              According to workflow standards, a new session should begin after printing is recorded.
              You can trigger printing, record printed copies, or confirm exiting.
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleDirectPrint}
                className="rounded-lg bg-[#ca8a04] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#a16207]"
              >
                Print Now
              </button>
              <button
                type="button"
                onClick={handleForceFinish}
                className="rounded-lg border border-[#ca8a04] px-4 py-2 text-xs font-bold text-[#854d0e] transition hover:bg-[#fef08a]"
              >
                Exit Anyway
              </button>
              <button
                type="button"
                onClick={() => setShowUnprintedWarning(false)}
                className="text-xs font-semibold text-[#854d0e] underline"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Main Content Layout */}
        <div className="mt-8 flex w-full max-w-5xl flex-col items-center justify-center gap-8 md:flex-row md:items-start md:gap-12">
          {/* Left Column: Photo Strip Preview & Information */}
          <div className="flex w-full flex-1 max-w-[540px] flex-col text-left">
            {/* Eyebrow & Badge */}
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13px] font-bold tracking-[0.14em] text-[#1f6655]">
                PHOTO STRIP PREVIEW
              </p>
              <span className="rounded-full bg-[#c8efe3] px-3.5 py-1 text-[11px] font-bold text-[#145d4e]">
                {sizeBadge} • {templateName}
              </span>
            </div>

            {/* Section 1: Full Strip Print */}
            <div className="mt-4 flex flex-col w-full">
              <div className="flex items-center justify-between text-[12px] font-bold tracking-wide text-[#3b6f62] mb-1.5 px-0.5">
                <span>300 DPI 4R Canvas (PNG)</span>
                {hasPrinted ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0b3b32] px-2.5 py-0.5 text-[11px] font-bold text-[#9ef0d8]">
                    ✓ Printed {totalCopiesPrinted > 1 ? `(${totalCopiesPrinted})` : ''}
                  </span>
                ) : (
                  <span>Ready to Print</span>
                )}
              </div>

              {/* Enlarged Photo Strip Canvas */}
              <div className="relative flex items-center justify-center overflow-hidden rounded-2xl border-4 border-[#0b3b32] bg-white shadow-2xl p-3">
                {outputImageUrl ? (
                  <img
                    src={outputImageUrl}
                    alt="Final Photo Strip"
                    className={`w-auto object-contain rounded-lg ${
                      isLandscape ? 'max-h-[420px] w-full' : 'max-h-[540px]'
                    }`}
                  />
                ) : (
                  <div className="final-strip">
                    <div />
                    <div />
                    <div />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: QR Code & Operations Card */}
          <aside className="flex w-full max-w-[360px] flex-shrink-0 flex-col items-center rounded-[32px] bg-[#0b3b32] p-8 text-white shadow-2xl">
            {/* White Squircle with QR Code */}
            <div className="size-[210px] rounded-[26px] bg-white p-4 flex items-center justify-center shadow-md">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`QR Code for ${publicId}`}
                  className="size-full object-contain"
                />
              ) : (
                <div className="size-full bg-gray-100 rounded-xl animate-pulse" />
              )}
            </div>

            {/* Retrieval Information */}
            <div className="mt-5 text-center">
              <p className="text-[15px] font-bold text-white tracking-tight">Scan to retrieve</p>
              <p className="mt-1 font-mono text-[14px] font-semibold text-[#8ce0c9] tracking-wider">
                {publicId}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="mt-6 flex w-full flex-col gap-3">
              <button
                type="button"
                onClick={handleDirectPrint}
                disabled={isPrinting}
                className="w-full rounded-2xl bg-[#9ef0d8] hover:bg-[#86e8cb] py-3.5 text-[15px] font-bold text-[#09392e] transition active:scale-[0.98] disabled:opacity-50 cursor-pointer shadow-sm flex items-center justify-center gap-2"
              >
                {isPrinting ? (
                  <>
                    <span className="inline-block size-4 animate-spin rounded-full border-2 border-[#09392e] border-t-transparent" />
                    <span>Sending to printer...</span>
                  </>
                ) : hasPrinted ? (
                  'Print again'
                ) : (
                  'Print photo strip'
                )}
              </button>

              <button
                type="button"
                onClick={handleFinishAttempt}
                className={`w-full rounded-2xl border py-3.5 text-[15px] font-bold transition active:scale-[0.98] cursor-pointer ${
                  hasPrinted
                    ? 'border-[#9ef0d8]/50 bg-[#0e473d] text-white hover:bg-[#146a56]'
                    : 'border-[#1b5e4f] bg-[#0b3b32] text-[#8ce0c9] hover:bg-[#124d41]'
                }`}
              >
                Finish session
              </button>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
};
