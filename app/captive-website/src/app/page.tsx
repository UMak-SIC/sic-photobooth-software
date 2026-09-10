'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BrandMark } from '../components/BrandMark';
import { QrScanner } from '../components/QrScanner';
import { ManualInputForm } from '../components/ManualInputForm';

export default function HomePage() {
  const router = useRouter();
  const [retrievalMethod, setRetrievalMethod] = useState<'code' | 'camera'>('code');

  const handleIdResolved = (publicId: string) => {
    router.push(`/${publicId}`);
  };

  return (
    <main className="portal-shell flex flex-col items-center selection:bg-[#48c4a1] selection:text-white">
      <header className="w-full px-5 py-5 md:px-10">
        <div className="mx-auto flex max-w-xl items-center">
          <div className="flex items-center gap-3.5">
            <BrandMark />
            <div>
              <p className="text-sm font-black tracking-tight text-white">UMak SIC Photobooth</p>
              <p className="text-xs text-[#9ec4b9]">Local guest gallery</p>
            </div>
          </div>
        </div>
      </header>

      <div className="w-full max-w-xl px-5 pb-12 pt-10 sm:pt-14 md:px-10">
        <div className="flex flex-col gap-6">
            <div
              aria-label="Choose a retrieval method"
              className="grid grid-cols-2 rounded-xl border border-[#1c4a40] bg-[#071b17] p-1"
              role="group"
            >
              <button
                type="button"
                aria-pressed={retrievalMethod === 'code'}
                onClick={() => setRetrievalMethod('code')}
                className={`portal-action rounded-lg px-3 py-2.5 text-sm font-bold ${
                  retrievalMethod === 'code'
                    ? 'bg-[#a8f3dd] text-[#145142]'
                    : 'text-[#b3d9ce] hover:text-white'
                }`}
              >
                Input code
              </button>
              <button
                type="button"
                aria-pressed={retrievalMethod === 'camera'}
                onClick={() => setRetrievalMethod('camera')}
                className={`portal-action rounded-lg px-3 py-2.5 text-sm font-bold ${
                  retrievalMethod === 'camera'
                    ? 'bg-[#a8f3dd] text-[#145142]'
                    : 'text-[#b3d9ce] hover:text-white'
                }`}
              >
                Use camera
              </button>
            </div>

            {retrievalMethod === 'code' ? (
              <section aria-label="Enter photo code">
                <ManualInputForm onSubmitCode={handleIdResolved} />
              </section>
            ) : (
              <section aria-label="Scan QR code">
                <QrScanner onScanSuccess={handleIdResolved} />
              </section>
            )}
        </div>
      </div>

    </main>
  );
}
