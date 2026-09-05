import React from 'react';
import type { PublicOutputMetadata } from '@photobooth/public-output';
import { MediaPreview } from './MediaPreview.js';
import { DownloadButton } from './DownloadButton.js';

export interface OutputCardProps {
  output: PublicOutputMetadata;
  className?: string;
  onDownloadStart?: () => void;
  onDownloadComplete?: () => void;
}

export const OutputCard: React.FC<OutputCardProps> = ({
  output,
  className = '',
  onDownloadStart,
  onDownloadComplete,
}) => {
  return (
    <div
      className={`flex flex-col items-center w-full max-w-lg mx-auto gap-4 ${className}`}
      data-testid="output-card"
    >
      <MediaPreview
        src={output.mediaUrl}
        thumbnailUrl={output.thumbnailUrl}
        sessionType={output.sessionType}
        eventName={output.eventName}
        eventDate={output.eventDate}
      />

      <div className="flex flex-col sm:flex-row items-center justify-between w-full px-2 gap-3">
        <div className="text-xs text-neutral-400 text-center sm:text-left">
          {output.expiresAt ? (
            <p>
              Available until:{' '}
              <span className="text-neutral-300 font-medium">{output.expiresAt.split('T')[0]}</span>
            </p>
          ) : (
            <p className="text-neutral-400">Offline local retrieval copy</p>
          )}
        </div>

        <DownloadButton
          mediaUrl={output.mediaUrl}
          sessionType={output.sessionType}
          publicId={output.publicId}
          onDownloadStart={onDownloadStart}
          onDownloadComplete={onDownloadComplete}
          className="w-full sm:w-auto"
        />
      </div>
    </div>
  );
};
