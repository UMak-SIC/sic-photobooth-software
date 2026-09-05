import React, { useEffect, useState } from 'react';
import type { ReviewTemplate } from './PhotoStripReview';
import { boothApi } from '../services/api';

interface TemplatePickerProps {
  onSelectTemplate: (template: ReviewTemplate) => void;
}

export const TemplatePicker: React.FC<TemplatePickerProps> = ({ onSelectTemplate }) => {
  const [templates, setTemplates] = useState<ReviewTemplate[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedId, setSelectedId] = useState<string>('');

  useEffect(() => {
    async function loadTemplates() {
      try {
        const data = await boothApi.listTemplates();
        if (Array.isArray(data) && data.length > 0) {
          setTemplates(data);
          setSelectedId(data[0].id);
        }
      } catch (err) {
        console.warn('Could not fetch templates from backend:', err);
        // Fallback default templates
        const fallbacks: ReviewTemplate[] = [
          {
            id: 'classic-portrait',
            name: 'Classic Portrait Strip',
            orientation: 'portrait',
            outputWidth: 1200,
            outputHeight: 1800,
            placements: [
              {
                captureIndex: 1,
                x: 100,
                y: 120,
                width: 1000,
                height: 440,
                borderRadius: 8,
                zIndex: 1,
              },
              {
                captureIndex: 2,
                x: 100,
                y: 600,
                width: 1000,
                height: 440,
                borderRadius: 8,
                zIndex: 1,
              },
              {
                captureIndex: 3,
                x: 100,
                y: 1080,
                width: 1000,
                height: 440,
                borderRadius: 8,
                zIndex: 1,
              },
            ],
          },
          {
            id: 'grid-landscape',
            name: 'Grid 2x2 Landscape',
            orientation: 'landscape',
            outputWidth: 1800,
            outputHeight: 1200,
            placements: [
              {
                captureIndex: 1,
                x: 120,
                y: 120,
                width: 720,
                height: 450,
                borderRadius: 8,
                zIndex: 1,
              },
              {
                captureIndex: 2,
                x: 960,
                y: 120,
                width: 720,
                height: 450,
                borderRadius: 8,
                zIndex: 1,
              },
              {
                captureIndex: 3,
                x: 120,
                y: 630,
                width: 720,
                height: 450,
                borderRadius: 8,
                zIndex: 1,
              },
              {
                captureIndex: 4,
                x: 960,
                y: 630,
                width: 720,
                height: 450,
                borderRadius: 8,
                zIndex: 1,
              },
            ],
          },
        ];
        setTemplates(fallbacks);
        setSelectedId(fallbacks[0].id);
      } finally {
        setLoading(false);
      }
    }
    loadTemplates();
  }, []);

  const selectedTemplate = templates.find((t) => t.id === selectedId) || templates[0];

  const handleContinue = () => {
    if (selectedTemplate) {
      onSelectTemplate(selectedTemplate);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-zinc-400">
        <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mb-4" />
        <p>Loading available templates...</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col items-center p-6">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-extrabold text-white tracking-tight">
          Choose Your Photo Strip Template
        </h2>
        <p className="mt-2 text-zinc-400 text-sm">
          Select the layout for your 4R printed photo card.
        </p>
      </div>

      {/* Grid of templates */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-2xl mb-8">
        {templates.map((t) => {
          const isSelected = t.id === selectedId;
          const isPortrait = t.orientation === 'portrait';
          return (
            <div
              key={t.id}
              onClick={() => setSelectedId(t.id)}
              className={`p-6 rounded-2xl border-2 cursor-pointer transition-all flex flex-col items-center ${
                isSelected
                  ? 'bg-zinc-900 border-emerald-400 shadow-xl shadow-emerald-500/10 scale-102'
                  : 'bg-zinc-950/60 border-zinc-800 hover:border-zinc-700'
              }`}
            >
              {/* Miniature card illustration */}
              <div
                className="relative bg-zinc-800 rounded-lg border border-zinc-700 p-2 flex flex-col gap-1.5 shadow-inner mb-4"
                style={{
                  width: isPortrait ? '100px' : '140px',
                  height: isPortrait ? '140px' : '100px',
                }}
              >
                {t.placements.map((_, i) => (
                  <div
                    key={i}
                    className="bg-emerald-500/20 border border-emerald-500/40 rounded flex-1"
                  />
                ))}
              </div>

              <h3 className="text-white font-bold text-base">{t.name}</h3>
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className="px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-300 font-medium capitalize">
                  {t.orientation}
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 font-medium">
                  {t.placements.length} Photos
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Continue Button */}
      <button
        onClick={handleContinue}
        disabled={!selectedTemplate}
        className="py-4 px-10 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-base uppercase tracking-wider rounded-xl transition-all shadow-xl hover:shadow-emerald-500/20 active:scale-98"
      >
        Continue to Camera 📸
      </button>
    </div>
  );
};
