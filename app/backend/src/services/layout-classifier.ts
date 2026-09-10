export type LayoutCategory =
  | '2_cut_split' // 2-cut / split strip with duplicated shots (e.g. 4 shots across 8 slots)
  | '4_cut_quad' // 4-cut quad grid (2x2)
  | '2_cut_horizontal' // 2-cut horizontal split
  | 'single_strip' // Single uncut vertical strip
  | 'flipbook' // Flipbook 16-frame gang layout
  | 'custom';

export interface PlacementLike {
  x: number;
  y: number;
  width: number;
  height: number;
  captureIndex?: number;
}

export function classifyTemplateLayout(
  type: string,
  placements?: PlacementLike[] | null,
  outputWidth: number = 1200,
  outputHeight: number = 1800,
): { category: LayoutCategory; label: string; description: string } {
  if (type === 'flipbook') {
    return {
      category: 'flipbook',
      label: 'Flipbook Booklet',
      description: '16-frame gang sheet animated booklet',
    };
  }

  if (!placements || placements.length === 0) {
    return {
      category: 'single_strip',
      label: 'Single Strip',
      description: 'Classic single photobooth strip',
    };
  }

  const slotCount = placements.length;
  const captureIndices = placements
    .map((p) => p.captureIndex || 1)
    .sort((a, b) => a - b);
  const uniqueCaptureIndices = new Set(captureIndices);

  // Check if 8 slots with duplicate capture indices (e.g. 1,1, 2,2, 3,3, 4,4 or 4 shots duplicated)
  const isVerticalSplit = placements.some((p) => p.x < outputWidth / 2) &&
                          placements.some((p) => p.x >= outputWidth / 2 - 50);

  if (slotCount === 8 || (slotCount >= 6 && uniqueCaptureIndices.size < slotCount && isVerticalSplit)) {
    return {
      category: '2_cut_split',
      label: '2-Cut Split (Couple / Duplicates)',
      description: `${uniqueCaptureIndices.size} shots duplicated across ${slotCount} slots (Splits into 2 duplicate strips)`,
    };
  }

  // Check if 4 slots arranged in quad grid (2 columns x 2 rows)
  const isHorizontalSplit = placements.some((p) => p.y < outputHeight / 2) &&
                            placements.some((p) => p.y >= outputHeight / 2 - 50);

  if (slotCount === 4 && isVerticalSplit && isHorizontalSplit) {
    return {
      category: '4_cut_quad',
      label: '4-Cut Quad',
      description: '4 shots in a 2×2 quad grid (Cuts into 4 mini-prints)',
    };
  }

  if (slotCount === 2 && isHorizontalSplit && !isVerticalSplit) {
    return {
      category: '2_cut_horizontal',
      label: '2-Cut Horizontal',
      description: '2 horizontal photo cards (Cuts horizontally into 2)',
    };
  }

  if (slotCount <= 4 && !isVerticalSplit) {
    return {
      category: 'single_strip',
      label: 'Single Strip (Uncut)',
      description: `${slotCount}-shot standard single photo strip`,
    };
  }

  return {
    category: 'custom',
    label: 'Custom Layout',
    description: `${slotCount}-slot custom multi-photo layout`,
  };
}
