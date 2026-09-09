import React, { useEffect, useState, useMemo, useCallback } from 'react';
import type { ReviewTemplate } from './PhotoStripReview';
import { boothApi, resolveAssetUrl } from '../../services/api';
import { useCountdown } from '../../hooks/useCountdown';

export interface TemplatePickerProps {
  preview?: boolean;
  onSelectTemplate?: (template: ReviewTemplate) => void;
  onBack?: () => void;
}

const DEFAULT_TEMPLATES: ReviewTemplate[] = [
  {
    id: 'herons-welcome-2024',
    name: 'Herons Welcome',
    orientation: 'portrait',
    outputWidth: 1200,
    outputHeight: 1800,
    countdownSeconds: 5,
    requiredCaptureCount: 2,
    background: { x: 0, y: 0, width: 1200, height: 1800 },
    placements: [
      { captureIndex: 1, x: 100, y: 140, width: 1000, height: 600, borderRadius: 8, zIndex: 1 },
      { captureIndex: 2, x: 100, y: 780, width: 1000, height: 600, borderRadius: 8, zIndex: 1 },
    ],
  },
  {
    id: 'herons-welcome-grid',
    name: 'Herons Grid',
    orientation: 'portrait',
    outputWidth: 1200,
    outputHeight: 1800,
    countdownSeconds: 5,
    requiredCaptureCount: 8,
    placements: [
      { captureIndex: 1, x: 90, y: 120, width: 480, height: 320, borderRadius: 4, zIndex: 1 },
      { captureIndex: 5, x: 630, y: 120, width: 480, height: 320, borderRadius: 4, zIndex: 1 },
      { captureIndex: 2, x: 90, y: 470, width: 480, height: 320, borderRadius: 4, zIndex: 1 },
      { captureIndex: 6, x: 630, y: 470, width: 480, height: 320, borderRadius: 4, zIndex: 1 },
      { captureIndex: 3, x: 90, y: 820, width: 480, height: 320, borderRadius: 4, zIndex: 1 },
      { captureIndex: 7, x: 630, y: 820, width: 480, height: 320, borderRadius: 4, zIndex: 1 },
      { captureIndex: 4, x: 90, y: 1170, width: 480, height: 320, borderRadius: 4, zIndex: 1 },
      { captureIndex: 8, x: 630, y: 1170, width: 480, height: 320, borderRadius: 4, zIndex: 1 },
    ],
  },
  {
    id: 'umak-sic-classic',
    name: 'UMak SIC',
    orientation: 'portrait',
    outputWidth: 1200,
    outputHeight: 1800,
    countdownSeconds: 5,
    requiredCaptureCount: 8,
    placements: [
      { captureIndex: 1, x: 90, y: 100, width: 480, height: 320, borderRadius: 4, zIndex: 1 },
      { captureIndex: 5, x: 630, y: 100, width: 480, height: 320, borderRadius: 4, zIndex: 1 },
      { captureIndex: 2, x: 90, y: 450, width: 480, height: 320, borderRadius: 4, zIndex: 1 },
      { captureIndex: 6, x: 630, y: 450, width: 480, height: 320, borderRadius: 4, zIndex: 1 },
      { captureIndex: 3, x: 90, y: 800, width: 480, height: 320, borderRadius: 4, zIndex: 1 },
      { captureIndex: 7, x: 630, y: 800, width: 480, height: 320, borderRadius: 4, zIndex: 1 },
      { captureIndex: 4, x: 90, y: 1150, width: 480, height: 320, borderRadius: 4, zIndex: 1 },
      { captureIndex: 8, x: 630, y: 1150, width: 480, height: 320, borderRadius: 4, zIndex: 1 },
    ],
  },
  {
    id: 'gensic-arcade',
    name: 'GenSIC Arcade',
    orientation: 'portrait',
    outputWidth: 1200,
    outputHeight: 1800,
    countdownSeconds: 5,
    requiredCaptureCount: 8,
    placements: [
      { captureIndex: 1, x: 90, y: 120, width: 480, height: 320, borderRadius: 4, zIndex: 1 },
      { captureIndex: 5, x: 630, y: 120, width: 480, height: 320, borderRadius: 4, zIndex: 1 },
      { captureIndex: 2, x: 90, y: 470, width: 480, height: 320, borderRadius: 4, zIndex: 1 },
      { captureIndex: 6, x: 630, y: 470, width: 480, height: 320, borderRadius: 4, zIndex: 1 },
      { captureIndex: 3, x: 90, y: 820, width: 480, height: 320, borderRadius: 4, zIndex: 1 },
      { captureIndex: 7, x: 630, y: 820, width: 480, height: 320, borderRadius: 4, zIndex: 1 },
      { captureIndex: 4, x: 90, y: 1170, width: 480, height: 320, borderRadius: 4, zIndex: 1 },
      { captureIndex: 8, x: 630, y: 1170, width: 480, height: 320, borderRadius: 4, zIndex: 1 },
    ],
  },
  {
    id: 'classic-portrait',
    name: 'Pioneers',
    orientation: 'portrait',
    outputWidth: 1200,
    outputHeight: 1800,
    countdownSeconds: 5,
    requiredCaptureCount: 3,
    placements: [
      { captureIndex: 1, x: 100, y: 120, width: 1000, height: 440, borderRadius: 8, zIndex: 1 },
      { captureIndex: 2, x: 100, y: 600, width: 1000, height: 440, borderRadius: 8, zIndex: 1 },
      { captureIndex: 3, x: 100, y: 1080, width: 1000, height: 440, borderRadius: 8, zIndex: 1 },
    ],
  },
  {
    id: 'seafoam-portrait',
    name: 'Seafoam Duo',
    orientation: 'portrait',
    outputWidth: 1200,
    outputHeight: 1800,
    countdownSeconds: 5,
    requiredCaptureCount: 2,
    placements: [
      { captureIndex: 1, x: 120, y: 160, width: 960, height: 680, borderRadius: 8, zIndex: 1 },
      { captureIndex: 2, x: 120, y: 920, width: 960, height: 680, borderRadius: 8, zIndex: 1 },
    ],
  },
  // Landscape Templates
  {
    id: 'the-circuit',
    name: 'The Circuit',
    orientation: 'landscape',
    outputWidth: 1800,
    outputHeight: 1200,
    countdownSeconds: 5,
    requiredCaptureCount: 4,
    placements: [
      { captureIndex: 1, x: 120, y: 120, width: 720, height: 450, borderRadius: 8, zIndex: 1 },
      { captureIndex: 2, x: 960, y: 120, width: 720, height: 450, borderRadius: 8, zIndex: 1 },
      { captureIndex: 3, x: 120, y: 630, width: 720, height: 450, borderRadius: 8, zIndex: 1 },
      { captureIndex: 4, x: 960, y: 630, width: 720, height: 450, borderRadius: 8, zIndex: 1 },
    ],
  },
  {
    id: 'landscape-trio',
    name: 'Horizon Trio',
    orientation: 'landscape',
    outputWidth: 1800,
    outputHeight: 1200,
    countdownSeconds: 5,
    requiredCaptureCount: 3,
    placements: [
      { captureIndex: 1, x: 100, y: 160, width: 500, height: 880, borderRadius: 8, zIndex: 1 },
      { captureIndex: 2, x: 650, y: 160, width: 500, height: 880, borderRadius: 8, zIndex: 1 },
      { captureIndex: 3, x: 1200, y: 160, width: 500, height: 880, borderRadius: 8, zIndex: 1 },
    ],
  },
  {
    id: 'landscape-quad',
    name: 'Panorama 4',
    orientation: 'landscape',
    outputWidth: 1800,
    outputHeight: 1200,
    countdownSeconds: 5,
    requiredCaptureCount: 4,
    placements: [
      { captureIndex: 1, x: 80, y: 100, width: 780, height: 460, borderRadius: 8, zIndex: 1 },
      { captureIndex: 2, x: 940, y: 100, width: 780, height: 460, borderRadius: 8, zIndex: 1 },
      { captureIndex: 3, x: 80, y: 620, width: 780, height: 460, borderRadius: 8, zIndex: 1 },
      { captureIndex: 4, x: 940, y: 620, width: 780, height: 460, borderRadius: 8, zIndex: 1 },
    ],
  },
];

const TEMPLATES_PER_PAGE = 6;

export const TemplatePicker: React.FC<TemplatePickerProps> = ({
  preview = false,
  onSelectTemplate,
  onBack,
}) => {
  const [templates, setTemplates] = useState<ReviewTemplate[]>(DEFAULT_TEMPLATES);
  const [loading, setLoading] = useState<boolean>(!preview);
  const [orientationFilter, setOrientationFilter] = useState<'portrait' | 'landscape'>('portrait');
  const [selectedId, setSelectedId] = useState<string>(DEFAULT_TEMPLATES[0].id);
  const [currentPage, setCurrentPage] = useState(0);

  useEffect(() => {
    if (preview) return;
    async function loadTemplates() {
      try {
        const data = await boothApi.listTemplates();
        if (Array.isArray(data) && data.length > 0) {
          setTemplates(data);
          setSelectedId(data[0].id);
          setCurrentPage(0);
          if (data[0].orientation) {
            setOrientationFilter(data[0].orientation);
          }
        }
      } catch (err) {
        console.warn('Could not fetch templates from backend, using fallbacks:', err);
      } finally {
        setLoading(false);
      }
    }
    loadTemplates();
  }, [preview]);

  // Filter templates by current orientation
  const filteredTemplates = useMemo(() => {
    const list = templates.filter((t) => {
      const isLand = t.orientation === 'landscape' || (t.outputWidth && t.outputHeight && t.outputWidth > t.outputHeight);
      return orientationFilter === 'landscape' ? isLand : !isLand;
    });
    return list.length > 0 ? list : templates;
  }, [templates, orientationFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredTemplates.length / TEMPLATES_PER_PAGE));
  const visibleTemplates = filteredTemplates.slice(
    currentPage * TEMPLATES_PER_PAGE,
    (currentPage + 1) * TEMPLATES_PER_PAGE,
  );

  // Ensure selectedId is valid within filtered list
  useEffect(() => {
    if (filteredTemplates.length > 0 && !filteredTemplates.some((t) => t.id === selectedId)) {
      setSelectedId(filteredTemplates[0].id);
    }
  }, [filteredTemplates, selectedId]);

  useEffect(() => {
    if (currentPage >= pageCount) {
      setCurrentPage(pageCount - 1);
    }
  }, [currentPage, pageCount]);

  const selectedTemplate =
    templates.find((t) => t.id === selectedId) || filteredTemplates[0] || DEFAULT_TEMPLATES[0];

  const handleOrientationChange = (ori: 'portrait' | 'landscape') => {
    setOrientationFilter(ori);
    setCurrentPage(0);
    const matched = templates.find((t) => {
      const isLand = t.orientation === 'landscape' || (t.outputWidth && t.outputHeight && t.outputWidth > t.outputHeight);
      return ori === 'landscape' ? isLand : !isLand;
    });
    if (matched) {
      setSelectedId(matched.id);
    }
  };

  const handlePageChange = (page: number) => {
    const nextPage = Math.max(0, Math.min(page, pageCount - 1));
    setCurrentPage(nextPage);
    const firstTemplate = filteredTemplates[nextPage * TEMPLATES_PER_PAGE];
    if (firstTemplate) {
      setSelectedId(firstTemplate.id);
    }
  };

  const handleConfirm = useCallback(() => {
    if (selectedTemplate && onSelectTemplate) {
      onSelectTemplate(selectedTemplate);
    }
  }, [selectedTemplate, onSelectTemplate]);

  // 60-second countdown auto-confirming the selected template if unattended
  const { timeLeft } = useCountdown({
    seconds: 45,
    autoStart: !preview,
    onExpire: () => {
      handleConfirm();
    },
  });

  const uniquePhotosCount =
    selectedTemplate.requiredCaptureCount ??
    new Set(selectedTemplate.placements.map((p) => p.captureIndex)).size;

  return (
    <div className="relative flex h-full min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-[#f4f6f5] select-none font-['Nunito',sans-serif]">
      {/* Centered Kiosk Display Frame matching ExperienceChoiceScreen */}
      <div className="relative flex h-[800px] max-h-[800px] w-full max-w-[1180px] flex-col justify-between overflow-hidden px-6 pt-3 pb-0 sm:px-10 sm:pt-4 sm:pb-0 text-[#1a202c]">
        {/* Top Right Arcade Gamer Countdown Timer */}
        <div className="absolute top-3 right-6 sm:top-4 sm:right-10 z-30 flex items-center">
          <span
            className="font-['PressStart2P','Arcade_Gamer',monospace] text-[28px] sm:text-[34px] md:text-[38px] font-bold text-[#008037] leading-none tracking-normal drop-shadow-xs"
            aria-live="polite"
            aria-label={`Auto continue in ${timeLeft} seconds`}
          >
            {timeLeft}
          </span>
        </div>

        {/* Main Content: Left Selector Grid & Right Large Preview */}
        <div className="flex h-full w-full gap-8 lg:gap-5 items-stretch overflow-visible">
          {/* Left Column: Orientation Filter + Grid */}
          <div className="flex flex-col flex-1 min-w-0 h-full overflow-visible">
            {/* Top Filter & Header (pt-2.5 ensures badge with -top-2.5 never clips) */}
            <div className="shrink-0 mb-2 pt-2.5">
              {/* Orientation Row */}
              <div className="flex items-center gap-4">
                <span className="text-xl sm:text-2xl font-bold text-[#1d1f26]">Orientation</span>

                {/* Filter Pill Group */}
                <div className="flex items-center gap-2.5">
                  {/* Portrait Filter Button */}
                  <div className="relative">
                    {orientationFilter === 'portrait' && (
                      <img
                        src="/assets/images/like.svg"
                        alt=""
                        className="absolute -top-2.5 -left-2.5 size-6 drop-shadow-sm z-20 pointer-events-none"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => handleOrientationChange('portrait')}
                      className={`px-4 py-1 sm:px-5 sm:py-1.5 rounded-xl text-base sm:text-lg font-bold transition-all cursor-pointer ${
                        orientationFilter === 'portrait'
                          ? 'border-2 border-[#058d51] bg-white text-[#058d51] shadow-xs'
                          : 'border-2 border-transparent bg-[#e9eceb] text-[#4a5568] hover:bg-[#dfe4e2]'
                      }`}
                    >
                      Portrait
                    </button>
                  </div>

                  {/* Landscape Filter Button */}
                  <div className="relative">
                    {orientationFilter === 'landscape' && (
                      <img
                        src="/assets/images/like.svg"
                        alt=""
                        className="absolute -top-2.5 -left-2.5 size-6 drop-shadow-sm z-20 pointer-events-none"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => handleOrientationChange('landscape')}
                      className={`px-4 py-1 sm:px-5 sm:py-1.5 rounded-xl text-base sm:text-lg font-bold transition-all cursor-pointer ${
                        orientationFilter === 'landscape'
                          ? 'border-2 border-[#058d51] bg-white text-[#058d51] shadow-xs'
                          : 'border-2 border-transparent bg-[#e9eceb] text-[#4a5568] hover:bg-[#dfe4e2]'
                      }`}
                    >
                      Landscape
                    </button>
                  </div>
                </div>
              </div>

              {/* Slightly smaller headline */}
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1d1f26] mt-5 mb-0.5">
                Pick your Layout
              </h1>
            </div>

            {/* Paginated Templates Grid */}
            {loading ? (
              <div className="flex flex-1 items-center justify-center">
                <div className="size-8 rounded-full border-3 border-[#058d51] border-t-transparent animate-spin" />
              </div>
            ) : (
              <div className="flex flex-1 min-h-0 flex-col pt-1">
                <div className="grid w-full flex-none grid-cols-3 gap-x-12 gap-y-2 pb-1 px-4">
                  {visibleTemplates.map((template) => {
                    const isSelected = template.id === selectedId;
                    const cardWidth = template.outputWidth || (template.orientation === 'landscape' ? 1800 : 1200);
                    const cardHeight = template.outputHeight || (template.orientation === 'landscape' ? 1200 : 1800);
                    const isLandscape = template.orientation === 'landscape' || cardWidth > cardHeight;
                    const bgUrl = resolveAssetUrl(template.backgroundPath ?? null);

                    return (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => setSelectedId(template.id)}
                        className={`group flex w-full flex-col justify-between rounded-2xl bg-white px-1 sm:p-1 shadow-xs border transition-all duration-150 active:scale-95 cursor-pointer text-left outline-none hover:shadow-md ${
                          isLandscape ? 'scale-[1.09] z-10' : ''
                        } ${
                          isSelected
                            ? 'border-[#058d51] ring-2 ring-[#058d51]/40'
                            : 'border-gray-200/80 hover:border-gray-300'
                        }`}
                      >
                        {/* Preview Artboard inside white card */}
                        <div
                          className={`relative w-full rounded-xl overflow-hidden border ${
                            isLandscape ? 'aspect-[3/2]' : 'aspect-[2/3]'
                          } ${
                            isSelected
                              ? 'border-[#058d51]/50'
                              : 'border-gray-200'
                          }`}
                        >
                          {/* Inner Visual Simulation */}
                          <div className="absolute inset-0 size-full overflow-hidden bg-gradient-to-b from-[#1b4372] via-[#2a5b8c] to-[#122b49]">
                            {/* Background Image if available */}
                            {bgUrl && (
                              <img
                                src={bgUrl}
                                alt=""
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                                className="absolute inset-0 size-full object-cover"
                              />
                            )}

                            {/* Overlays */}
                            {template.overlays?.map((overlay, idx) => {
                              const overlayUrl = resolveAssetUrl(overlay.path || overlay.assetPath || null);
                              if (!overlayUrl) return null;
                              return (
                                <img
                                  key={overlay.id || idx}
                                  src={overlayUrl}
                                  alt=""
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                  }}
                                  style={{
                                    left: `${(overlay.x / cardWidth) * 100}%`,
                                    top: `${(overlay.y / cardHeight) * 100}%`,
                                    width: `${(overlay.width / cardWidth) * 100}%`,
                                    height: `${(overlay.height / cardHeight) * 100}%`,
                                    transform: overlay.rotation ? `rotate(${overlay.rotation}deg)` : undefined,
                                    zIndex: (overlay.zIndex ?? 2) * 2 + 1,
                                  }}
                                  className="absolute object-contain pointer-events-none"
                                />
                              );
                            })}

                            {/* Slots */}
                            {template.placements
                              .slice()
                              .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
                              .map((p) => (
                                <div
                                  key={p.id ?? `${p.captureIndex}-${p.x}-${p.y}`}
                                  style={{
                                    left: `${(p.x / cardWidth) * 100}%`,
                                    top: `${(p.y / cardHeight) * 100}%`,
                                    width: `${(p.width / cardWidth) * 100}%`,
                                    height: `${(p.height / cardHeight) * 100}%`,
                                    transform: p.rotation ? `rotate(${p.rotation}deg)` : undefined,
                                    zIndex: (p.zIndex ?? 1) * 2,
                                  }}
                                  className="absolute flex items-center justify-center bg-[#ebfcf3]/95 border border-white/60 text-[#146a56] font-bold text-[8px] sm:text-[9px] shadow-xs rounded-[2px]"
                                >
                                  {p.captureIndex}
                                </div>
                              ))}
                          </div>

                          {/* Selected Checkmark Overlay */}
                          {isSelected && (
                            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/10 backdrop-blur-[0.5px]">
                              <img
                                src="/assets/images/check-mark.svg"
                                alt="Selected"
                                className="size-12 sm:size-14 drop-shadow-md"
                              />
                            </div>
                          )}
                        </div>

                        {/* Title of the Frame under the template inside the white card */}
                        <p
                          className="text-sm my-0.5 font-bold text-center truncate max-w-full tracking-tight"
                          style={{ color: isSelected ? '#058d51' : '#2d3748' }}
                        >
                          {template.name}
                        </p>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-auto mb-4 flex shrink-0 items-center justify-center gap-4 py-2">
                  {pageCount > 1 && (
                    <button
                      type="button"
                      aria-label="Previous template page"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 0}
                      className="flex size-14 items-center justify-center rounded-full bg-white text-[#4a5568] shadow-[0_4px_12px_rgba(0,0,0,0.12)] transition hover:text-[#058d51] active:scale-95 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <svg className="size-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m15 18-6-6 6-6" />
                      </svg>
                    </button>
                  )}

                  <div className="flex min-w-32 items-center justify-center gap-2.5 rounded-xl bg-white px-6 py-3.5 shadow-[0_4px_12px_rgba(0,0,0,0.08)]" aria-label={`Template page ${currentPage + 1} of ${pageCount}`}>
                    {Array.from({ length: pageCount }, (_, page) => (
                      <span
                        key={page}
                        className={`rounded-full border transition-all duration-300 ${
                          page === currentPage
                            ? 'size-4 border-[#058d51] bg-[#058d51] shadow-[0_0_0_3px_rgba(5,141,81,0.16)] animate-pulse'
                            : 'size-3 border-[#64748b] bg-white'
                        }`}
                      />
                    ))}
                  </div>

                  {pageCount > 1 && (
                    <button
                      type="button"
                      aria-label="Next template page"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === pageCount - 1}
                      className="flex size-14 items-center justify-center rounded-full bg-white text-[#4a5568] shadow-[0_4px_12px_rgba(0,0,0,0.12)] transition hover:text-[#058d51] active:scale-95 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <svg className="size-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Frame Preview with Badges on top and Action Buttons at the bottom */}
          <div className="flex flex-col w-[360px] sm:w-[390px] lg:w-[420px] shrink-0 h-full justify-between items-center py-1">
            {/* Middle: Frame Preview Container with badges on top */}
            <div className="relative flex-1 w-full flex flex-col items-center justify-center overflow-visible py-1 translate-y-5">
              {/* Photo Count Badge on top of the layout preview */}
              <div className="flex items-center justify-between w-full max-w-[340px] sm:max-w-[360px] shrink-0 mb-5 gap-3">
                <div className="flex items-center gap-2 rounded-xl bg-white px-4 py-1.5 text-base sm:text-lg font-bold text-[#1d1f26] shadow-xs border border-gray-200">
                  <img
                    src="/assets/images/camera.svg"
                    alt=""
                    className="size-8 object-contain"
                  />
                  <span>{uniquePhotosCount} Photos</span>
                </div>
                <div className="flex items-center gap-2 rounded-xl bg-white px-4 py-1.5 text-base sm:text-lg font-bold text-[#1d1f26] shadow-xs border border-gray-200">
                  <img
                    src="/assets/images/hourglass.svg"
                    alt=""
                    className="size-8 object-contain"
                  />
                  <span>{selectedTemplate.countdownSeconds ?? 5}s timer</span>
                </div>
              </div>
              {(() => {
                const cardWidth = selectedTemplate.outputWidth || (selectedTemplate.orientation === 'landscape' ? 1800 : 1200);
                const cardHeight = selectedTemplate.outputHeight || (selectedTemplate.orientation === 'landscape' ? 1200 : 1800);
                const isLandscape = selectedTemplate.orientation === 'landscape' || cardWidth > cardHeight;
                const bgUrl = resolveAssetUrl(selectedTemplate.backgroundPath ?? null);

                return (
                  <div
                    className="relative shadow-2xl rounded-2xl overflow-hidden bg-gradient-to-b from-[#1b4372] via-[#2a5b8c] to-[#122b49] border border-gray-200/60"
                    style={{
                      height: isLandscape ? 'auto' : '100%',
                      width: isLandscape ? '100%' : 'auto',
                      maxHeight: '530px',
                      maxWidth: isLandscape ? '100%' : '340px',
                      aspectRatio: isLandscape ? '3/2' : '2/3',
                    }}
                  >
                    {/* Background Image */}
                    {bgUrl && (
                      <img
                        src={bgUrl}
                        alt=""
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                        className="absolute inset-0 size-full object-cover"
                      />
                    )}

                    {/* Overlays */}
                    {selectedTemplate.overlays?.map((overlay, idx) => {
                      const overlayUrl = resolveAssetUrl(overlay.path || overlay.assetPath || null);
                      if (!overlayUrl) return null;
                      return (
                        <img
                          key={overlay.id || idx}
                          src={overlayUrl}
                          alt=""
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                          style={{
                            left: `${(overlay.x / cardWidth) * 100}%`,
                            top: `${(overlay.y / cardHeight) * 100}%`,
                            width: `${(overlay.width / cardWidth) * 100}%`,
                            height: `${(overlay.height / cardHeight) * 100}%`,
                            transform: overlay.rotation ? `rotate(${overlay.rotation}deg)` : undefined,
                            zIndex: (overlay.zIndex ?? 2) * 2 + 1,
                          }}
                          className="absolute object-contain pointer-events-none"
                        />
                      );
                    })}

                    {/* Placements */}
                    {selectedTemplate.placements
                      .slice()
                      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
                      .map((p) => (
                        <div
                          key={p.id ?? `${p.captureIndex}-${p.x}-${p.y}`}
                          style={{
                            left: `${(p.x / cardWidth) * 100}%`,
                            top: `${(p.y / cardHeight) * 100}%`,
                            width: `${(p.width / cardWidth) * 100}%`,
                            height: `${(p.height / cardHeight) * 100}%`,
                            transform: p.rotation ? `rotate(${p.rotation}deg)` : undefined,
                            zIndex: (p.zIndex ?? 1) * 2,
                          }}
                          className="absolute flex items-center justify-center bg-[#ebfcf3]/95 border border-white/80 text-[#146a56] font-bold text-lg sm:text-xl shadow-xs rounded-[3px]"
                        >
                          {p.captureIndex}
                        </div>
                      ))}
                  </div>
                );
              })()}
            </div>

            {/* Bottom: Action Controls Row (shifted slightly higher with like.svg) */}
            <div className="flex items-end justify-between w-full max-w-[340px] sm:max-w-[360px] mb-5 sm:mb-6 gap-4 shrink-0">
              {/* Back Button */}
              {onBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full border-2 border-[#2d3748] text-[#2d3748] text-sm sm:text-base font-bold opacity-70 hover:bg-gray-100 hover:opacity-100 transition active:scale-95 cursor-pointer"
                >
                  <svg
                    className="size-5 stroke-current stroke-[2.5]"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  <span>Back</span>
                </button>
              ) : (
                <div />
              )}

              {/* I LIKE THIS Button with like.svg */}
              <button
                type="button"
                onClick={handleConfirm}
                className="inline-flex items-center gap-2 px-6 sm:px-7 py-2 rounded-full bg-[#1b6d5b] hover:bg-[#145a49] text-white text-lg sm:text-xl font-bold tracking-wide shadow-[0_6px_20px_rgba(27,109,91,0.3)] transition-all hover:-translate-y-0.5 active:scale-95 cursor-pointer"
              >
                <span>I LIKE THIS</span>
                <img
                  src="/assets/images/like-icon.svg"
                  alt=""
                  className="size-5 sm:size-10 object-contain pointer-events-none drop-shadow-xs"
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

