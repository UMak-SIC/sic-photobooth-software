import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { useFlipbookStore } from '../../store/flipbook-store';
import { FLIPBOOK_CONFIG } from '../../config/flipbook';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export function FlipbookCompletionScreen() {
  const { publicId, qrUrl, coverUrls, selectedCoverIndex, resetFlipbook } = useFlipbookStore();
  const [gifLoaded, setGifLoaded] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<'custom' | 'prd'>('custom');

  const previewCoverUrl = coverUrls[selectedCoverIndex - 1] || coverUrls[0];
  const publicCode = publicId || 'M7p4XaV';
  const qrDisplayUrl = qrUrl || `https://myphotobooth.com/${publicCode}`;
  const gifUrl = publicId
    ? FLIPBOOK_CONFIG.enableComparisonVariants
      ? `${API_BASE_URL}/photos/${publicId}?variant=${selectedVariant}&t=${selectedVariant}`
      : `${API_BASE_URL}/photos/${publicId}`
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

  const handleFinish = () => {
    resetFlipbook();
  };

  return (
    <div className="relative flex w-full min-h-[100vh] flex-col items-center justify-center overflow-hidden bg-[#ecfff8] px-8 py-12 text-center text-[#113b33]">
      <p className="text-[13px] font-bold tracking-[0.14em] text-[#28806c]">
        YOUR FLIPBOOK IS READY
      </p>
      <h4 className="mt-3 text-[46px] md:text-[54px] font-black leading-none tracking-[-0.06em]">
        Keep this memory close.
      </h4>

      {/* Comparison Selector Tabs (visible only when enableComparisonVariants is true) */}
      {FLIPBOOK_CONFIG.enableComparisonVariants && (
        <div className="mt-6 flex items-center justify-center gap-3 rounded-2xl bg-[#d5f5ec] p-1.5 shadow-inner">
          <button
            type="button"
            onClick={() => {
              setGifLoaded(false);
              setSelectedVariant('custom');
            }}
            className={`rounded-xl px-5 py-2 text-xs font-bold transition ${
              selectedVariant === 'custom'
                ? 'bg-[#146a56] text-white shadow-md'
                : 'text-[#146a56] hover:bg-white/50'
            }`}
          >
            Instance A: 5s Video (20 Frames / 0.25s)
          </button>
          <button
            type="button"
            onClick={() => {
              setGifLoaded(false);
              setSelectedVariant('prd');
            }}
            className={`rounded-xl px-5 py-2 text-xs font-bold transition ${
              selectedVariant === 'prd'
                ? 'bg-[#146a56] text-white shadow-md'
                : 'text-[#146a56] hover:bg-white/50'
            }`}
          >
            Instance B: PRD Default (21 Frames / 0.5s)
          </button>
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-center gap-12 max-w-5xl w-full">
        {/* Media Preview Box */}
        <div className="relative overflow-hidden rounded-3xl border-4 border-[#146a56] shadow-2xl w-full max-w-[480px] aspect-[4/3] bg-black/40">
          {/* Static cover held while GIF is downloading */}
          {previewCoverUrl && !gifLoaded && (
            <img
              src={previewCoverUrl}
              alt="Flipbook Cover Placeholder"
              className="absolute inset-0 size-full object-cover"
            />
          )}

          {/* Animated looping GIF */}
          {gifUrl && (
            <img
              key={FLIPBOOK_CONFIG.enableComparisonVariants ? selectedVariant : 'main'}
              src={gifUrl}
              alt="Animated Flipbook GIF"
              onLoad={() => setGifLoaded(true)}
              className={`size-full object-cover transition-opacity duration-300 ${
                gifLoaded ? 'opacity-100' : 'opacity-0'
              }`}
            />
          )}

          {!previewCoverUrl && !gifUrl && (
            <div className="flex size-full items-center justify-center text-white font-bold">
              ANIMATED FLIPBOOK
            </div>
          )}

          {FLIPBOOK_CONFIG.enableComparisonVariants && (
            <div className="absolute top-4 right-4 rounded-full bg-[#146a56] px-4 py-1.5 text-[12px] font-black text-white shadow-md">
              {gifLoaded ? `● ${selectedVariant.toUpperCase()} GIF` : 'LOADING GIF...'}
            </div>
          )}
        </div>

        {/* QR Code & Actions Box */}
        <aside className="rounded-3xl bg-[#0e473d] p-10 text-white shadow-2xl w-full max-w-[360px] text-center">
          {/* Real QR Code Display */}
          <div className="mx-auto size-48 rounded-2xl bg-white p-3 flex flex-col items-center justify-center shadow-inner overflow-hidden">
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

          <p className="mt-6 text-[16px] font-black text-[#a8f3dd]">Scan to retrieve</p>
          <code className="mt-1.5 block text-sm text-[#9ec4b9] font-mono tracking-wider">
            {publicCode}
          </code>
          <p className="mt-1 text-[12px] text-[#71a396] break-all">{qrDisplayUrl}</p>

          <div className="mt-8 grid gap-3">
            <button
              type="button"
              onClick={handleFinish}
              className="rounded-2xl bg-[#a8f3dd] py-4 text-[15px] font-bold text-[#145142] shadow transition hover:bg-[#90e8d0] active:scale-[0.98]"
            >
              Finish session
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
