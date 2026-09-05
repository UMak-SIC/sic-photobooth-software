import React, { useEffect, useState } from 'react';
import type { ReviewTemplate } from './PhotoStripReview';
import { boothApi } from '../../services/api';

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
            return (
              <button
                key={template.id}
                type="button"
                onClick={() => setSelectedId(template.id)}
                className={`rounded-2xl border p-4 text-left transition active:scale-[0.99] cursor-pointer ${
                  isSelected
                    ? 'border-[#1a7e67] bg-[#e7fff7] ring-2 ring-[#79d6bf]/60 shadow-sm'
                    : 'border-[#c0e2d8] bg-white hover:border-[#8ec5b6]'
                }`}
              >
                <div className={`template-art ${isSelected ? 'template-pioneers' : ''}`}>
                  <span>
                    SIC
                    <br />
                    2026
                  </span>
                </div>
                <strong className="mt-4 block text-[17px] text-[#113b33]">{template.name}</strong>
                <small className="mt-1 block text-[13px] text-[#5b8176]">
                  {template.placements.length} photos ·{' '}
                  <span className="capitalize">{template.orientation}</span>
                </small>
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
