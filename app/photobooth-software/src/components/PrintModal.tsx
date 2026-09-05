import React, { useState } from 'react';

interface PrintModalProps {
  publicId: string;
  qrUrl: string;
  outputImageUrl: string;
  onPrintConfirmed: (copies: number) => Promise<void>;
  onFinishSession: () => void;
}

export const PrintModal: React.FC<PrintModalProps> = ({
  publicId,
  qrUrl,
  outputImageUrl,
  onPrintConfirmed,
  onFinishSession,
}) => {
  const [copies, setCopies] = useState<number>(1);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [hasPrinted, setHasPrinted] = useState<boolean>(false);

  const handlePrint = async () => {
    setIsPrinting(true);
    try {
      // Trigger browser print dialog for CUPS / Epson printer
      window.print();
      // Record print status in backend
      await onPrintConfirmed(copies);
      setHasPrinted(true);
    } catch (err) {
      console.error('Print confirmation failed:', err);
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-2xl w-full p-8 shadow-2xl flex flex-col items-center text-center">
        <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-2xl mb-4">
          🎉
        </div>

        <h2 className="text-3xl font-extrabold text-white tracking-tight">
          Your Photo Strip is Ready!
        </h2>
        <p className="mt-2 text-zinc-400 text-sm max-w-md">
          Scan the QR code below on your phone to download your photo, or print a physical copy now.
        </p>

        {/* Preview image & QR */}
        <div className="my-6 flex items-center gap-6 bg-zinc-950 p-4 rounded-2xl border border-zinc-800">
          <div className="w-36 h-48 bg-zinc-800 rounded-lg overflow-hidden flex items-center justify-center border border-zinc-700">
            <img src={outputImageUrl} alt="Photo Strip" className="w-full h-full object-contain" />
          </div>

          <div className="flex flex-col items-start text-left">
            <span className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider">
              Scan For Mobile Download
            </span>
            <p className="font-mono text-xs text-zinc-400 mt-1 break-all">{qrUrl}</p>
            <span className="mt-3 px-3 py-1 bg-zinc-800 rounded-full text-xs font-mono text-zinc-300">
              ID: {publicId}
            </span>
          </div>
        </div>

        {/* Copies selector */}
        <div className="flex items-center gap-4 mb-6">
          <span className="text-sm font-semibold text-zinc-300">Copies to print:</span>
          <div className="flex items-center border border-zinc-700 rounded-xl overflow-hidden">
            <button
              onClick={() => setCopies((c) => Math.max(1, c - 1))}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white font-bold transition-colors"
            >
              -
            </button>
            <span className="px-5 py-2 text-white font-mono font-bold bg-zinc-900">{copies}</span>
            <button
              onClick={() => setCopies((c) => Math.min(10, c + 1))}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white font-bold transition-colors"
            >
              +
            </button>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full">
          <button
            onClick={handlePrint}
            disabled={isPrinting}
            className="w-full sm:flex-1 py-4 px-6 bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-700 text-black font-extrabold text-base uppercase tracking-wider rounded-xl transition-all shadow-lg active:scale-98"
          >
            {isPrinting ? 'Sending to Printer...' : hasPrinted ? 'Print Again' : 'Print Copies'}
          </button>

          <button
            onClick={onFinishSession}
            className="w-full sm:flex-1 py-4 px-6 bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-base rounded-xl transition-all"
          >
            Finish & New Session
          </button>
        </div>
      </div>
    </div>
  );
};
