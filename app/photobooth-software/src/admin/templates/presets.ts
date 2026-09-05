import type { Orientation, TemplatePlacement } from './types';

export type LayoutPreset = {
  id: string;
  label: string;
  orientation: Orientation;
  captures: number;
};

export const layoutPresets: LayoutPreset[] = [
  { id: 'A', label: 'Layout A', orientation: 'portrait', captures: 3 },
  { id: 'B', label: 'Layout B', orientation: 'portrait', captures: 4 },
  { id: 'C', label: 'Layout C', orientation: 'landscape', captures: 4 },
  { id: 'D', label: 'Layout D', orientation: 'landscape', captures: 3 },
  { id: 'E', label: 'Layout E', orientation: 'landscape', captures: 2 },
  { id: 'F', label: 'Layout F', orientation: 'landscape', captures: 2 },
  { id: 'G', label: 'Layout G', orientation: 'portrait', captures: 2 },
  { id: 'H', label: 'Layout H', orientation: 'landscape', captures: 1 },
  { id: 'I', label: 'Layout I', orientation: 'portrait', captures: 2 },
  { id: 'J', label: 'Layout J – 8 unique', orientation: 'portrait', captures: 8 },
];

const slot = (captureIndex: number, x: number, y: number, width: number): TemplatePlacement => ({
  captureIndex,
  x,
  y,
  width,
  height: width * (9 / 16),
  rotation: 0,
  borderRadius: 0,
  zIndex: captureIndex,
});

export function layoutPlacements(id: string): TemplatePlacement[] {
  switch (id) {
    case 'A':
      return [
        ...[280, 630, 980].flatMap((y, index) => [slot(index + 1, 90, y, 420), slot(index + 1, 690, y, 420)]),
      ];
    case 'B':
      return [
        ...[260, 540, 820, 1100].flatMap((y, index) => [slot(index + 1, 90, y, 373), slot(index + 1, 737, y, 373)]),
      ];
    case 'C':
      return [slot(1, 90, 90, 900), slot(2, 90, 800, 450), slot(3, 675, 800, 450), slot(4, 1260, 800, 450)];
    case 'D':
      return [slot(1, 120, 120, 720), slot(2, 960, 120, 720), slot(3, 120, 675, 720)];
    case 'E':
      return [slot(1, 140, 150, 650), slot(2, 140, 670, 650)];
    case 'F':
      return [slot(1, 150, 400, 720), slot(2, 930, 400, 720)];
    case 'G':
      return [slot(1, 150, 200, 900), slot(2, 150, 950, 900)];
    case 'H':
      return [slot(1, 180, 120, 1440)];
    case 'I':
      return [
        ...[120, 420].flatMap((y, index) => [slot(index + 1, 90, y, 420), slot(index + 1, 690, y, 420)]),
        ...[1020, 1320].flatMap((y, index) => [slot(index + 1, 90, y, 420), slot(index + 1, 690, y, 420)]),
      ];
    case 'J':
      return [260, 540, 820, 1100].flatMap((y, row) => [
        slot(row + 1, 90, y, 373),
        slot(row + 5, 737, y, 373),
      ]);
    default:
      return [];
  }
}
