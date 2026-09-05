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
  const [recoveryCopies, setRecoveryCopies] = useState<number>(1);
  const [showUnprintedWarning, setShowUnprintedWarning] = useState<boolean>(false);

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
        color: { dark: '#0b3b32', light: '#ffffff' },
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

  return (
    <>
      {/* 1. Dedicated 4R Print Target (Only visible during print via global.css) */}
      <div className="print-only-target" aria-hidden="true">
        {outputImageUrl ? <img src={outputImageUrl} alt={`Photo Strip ${publicId}`} /> : null}
      </div>

      {/* 2. Screen Interface */}
      <div className="artboard relative flex h-[100dvh] w-full flex-col items-center justify-center overflow-hidden bg-[#ecfff8] px-6 py-10 text-center text-[#113b33]">
        {/* Main Content Layout */}
        <div className="flex w-full max-w-6xl flex-col items-center justify-center gap-8 md:flex-row md:items-center md:gap-12">
          <div className="flex w-full flex-1 items-center justify-center">
            <div className="relative flex items-center justify-center overflow-hidden bg-white shadow-xl">
              {outputImageUrl ? (
                <img
                  src={outputImageUrl}
                  alt="Final Photo Strip"
                  className="max-h-[calc(100dvh-120px)] w-auto object-contain"
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

            {(printError || showPrintRecord) && (
              <div
                className={`mt-5 flex w-full flex-col gap-3 rounded-xl border p-4 text-left text-[13px] shadow-md animate-fade-in ${
                  printError
                    ? 'border-[#e2827d] bg-[#fdf2f1] text-[#93231e]'
                    : 'border-[#8ce0c9] bg-[#effbf6] text-[#145d4e]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold">
                    {printError ||
                      'After Firefox/CUPS confirms printing, record the printed copy count.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setPrintError(null);
                      setShowPrintRecord(false);
                    }}
                    className="text-xs font-bold hover:underline"
                  >
                    Dismiss
                  </button>
                </div>
                <div className="flex items-center gap-2 border-t border-current/15 pt-3">
                  <input
                    type="number"
                    min="1"
                    max="10"
                    aria-label="Printed copy count"
                    value={recoveryCopies}
                    onChange={(e) =>
                      setRecoveryCopies(Math.max(1, parseInt(e.target.value, 10) || 1))
                    }
                    className="w-14 rounded border border-current/30 bg-white px-2 py-1.5 text-xs font-bold"
                  />
                  <button
                    type="button"
                    onClick={() => handleRecordManualCopies(recoveryCopies)}
                    disabled={isPrinting}
                    className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-bold text-white ${
                      printError
                        ? 'bg-[#93231e] hover:bg-[#781c18]'
                        : 'bg-[#146a56] hover:bg-[#0e473d]'
                    }`}
                  >
                    Record copies
                  </button>
                </div>
              </div>
            )}

            {showUnprintedWarning && (
              <div className="mt-5 flex w-full flex-col gap-3 rounded-xl border border-[#eab308] bg-[#fefce8] p-4 text-left text-[13px] text-[#854d0e] shadow-md animate-fade-in">
                <p className="font-bold">Session Not Yet Marked As Printed</p>
                <p>Print or record copies before starting a new session.</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleDirectPrint}
                    className="rounded-lg bg-[#ca8a04] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#a16207]"
                  >
                    Print Now
                  </button>
                  <button
                    type="button"
                    onClick={handleForceFinish}
                    className="rounded-lg border border-[#ca8a04] px-3 py-2 text-xs font-bold transition hover:bg-[#fef08a]"
                  >
                    Exit Anyway
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowUnprintedWarning(false)}
                    className="px-1 text-xs font-semibold underline"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

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
