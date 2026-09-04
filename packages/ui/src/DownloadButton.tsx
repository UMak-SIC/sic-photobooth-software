import React, { useState } from 'react';
import type { SessionType } from '@photobooth/public-output';

export interface DownloadButtonProps {
  mediaUrl: string;
  fileName?: string;
  sessionType?: SessionType;
  publicId?: string;
  enableShare?: boolean;
  onDownloadStart?: () => void;
  onDownloadComplete?: () => void;
  className?: string;
  label?: string;
}

export const DownloadButton: React.FC<DownloadButtonProps> = ({
  mediaUrl,
  fileName,
  sessionType,
  publicId,
  enableShare = true,
  onDownloadStart,
  onDownloadComplete,
  className = '',
  label,
}) => {
  const [isDownloading, setIsDownloading] = useState(false);

  const defaultFileName =
    fileName ??
    `${sessionType ?? 'photobooth'}-${publicId ?? 'output'}.${sessionType === 'flipbook' ? 'gif' : 'png'}`;

  const buttonText = label ?? (isDownloading ? 'Saving...' : 'Download');

  const handleDownload = async () => {
    if (isDownloading) return;

    try {
      setIsDownloading(true);
      onDownloadStart?.();

      // Check for Web Share API support on mobile with file sharing capabilities
      if (
        enableShare &&
        typeof navigator !== 'undefined' &&
        'share' in navigator &&
        typeof navigator.share === 'function'
      ) {
        try {
          const response = await fetch(mediaUrl);
          const blob = await response.blob();
          const file = new File([blob], defaultFileName, { type: blob.type });

          if (
            'canShare' in navigator &&
            navigator.canShare &&
            navigator.canShare({ files: [file] })
          ) {
            await navigator.share({
              title: 'My Photobooth Output',
              text: 'Here is my photobooth creation!',
              files: [file],
            });
            setIsDownloading(false);
            onDownloadComplete?.();
            return;
          }
        } catch {
          // If share fails or user cancelled share sheet, proceed to standard blob download fallback
        }
      }

      // Standard Blob download fallback
      const response = await fetch(mediaUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = defaultFileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);

      onDownloadComplete?.();
    } catch {
      // Direct link fallback in case fetch blob fails
      const link = document.createElement('a');
      link.href = mediaUrl;
      link.download = defaultFileName;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={isDownloading}
      className={`inline-flex items-center justify-center gap-2 px-6 py-3 font-semibold text-sm rounded-xl transition-all duration-200 shadow-md ${
        isDownloading
          ? 'bg-neutral-800 text-neutral-400 cursor-not-allowed'
          : 'bg-white hover:bg-neutral-100 text-neutral-900 active:scale-[0.98]'
      } ${className}`}
      data-testid="download-button"
    >
      {isDownloading ? (
        <svg className="w-5 h-5 animate-spin text-neutral-400" fill="none" viewBox="0 0 24 24">
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
      ) : (
        <svg
          className="w-5 h-5 text-neutral-900"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
          />
        </svg>
      )}
      <span>{buttonText}</span>
    </button>
  );
};
