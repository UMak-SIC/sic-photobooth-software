import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Calendar } from 'lucide-react';
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
      <main className="portal-shell flex h-[100dvh] flex-col items-center overflow-hidden selection:bg-[#48c4a1] selection:text-white">
        <header className="w-full shrink-0 px-5 py-4 md:px-10">
          <div className="mx-auto flex max-w-2xl items-center justify-between">
            <Link href="/" className="flex items-center gap-3.5">
              <BrandMark />
              <div>
                <p className="text-sm font-black tracking-tight text-white">UMak SIC Photobooth</p>
                <p className="text-xs text-[#9ec4b9]">Local guest gallery</p>
              </div>
            </Link>
            <Link
              href="/"
              className="portal-action inline-flex items-center gap-2 rounded-xl border border-[#1c4a40] bg-[#0b2420] px-4 py-2.5 text-xs font-bold text-[#d8ffef] hover:border-[#a8f3dd] hover:bg-[#164137]"
            >
              <ArrowLeft className="size-3.5" />
              <span>Scan Another</span>
            </Link>
          </div>
        </header>

        <div className="flex w-full max-w-2xl flex-1 items-center px-5 text-center">
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
    <main className="portal-shell flex h-[100dvh] flex-col items-center overflow-hidden selection:bg-[#48c4a1] selection:text-white">
      {/* Top Header */}
      <header className="w-full shrink-0 px-5 py-4 md:px-10">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Link href="/" className="flex items-center gap-3.5">
            <BrandMark />
            <div>
                <p className="text-sm font-black tracking-tight text-white">UMak SIC Photobooth</p>
                <p className="text-xs text-[#9ec4b9]">Local guest gallery</p>
            </div>
          </Link>
          <Link
            href="/"
              className="portal-action inline-flex items-center gap-2 rounded-xl border border-[#1c4a40] bg-[#0b2420] px-4 py-2.5 text-xs font-bold text-[#d8ffef] hover:border-[#a8f3dd] hover:bg-[#164137]"
          >
            <ArrowLeft className="size-3.5" />
            <span>Scan Another</span>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex min-h-0 w-full max-w-2xl flex-1 flex-col items-center px-5 py-4 text-center sm:py-5">
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
          <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-4">
            {/* Title & Format Pill */}
            <div>
              <h2 className="text-2xl font-black tracking-[-0.04em] text-white sm:text-3xl">
                Your photo is ready.
              </h2>
              <div className="mt-2 flex items-center justify-center gap-3 text-xs text-[#9ec4b9]">
                <span>{output.eventName}</span>
                <span aria-hidden="true">/</span>
                <span className="flex items-center gap-1">
                  <Calendar className="size-3 text-[#48c4a1]" />
                  {output.eventDate}
                </span>
                <span aria-hidden="true">/</span>
                <span className="rounded-md bg-[#0b2420] px-2 py-0.5 font-mono text-[#a8f3dd]">
                  {output.publicId}
                </span>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 w-full justify-center">
              <div className="portal-panel flex min-h-0 items-center justify-center overflow-hidden rounded-[1.25rem] p-2 sm:p-3">
                <img
                  src={output.mediaUrl}
                  alt={output.sessionType === 'flipbook' ? 'Animated Flipbook' : 'Photo Strip'}
                  className="h-auto max-h-[calc(100dvh-17rem)] max-w-full rounded-2xl object-contain"
                />

              </div>
            </div>

            <OutputActions output={output} />
          </div>
        )}
      </div>

      {/* Footer */}
    </main>
  );
}
