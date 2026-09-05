declare module 'gifenc' {
  export interface QuantizeOptions {
    maxColors?: number;
    format?: string;
  }

  export interface WriteFrameOptions {
    palette?: number[][];
    delay?: number;
    repeat?: number;
    dispose?: number;
    transparent?: boolean;
    transparentIndex?: number;
  }

  export function GIFEncoder(): {
    writeFrame: (
      index: Uint8Array | Uint8ClampedArray | number[],
      width: number,
      height: number,
      opts?: WriteFrameOptions,
    ) => void;
    finish: () => void;
    bytes: () => Uint8Array;
    bytesView: () => Uint8Array;
  };

  export function quantize(rgba: Uint8ClampedArray | Uint8Array, maxColors?: number): number[][];

  export function applyPalette(
    rgba: Uint8ClampedArray | Uint8Array,
    palette: number[][],
  ): Uint8Array;
}
