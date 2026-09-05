import React, { useEffect, useState } from 'react';
import type { ReviewTemplate } from './PhotoStripReview';
import { boothApi, resolveAssetUrl } from '../../services/api';

export interface TemplatePickerProps {
  preview?: boolean;
  onSelectTemplate?: (template: ReviewTemplate) => void;
}

const DEFAULT_TEMPLATES: ReviewTemplate[] = [
  {
    id: 'classic-portrait',
    name: 'Pioneers',
    orientation: 'portrait',
    outputWidth: 1200,
    outputHeight: 1800,
    countdownSeconds: 5,
    placements: [
      { captureIndex: 1, x: 100, y: 120, width: 1000, height: 440, borderRadius: 8, zIndex: 1 },
      { captureIndex: 2, x: 100, y: 600, width: 1000, height: 440, borderRadius: 8, zIndex: 1 },
      { captureIndex: 3, x: 100, y: 1080, width: 1000, height: 440, borderRadius: 8, zIndex: 1 },
    ],
  },
  {
    id: 'the-circuit',
    name: 'The Circuit',
    orientation: 'landscape',
    outputWidth: 1800,
    outputHeight: 1200,
    countdownSeconds: 5,
    placements: [
      { captureIndex: 1, x: 120, y: 120, width: 720, height: 450, borderRadius: 8, zIndex: 1 },
      { captureIndex: 2, x: 960, y: 120, width: 720, height: 450, borderRadius: 8, zIndex: 1 },
      { captureIndex: 3, x: 120, y: 630, width: 720, height: 450, borderRadius: 8, zIndex: 1 },
      { captureIndex: 4, x: 960, y: 630, width: 720, height: 450, borderRadius: 8, zIndex: 1 },
    ],
  },
  {
    id: 'seafoam',
    name: 'Seafoam',
    orientation: 'portrait',
    outputWidth: 1200,
    outputHeight: 1800,
    countdownSeconds: 5,
    placements: [
      { captureIndex: 1, x: 120, y: 160, width: 960, height: 680, borderRadius: 8, zIndex: 1 },
      { captureIndex: 2, x: 120, y: 920, width: 960, height: 680, borderRadius: 8, zIndex: 1 },
    ],
  },
];

export const TemplatePicker: React.FC<TemplatePickerProps> = ({
  preview = false,
  onSelectTemplate,
}) => {
  const [templates, setTemplates] = useState<ReviewTemplate[]>(DEFAULT_TEMPLATES);
  const [loading, setLoading] = useState<boolean>(!preview);
  const [selectedId, setSelectedId] = useState<string>(DEFAULT_TEMPLATES[0].id);

  useEffect(() => {
    if (preview) return;
    async function loadTemplates() {
      try {
        const data = await boothApi.listTemplates();
        if (Array.isArray(data) && data.length > 0) {
          setTemplates(data);
          setSelectedId(data[0].id);
        }
      } catch (err) {
        console.warn('Could not fetch templates from backend, using fallbacks:', err);
      } finally {
        setLoading(false);
      }
    }
    loadTemplates();
  }, [preview]);

  const selectedTemplate = templates.find((t) => t.id === selectedId) || templates[0];

  const handleContinue = () => {
    if (selectedTemplate && onSelectTemplate) {
      onSelectTemplate(selectedTemplate);
    }
  };

  return (
    <div className="artboard relative flex h-full min-h-[780px] w-full flex-col items-center justify-center overflow-hidden bg-[#ecfff8] px-14 py-12 text-center text-[#113b33]">
      <div className="flex w-full max-w-[1000px] items-end justify-between text-left">
        <div>
          <p className="text-[13px] font-bold tracking-[0.14em] text-[#28806c]">PHOTO STRIPS</p>
          <h4 className="mt-2 text-[43px] font-black tracking-[-0.06em]">Pick your layout.</h4>
        </div>
        <p className="max-w-[300px] text-[14px] leading-6 text-[#5b8176]">
          Your selected template stays fixed for this session.
        </p>
      </div>

      {loading ? (
        <div className="my-20 flex flex-col items-center justify-center gap-3">
          <div className="size-8 rounded-full border-3 border-[#176a56] border-t-transparent animate-spin" />
          <p className="text-sm font-semibold text-[#5b8176]">Loading available layouts...</p>
        </div>
      ) : (
        <div className="mt-10 grid w-full max-w-[1000px] grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 text-left">
          {templates.map((template) => {
            const isSelected = template.id === selectedId;
            const cardWidth = template.outputWidth || 1200;
            const cardHeight = template.outputHeight || 1800;
            const isLandscape = template.orientation === 'landscape' || cardWidth > cardHeight;
            const uniquePhotosCount =
              template.requiredCaptureCount ??
              new Set(template.placements.map((p) => p.captureIndex)).size;
            const bgUrl = resolveAssetUrl(template.backgroundPath ?? null);

            return (
              <button
                key={template.id}
                type="button"
                onClick={() => setSelectedId(template.id)}
                className={`flex flex-col justify-between rounded-2xl border p-4 text-left transition active:scale-[0.99] cursor-pointer ${
                  isSelected
                    ? 'border-[#1a7e67] bg-[#e7fff7] ring-2 ring-[#79d6bf]/60 shadow-md'
                    : 'border-[#c0e2d8] bg-white hover:border-[#8ec5b6] shadow-xs'
                }`}
              >
                {/* Dynamic Mini-Preview Artboard */}
                <div className="relative mb-3 flex h-[230px] w-full items-center justify-center overflow-hidden rounded-xl bg-gray-50/50 p-2">
                  <div
                    className={`mini-canvas ${isLandscape ? 'landscape' : ''} shadow-md rounded-lg overflow-hidden`}
                    style={{
                      height: isLandscape ? 'auto' : '100%',
                      width: isLandscape ? '100%' : 'auto',
                      maxHeight: '210px',
                      maxWidth: '100%',
                    }}
                  >
                    {/* Background */}
                    {bgUrl && (
                      <img
                        src={bgUrl}
                        alt=""
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                        style={
                          template.background
                            ? {
                                left: `${(template.background.x / cardWidth) * 100}%`,
                                top: `${(template.background.y / cardHeight) * 100}%`,
                                width: `${(template.background.width / cardWidth) * 100}%`,
                                height: `${(template.background.height / cardHeight) * 100}%`,
                              }
                            : { left: 0, top: 0, width: '100%', height: '100%' }
                        }
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
                            zIndex: overlay.zIndex ?? 5,
                          }}
                        />
                      );
                    })}

                    {/* Placements */}
                    {template.placements
                      .slice()
                      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
                      .map((p) => (
                        <span
                          key={p.id ?? `${p.captureIndex}-${p.x}-${p.y}`}
                          style={{
                            left: `${(p.x / cardWidth) * 100}%`,
                            top: `${(p.y / cardHeight) * 100}%`,
                            width: `${(p.width / cardWidth) * 100}%`,
                            height: `${(p.height / cardHeight) * 100}%`,
                            borderRadius: p.borderRadius
                              ? `${(p.borderRadius / cardWidth) * 100}%`
                              : '4px',
                            transform: p.rotation ? `rotate(${p.rotation}deg)` : undefined,
                            zIndex: p.zIndex ?? 1,
                          }}
                        >
                          {p.captureIndex}
                        </span>
                      ))}
                  </div>
                </div>

                {/* Metadata & Labels */}
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <strong className="block text-[17px] font-bold text-[#113b33] truncate">
                      {template.name}
                    </strong>
                    <span className="rounded-md bg-[#1b6d5b]/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-[#186453]">
                      {template.orientation}
                    </span>
                  </div>
                  <small className="mt-1 block text-[13px] text-[#5b8176]">
                    {uniquePhotosCount} {uniquePhotosCount === 1 ? 'photo' : 'photos'} ·{' '}
                    <span>{template.countdownSeconds || 5}s timer</span>
                  </small>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-11">
        <button
          type="button"
          onClick={handleContinue}
          disabled={loading || !selectedTemplate}
          className="rounded-xl bg-[#146a56] px-8 py-3.5 text-[14px] font-bold text-white shadow-[0_8px_18px_rgba(20,106,86,0.22)] transition hover:bg-[#0f5444] active:scale-[0.98] disabled:opacity-50"
        >
          Use {selectedTemplate?.name || 'Layout'}
        </button>
      </div>
    </div>
  );
};
