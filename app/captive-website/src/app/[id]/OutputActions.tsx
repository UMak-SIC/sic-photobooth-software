'use client';

import type { PublicOutputMetadata } from '@photobooth/public-output';

export function OutputActions({ output }: { output: PublicOutputMetadata }) {
  const extension = output.mediaType === 'image/gif' ? 'gif' : 'png';

  return (
    <a
      href={`/photos/${output.publicId}?download=true`}
      download={`photobooth_${output.publicId}.${extension}`}
      className="portal-action inline-flex rounded-xl bg-[#a8f3dd] px-6 py-3.5 text-sm font-black text-[#145142] hover:bg-[#c7fbe9]"
    >
      Download photo
    </a>
  );
}
