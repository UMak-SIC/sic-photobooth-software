export type PhotoFilterType = 'normal' | 'bw' | 'sepia' | 'warm';

export interface PhotoFilterPreset {
  id: PhotoFilterType;
  label: string;
  sublabel: string;
  cssFilter: string;
  previewBg: string;
  accentColor: string;
}

export const PHOTO_FILTERS: PhotoFilterPreset[] = [
  {
    id: 'normal',
    label: 'Original',
    sublabel: 'Natural Colors',
    cssFilter: 'none',
    previewBg: 'linear-gradient(135deg, #10b981 0%, #065f46 100%)',
    accentColor: '#10b981',
  },
  {
    id: 'bw',
    label: 'Classic B&W',
    sublabel: 'Monochrome',
    cssFilter: 'grayscale(100%) contrast(110%)',
    previewBg: 'linear-gradient(135deg, #4b5563 0%, #111827 100%)',
    accentColor: '#374151',
  },
  {
    id: 'sepia',
    label: 'Vintage Sepia',
    sublabel: 'Retro Warmth',
    cssFilter: 'sepia(65%) contrast(105%) brightness(95%)',
    previewBg: 'linear-gradient(135deg, #d97706 0%, #78350f 100%)',
    accentColor: '#b45309',
  },
  {
    id: 'warm',
    label: 'Warm Golden',
    sublabel: 'Sunlit Glow',
    cssFilter: 'saturate(130%) brightness(105%) sepia(15%)',
    previewBg: 'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)',
    accentColor: '#d97706',
  },
];

export function getFilterCss(filterId?: PhotoFilterType | null): string {
  const filter = PHOTO_FILTERS.find((f) => f.id === filterId);
  return filter ? filter.cssFilter : 'none';
}
