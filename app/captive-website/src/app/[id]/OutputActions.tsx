'use client';

import React from 'react';
import { Download, Info } from 'lucide-react';
import type { PublicOutputMetadata } from '@photobooth/public-output';

export function OutputActions({ output }: { output: PublicOutputMetadata }) {
  const ext = output.mediaType === 'image/gif' ? 'gif' : 'png';
  const downloadUrl = `/photos/${output.publicId}?download=true`;
  const filename = `photobooth_${output.publicId}.${ext}`;

  return (
    <div className="w-full flex flex-col items-center gap-4">
      {/* Primary Download Button */}
      <a
        href={downloadUrl}
        download={filename}
        className="w-full sm:max-w-md inline-flex items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-[#a8f3dd] to-[#76e5c5] py-4 px-8 text-base font-black text-[#145142] shadow-[0_12px_35px_rgba(168,243,221,0.35)] transition hover:brightness-105 active:scale-[0.98] text-center no-underline cursor-pointer"
      >
        <Download className="size-5 text-[#145142]" />
        <span>Download High-Res</span>
      </a>

      {/* Mobile Long-press Helper Tip */}
      <div className="inline-flex items-center gap-2 text-xs text-[#76d2bb] font-medium opacity-90 text-center px-4">
        <Info className="size-3.5 shrink-0 text-[#48c4a1]" />
        <span>You can also tap and hold the photo to save directly to your camera roll.</span>
      </div>
    </div>
  );
}



