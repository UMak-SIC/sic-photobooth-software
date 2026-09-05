import React from 'react';

export type StatusVariant =
  'processing' | 'not_found_local' | 'not_found_public' | 'expired' | 'error';

export interface StatusBannerProps {
  variant: StatusVariant;
  messageOverride?: string;
  onAction?: () => void;
  actionLabel?: string;
  className?: string;
}

const STATUS_CONFIG: Record<
  StatusVariant,
  {
    title: string;
    message: string;
    defaultActionLabel?: string;
    containerClass: string;
    iconClass: string;
    titleClass: string;
    buttonClass: string;
  }
> = {
  processing: {
    title: 'Processing Media',
    message: 'Your photos are still processing. Please wait a moment.',
    containerClass: 'bg-amber-950/40 border-amber-800/60 text-amber-200',
    iconClass: 'text-amber-400',
    titleClass: 'text-amber-300',
    buttonClass: 'bg-amber-900/60 hover:bg-amber-800 text-amber-100 border-amber-700',
  },
  not_found_local: {
    title: 'Photo Not Found',
    message: 'Photo not found. Check the QR code or enter the full link/code again.',
    defaultActionLabel: 'Scan Another',
    containerClass: 'bg-rose-950/40 border-rose-800/60 text-rose-200',
    iconClass: 'text-rose-400',
    titleClass: 'text-rose-300',
    buttonClass: 'bg-rose-900/60 hover:bg-rose-800 text-rose-100 border-rose-700',
  },
  not_found_public: {
    title: 'Media Unavailable',
    message: 'This photo has not been published or is no longer available.',
    containerClass: 'bg-neutral-900 border-neutral-800 text-neutral-300',
    iconClass: 'text-neutral-400',
    titleClass: 'text-neutral-200',
    buttonClass: 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border-neutral-700',
  },
  expired: {
    title: 'Media Expired',
    message: 'This photo has expired and is no longer available.',
    containerClass: 'bg-neutral-900 border-neutral-800 text-neutral-300',
    iconClass: 'text-neutral-400',
    titleClass: 'text-neutral-200',
    buttonClass: 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border-neutral-700',
  },
  error: {
    title: 'Something Went Wrong',
    message: 'Something went wrong. Please check your connection and try again.',
    defaultActionLabel: 'Try Again',
    containerClass: 'bg-rose-950/40 border-rose-800/60 text-rose-200',
    iconClass: 'text-rose-400',
    titleClass: 'text-rose-300',
    buttonClass: 'bg-rose-900/60 hover:bg-rose-800 text-rose-100 border-rose-700',
  },
};

export const StatusBanner: React.FC<StatusBannerProps> = ({
  variant,
  messageOverride,
  onAction,
  actionLabel,
  className = '',
}) => {
  const config = STATUS_CONFIG[variant];
  const displayMessage = messageOverride ?? config.message;
  const displayActionLabel = actionLabel ?? config.defaultActionLabel;

  return (
    <div
      role="alert"
      className={`flex flex-col sm:flex-row items-center justify-between gap-4 p-5 rounded-2xl border shadow-lg ${config.containerClass} ${className}`}
      data-testid={`status-banner-${variant}`}
    >
      <div className="flex items-start gap-3 w-full">
        {/* Variant Icon */}
        <div className={`mt-0.5 shrink-0 ${config.iconClass}`}>
          {variant === 'processing' && (
            <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
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
          )}
          {(variant === 'not_found_local' ||
            variant === 'not_found_public' ||
            variant === 'expired') && (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          )}
          {variant === 'error' && (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          )}
        </div>

        {/* Text */}
        <div className="flex flex-col">
          <h4 className={`font-semibold text-sm ${config.titleClass}`} data-testid="status-title">
            {config.title}
          </h4>
          <p className="text-xs sm:text-sm mt-0.5 opacity-90" data-testid="status-message">
            {displayMessage}
          </p>
        </div>
      </div>

      {/* Action Button */}
      {onAction && displayActionLabel && (
        <button
          type="button"
          onClick={onAction}
          className={`shrink-0 px-4 py-2 text-xs font-semibold rounded-xl border transition shadow-sm ${config.buttonClass}`}
          data-testid="status-action-button"
        >
          {displayActionLabel}
        </button>
      )}
    </div>
  );
};
