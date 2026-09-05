'use client';

import React, { useState } from 'react';
import type { SessionType } from '@photobooth/public-output';

export interface MediaPreviewProps {
  src: string;
  alt?: string;
  sessionType: SessionType;
  eventName?: string;
  eventDate?: string;
  thumbnailUrl?: string;
  className?: string;
}

export const MediaPreview: React.FC<MediaPreviewProps> = ({
  src,
  alt,
  sessionType,
  eventName,
  eventDate,
  thumbnailUrl,
  className = '',
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const displayAlt =
    alt ?? (sessionType === 'photo_strip' ? 'Photo Strip Output' : 'Flipbook GIF Output');

  return (
    <div
      className={`relative flex flex-col items-center w-full max-w-lg mx-auto bg-neutral-900 border border-neutral-800 rounded-2xl p-4 shadow-xl text-white ${className}`}
      data-testid="media-preview-container"
    >
      {/* Header Badges */}
      <div className="flex items-center justify-between w-full mb-3 px-1 text-xs text-neutral-400">
        <span
          className="inline-flex items-center px-2.5 py-0.5 rounded-full font-medium bg-neutral-800 text-neutral-200 border border-neutral-700"
          data-testid="session-type-badge"
        >
          {sessionType === 'photo_strip' ? 'Photo Strip' : 'Flipbook'}
        </span>
        {eventName && (
          <span className="truncate max-w-[200px] font-medium text-neutral-300" title={eventName}>
            {eventName}
          </span>
        )}
        {eventDate && <span className="text-neutral-500">{eventDate}</span>}
      </div>

      {/* Media Canvas Area */}
      <div className="relative w-full overflow-hidden rounded-xl bg-neutral-950 flex items-center justify-center min-h-[320px]">
        {/* Loading Skeleton */}
        {isLoading && !hasError && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-900 animate-pulse"
            data-testid="media-skeleton"
          >
            <svg
              className="w-10 h-10 text-neutral-700 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span className="mt-2 text-xs text-neutral-500">Loading media...</span>
          </div>
        )}

        {/* Error Fallback */}
        {hasError && (
          <div
            className="flex flex-col items-center justify-center p-8 text-center text-neutral-400"
            data-testid="media-error-state"
          >
            <svg
              className="w-12 h-12 text-rose-500 mb-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <p className="text-sm font-medium text-neutral-200">Unable to load media preview</p>
            <button
              onClick={() => {
                setHasError(false);
                setIsLoading(true);
              }}
              className="mt-3 px-3 py-1.5 text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg transition"
            >
              Retry
            </button>
          </div>
        )}

        {/* Media Image / GIF */}
        <img
          src={src}
          alt={displayAlt}
          srcSet={thumbnailUrl ? `${thumbnailUrl} 400w, ${src} 1200w` : undefined}
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false);
            setHasError(true);
          }}
          className={`w-full h-auto max-h-[600px] object-contain transition-opacity duration-300 ${
            isLoading || hasError ? 'opacity-0' : 'opacity-100'
          }`}
          data-testid="media-image"
        />
      </div>
    </div>
  );
};
