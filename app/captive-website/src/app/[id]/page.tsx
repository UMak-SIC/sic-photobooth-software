import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Film, Image as ImageIcon, Calendar, Sparkles } from 'lucide-react';
import { parsePublicId, type PublicOutputMetadata } from '@photobooth/public-output';
import { StatusBanner } from '@photobooth/ui';
import { BrandMark } from '../../components/BrandMark';
import { OutputActions } from './OutputActions';

const BACKEND_INTERNAL_URL =
  process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3000';

async function getPhotoData(
  publicId: string,
): Promise<{ output: PublicOutputMetadata | null; error: string | null }> {
  try {
    const res = await fetch(`${BACKEND_INTERNAL_URL}/photos/${publicId}/info`, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
    });

    if (res.status === 404 || res.status === 400) {
      return {
        output: null,
        error: 'Photo not found. Check the QR code or enter the full link/code again.',
      };
    }

    if (!res.ok) {
      return {
        output: null,
        error: 'Something went wrong. Please check your connection and try again.',
      };
    }

    const json = await res.json();
    if (!json.success || !json.data) {
      return {
        output: null,
        error: json.error?.message || 'Photo not found.',
      };
    }

    return {
      output: {
        ...json.data,
        mediaUrl: `/photos/${json.data.publicId}`,
      },
      error: null,
    };
  } catch (err) {
    console.error('Failed to fetch photo metadata on server:', err);
    return {
      output: null,
      error: 'Something went wrong. Please check your connection and try again.',
    };
  }
}

export default async function OutputPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;
  const rawId = resolvedParams.id || '';
  const publicId = parsePublicId(rawId);

  if (!publicId) {
    return (
      <main className="min-h-screen bg-[#061715] bg-ambient-radial text-[#e8fff5] flex flex-col items-center selection:bg-[#48c4a1]/30 selection:text-white">
        <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-[#061715]/85 px-5 py-3.5 backdrop-blur-xl md:px-10">
          <div className="mx-auto flex max-w-2xl items-center justify-between">
            <Link href="/" className="flex items-center gap-3.5 hover:opacity-90 transition">
              <BrandMark />
              <div>
                <p className="text-[10px] font-black tracking-[0.24em] text-[#76d2bb] uppercase">
                  SIC PHOTOBOOTH
                </p>
                <h1 className="text-base font-black tracking-tight text-white sm:text-lg">
                  Guest Retrieval Portal
                </h1>
              </div>
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-bold text-[#b3d9ce] hover:text-white hover:border-white/30 transition shadow-sm"
            >
              <ArrowLeft className="size-3.5" />
              <span>Scan Another</span>
            </Link>
          </div>
        </header>

        <div className="w-full max-w-2xl px-5 py-10 flex flex-col items-center text-center gap-6">
          <div className="w-full text-left my-6">
            <StatusBanner
              variant="not_found_local"
              messageOverride="Photo not found. Check the QR code or enter the full link/code again."
              actionLabel="Scan Another"
            />
          </div>
        </div>
      </main>
    );
  }

  const { output, error } = await getPhotoData(publicId);

  return (
    <main className="min-h-screen bg-[#061715] bg-ambient-radial text-[#e8fff5] flex flex-col items-center selection:bg-[#48c4a1]/30 selection:text-white">
      {/* Top Header */}
      <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-[#061715]/85 px-5 py-3.5 backdrop-blur-xl md:px-10">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Link href="/" className="flex items-center gap-3.5 hover:opacity-90 transition">
            <BrandMark />
            <div>
              <p className="text-[10px] font-black tracking-[0.24em] text-[#76d2bb] uppercase">
                SIC PHOTOBOOTH
              </p>
              <h1 className="text-base font-black tracking-tight text-white sm:text-lg">
                Guest Retrieval Portal
              </h1>
            </div>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-bold text-[#b3d9ce] hover:text-white hover:border-white/30 transition shadow-sm"
          >
            <ArrowLeft className="size-3.5" />
            <span>Scan Another</span>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <div className="w-full max-w-2xl px-5 py-8 sm:py-10 flex flex-col items-center text-center gap-7 pb-safe">
        {/* Error State */}
        {error || !output ? (
          <div className="w-full text-left my-6">
            <StatusBanner
              variant="not_found_local"
              messageOverride={
                error || 'Photo not found. Check the QR code or enter the full link/code again.'
              }
              actionLabel="Scan Another"
            />
          </div>
        ) : (
          /* Success Output Display */
          <div className="w-full flex flex-col items-center gap-7">
            {/* Title & Format Pill */}
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-[#146a56]/50 border border-[#48c4a1]/40 px-4 py-1.5 text-xs font-bold text-[#a8f3dd] shadow-sm mb-3">
                {output.sessionType === 'flipbook' ? (
                  <Film className="size-3.5 text-[#48c4a1]" />
                ) : (
                  <ImageIcon className="size-3.5 text-[#48c4a1]" />
                )}
                <span>
                  {output.sessionType === 'flipbook'
                    ? 'Animated Flipbook GIF'
                    : 'High-Res Photo Strip'}
                </span>
              </div>
              <h2 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
                Your memory is ready!
              </h2>
              <div className="mt-2 flex items-center justify-center gap-3 text-xs text-[#9ec4b9]">
                <span>{output.eventName}</span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Calendar className="size-3 text-[#48c4a1]" />
                  {output.eventDate}
                </span>
                <span>•</span>
                <span className="font-mono bg-white/5 px-2 py-0.5 rounded-md text-[#a8f3dd]">
                  {output.publicId}
                </span>
              </div>
            </div>

            {/* Immersive Media Canvas Box with Ambient Backlight Aura */}
            <div className="relative w-full flex items-center justify-center">
              {/* Backlight Glow */}
              <div className="absolute -inset-4 rounded-3xl bg-[#48c4a1]/15 blur-2xl pointer-events-none" />

              <div className="relative w-full overflow-hidden rounded-3xl border-4 border-[#146a56] shadow-[0_25px_60px_rgba(0,0,0,0.7)] bg-black/90 aspect-[4/3] flex items-center justify-center">
                <img
                  src={output.mediaUrl}
                  alt={output.sessionType === 'flipbook' ? 'Animated Flipbook' : 'Photo Strip'}
                  className="size-full object-contain"
                />

                {/* Live Format Badge */}
                <div className="absolute top-4 right-4 inline-flex items-center gap-1.5 rounded-full bg-[#146a56]/90 backdrop-blur-md px-3.5 py-1 text-[11px] font-black text-white shadow-md border border-white/10">
                  <span className="size-1.5 rounded-full bg-[#a8f3dd] animate-ping" />
                  {output.mediaType === 'image/gif' ? 'LOOPING GIF' : 'HQ PHOTO'}
                </div>
              </div>
            </div>

            {/* Client Action Buttons (Download & Share) */}
            <OutputActions output={output} />
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="mt-auto w-full border-t border-white/10 py-6 text-center text-xs text-[#64877d] bg-[#061715]/60 backdrop-blur-sm">
        <p>Society of Innovative Computing · Local Photobooth Gateway</p>
      </footer>
    </main>
  );
}

