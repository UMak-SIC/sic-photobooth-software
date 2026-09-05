import { describe, expect, it } from 'vitest';
import { layoutPlacements, layoutPresets } from './presets';

describe('template layouts', () => {
  it('creates slots with valid dimensions', () => {
    for (const preset of layoutPresets) {
      for (const placement of layoutPlacements(preset.id)) {
        expect(placement.width).toBeGreaterThan(0);
        expect(placement.height).toBeGreaterThan(0);
      }
    }
  });

  it('provides the eight-slot 2x2 strip grid', () => {
    expect(layoutPlacements('I').map((placement) => placement.captureIndex)).toEqual([1, 1, 2, 2, 1, 1, 2, 2]);
  });

  it('provides a one-capture two-row portrait layout', () => {
    expect(layoutPlacements('K').map((placement) => placement.captureIndex)).toEqual([1, 1]);
  });
});
