import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';

export interface PrintModalProps {
  publicId?: string;
  qrUrl?: string;
  outputImageUrl?: string;
  preview?: boolean;
  onPrintConfirmed?: (copies: number) => Promise<void> | void;
  onFinishSession?: () => void;
}

export const PrintModal: React.FC<PrintModalProps> = ({
  publicId = 'M7p4XaV',
  qrUrl = 'https://myphotobooth.com/M7p4XaV',
  outputImageUrl = '',
  preview = false,
  onPrintConfirmed,
  onFinishSession,
}) => {
  const [copies, setCopies] = useState<number>(1);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [hasPrinted, setHasPrinted] = useState<boolean>(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    if (preview) return;
    if (qrUrl) {
      QRCode.toDataURL(qrUrl, { margin: 1, width: 170, color: { dark: '#0c362e', light: '#ffffff' } })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.warn('QR code generation failed:', err));
    }
  }, [qrUrl, preview]);

  const handlePrint = async () => {
    setIsPrinting(true);
    try {
      window.print();
      if (onPrintConfirmed) {
        await onPrintConfirmed(copies);
      }
      setHasPrinted(true);
    } catch (err) {
      console.error('Print trigger failed:', err);
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <div className="artboard relative flex h-full min-h-[780px] w-full flex-col items-center justify-center overflow-hidden bg-[#ecfff8] px-16 py-10 text-center text-[#113b33]">
      <p className="text-[13px] font-bold tracking-[0.14em] text-[#28806c]">
        YOUR PHOTO STRIP IS READY
      </p>
      <h4 className="mt-3 text-[43px] font-black leading-none tracking-[-0.06em]">
        Keep this memory close.
      </h4>

      <div className="mt-10 flex items-center justify-center gap-10">
        {/* Photo Strip Output Preview */}
        {preview ? (
          <div className="final-strip">
            <div />
            <div />
            <div />
          </div>
        ) : outputImageUrl ? (
          <div className="w-[230px] overflow-hidden rounded-2xl border-4 border-[#0e473d] bg-white shadow-2xl">
            <img src={outputImageUrl} alt="Final Photo Strip" className="w-full h-auto object-contain" />
          </div>
        ) : (
          <div className="final-strip">
            <div />
            <div />
            <div />
          </div>
        )}

        {/* QR & Print Operations Aside */}
        <aside className="flex flex-col items-center rounded-2xl bg-[#0e473d] p-8 text-white max-w-[320px] w-full shadow-2xl">
          {preview ? (
            <div className="qr-grid mx-auto" />
          ) : qrDataUrl ? (
            <div className="size-[170px] bg-white p-2 rounded-xl flex items-center justify-center shadow-inner">
              <img src={qrDataUrl} alt={`QR Code for ${publicId}`} className="size-full object-contain" />
            </div>
          ) : (
            <div className="qr-grid mx-auto" />
          )}

          <p className="mt-6 text-center text-[14px] font-bold tracking-wide">Scan to retrieve</p>
          {!preview && publicId && (
            <span className="mt-1 text-xs font-mono font-bold text-[#a8f3dd]">
              ID: {publicId}
            </span>
          )}

          {/* Copies selector */}
          {!preview && (
            <div className="mt-4 flex items-center gap-3">
              <span className="text-xs font-semibold text-[#a8f3dd]">Copies:</span>
              <div className="flex items-center rounded-lg border border-white/20 overflow-hidden text-xs">
                <button
                  type="button"
                  onClick={() => setCopies((c) => Math.max(1, c - 1))}
                  className="px-3 py-1 bg-white/10 hover:bg-white/20 transition cursor-pointer"
                >
                  -
                </button>
                <span className="px-3 py-1 font-bold font-mono text-sm">{copies}</span>
                <button
                  type="button"
                  onClick={() => setCopies((c) => Math.min(10, c + 1))}
                  className="px-3 py-1 bg-white/10 hover:bg-white/20 transition cursor-pointer"
                >
                  +
                </button>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-6 grid w-full gap-3">
            <button
              type="button"
              onClick={handlePrint}
              disabled={isPrinting}
              className="w-full rounded-xl bg-[#a8f3dd] py-3 text-[14px] font-bold text-[#145142] transition hover:bg-[#90e8ce] active:scale-[0.98] disabled:opacity-50 cursor-pointer shadow-md"
            >
              {isPrinting
                ? 'Printing...'
                : hasPrinted
                  ? 'Print again'
                  : copies > 1
                    ? `Print ${copies} copies`
                    : 'Open print handoff'}
            </button>

            <button
              type="button"
              onClick={onFinishSession}
              className="w-full rounded-xl border border-white/25 py-3 text-[14px] font-bold text-white transition hover:bg-white/10 active:scale-[0.98] cursor-pointer"
            >
              Finish session
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
};
