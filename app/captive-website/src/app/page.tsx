'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Wifi, Sparkles, ShieldCheck } from 'lucide-react';
import { BrandMark } from '../components/BrandMark';
import { QrScanner } from '../components/QrScanner';
import { ManualInputForm } from '../components/ManualInputForm';

export default function HomePage() {
  const router = useRouter();

  const handleIdResolved = (publicId: string) => {
    if (typeof window !== 'undefined') {
      window.location.href = `/${publicId}`;
    } else {
      router.push(`/${publicId}`);
    }
  };

  return (
    <main className="min-h-screen bg-[#061715] bg-ambient-radial text-[#e8fff5] flex flex-col items-center selection:bg-[#48c4a1]/30 selection:text-white">
      {/* Top Brand Header */}
      <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-[#061715]/85 px-5 py-3.5 backdrop-blur-xl md:px-10">
        <div className="mx-auto flex max-w-xl items-center justify-between">
          <div className="flex items-center gap-3.5">
            <BrandMark />
            <div>
              <p className="text-[10px] font-black tracking-[0.24em] text-[#76d2bb] uppercase">
                SIC PHOTOBOOTH
              </p>
              <h1 className="text-base font-black tracking-tight text-white sm:text-lg">
                Guest Retrieval Portal
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-[#48c4a1]/30 bg-[#146a56]/30 px-3.5 py-1.5 text-[11px] font-bold text-[#a8f3dd] shadow-sm backdrop-blur-md">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#48c4a1] opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-[#48c4a1]" />
            </span>
            Local Network
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="w-full max-w-xl px-5 py-8 sm:py-10 flex flex-col items-center text-center gap-7 pb-safe">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#146a56]/40 border border-[#48c4a1]/40 px-4 py-1.5 text-[11px] font-bold text-[#a8f3dd] mb-3.5 shadow-sm">
            <Sparkles className="size-3.5 text-[#48c4a1]" />
            <span>Instant Offline Delivery</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-white leading-tight">
            Retrieve your memories.
          </h2>
          <p className="mt-2 text-xs sm:text-sm text-[#9ec4b9] max-w-md mx-auto leading-relaxed">
            Scan the QR code on your printed photo card or type your 7-character code to view and download your high-resolution photo.
          </p>
        </div>

        {/* 1. Camera QR Scanner Card */}
        <section className="w-full" aria-label="Camera QR Scanner">
          <QrScanner onScanSuccess={handleIdResolved} />
        </section>

        {/* Divider */}
        <div className="flex w-full items-center gap-4 py-1 text-[11px] font-bold text-[#64877d] uppercase tracking-widest">
          <div className="h-px flex-1 bg-white/10" />
          <span>Or enter code manually</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        {/* 2. Manual Code Input Card */}
        <section className="w-full" aria-label="Manual Code Input">
          <ManualInputForm onSubmitCode={handleIdResolved} />
        </section>

        {/* Trust & Privacy Badge */}
        <div className="flex items-center gap-2 text-xs text-[#71a396] opacity-80">
          <ShieldCheck className="size-4 text-[#48c4a1]" />
          <span>Private, direct connection to the local photobooth system.</span>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-auto w-full border-t border-white/10 py-6 text-center text-xs text-[#64877d] bg-[#061715]/60 backdrop-blur-sm">
        <p>Society of Innovative Computing · Local Photobooth Gateway</p>
      </footer>
    </main>
  );
}

