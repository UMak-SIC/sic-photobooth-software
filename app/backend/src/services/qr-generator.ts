/**
 * Zero-dependency pure TypeScript QR Code SVG generator.
 * Implements ISO/IEC 18004 byte-mode QR generation with Reed-Solomon error correction.
 */

// Galois Field GF(256) tables with primitive polynomial 0x11d
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) {
      x ^= 0x11d;
    }
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return GF_EXP[GF_LOG[x] + GF_LOG[y]];
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const factor = new Uint8Array([1, GF_EXP[i]]);
    const newPoly = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      newPoly[j] ^= gfMul(poly[j], factor[0]);
      newPoly[j + 1] ^= gfMul(poly[j], factor[1]);
    }
    poly = newPoly;
  }
  return poly;
}

function rsCalculateEc(data: Uint8Array, ecCount: number): Uint8Array {
  const genPoly = rsGeneratorPoly(ecCount);
  const info = new Uint8Array(data.length + ecCount);
  info.set(data);

  for (let i = 0; i < data.length; i++) {
    const lead = info[i];
    if (lead !== 0) {
      for (let j = 0; j < genPoly.length; j++) {
        info[i + j] ^= gfMul(lead, genPoly[j]);
      }
    }
  }
  return info.slice(data.length);
}

// Version table configs for Byte mode, Error Correction Level M
interface VersionConfig {
  version: number;
  size: number;
  totalDataBytes: number;
  ecBytesPerBlock: number;
  blocks: number;
  alignments: number[];
}

const VERSIONS: VersionConfig[] = [
  { version: 1, size: 21, totalDataBytes: 16, ecBytesPerBlock: 10, blocks: 1, alignments: [] },
  { version: 2, size: 25, totalDataBytes: 28, ecBytesPerBlock: 16, blocks: 1, alignments: [6, 18] },
  { version: 3, size: 29, totalDataBytes: 44, ecBytesPerBlock: 26, blocks: 1, alignments: [6, 22] },
  { version: 4, size: 33, totalDataBytes: 64, ecBytesPerBlock: 18, blocks: 2, alignments: [6, 26] },
  { version: 5, size: 37, totalDataBytes: 86, ecBytesPerBlock: 24, blocks: 2, alignments: [6, 30] },
];

export function generateQrMatrix(text: string): boolean[][] {
  const textBytes = Buffer.from(text, 'utf8');

  // Select minimum version that fits data (byte mode has 4-bit mode + 8-bit length header)
  let config = VERSIONS.find((v) => v.totalDataBytes >= textBytes.length + 2);
  if (!config) {
    config = VERSIONS[VERSIONS.length - 1];
  }

  // 1. Bit buffer encoding (Byte Mode: 0100)
  const bitArray: number[] = [];
  function pushBits(val: number, len: number) {
    for (let i = len - 1; i >= 0; i--) {
      bitArray.push((val >> i) & 1);
    }
  }

  pushBits(0b0100, 4); // Byte mode indicator
  pushBits(textBytes.length, 8); // Character count (8 bits for v1..9)
  for (let i = 0; i < textBytes.length; i++) {
    pushBits(textBytes[i], 8);
  }

  // Terminator (up to 4 zeroes)
  const maxBits = config.totalDataBytes * 8;
  const termLen = Math.min(4, maxBits - bitArray.length);
  pushBits(0, termLen);

  // Pad to multiple of 8
  while (bitArray.length % 8 !== 0) {
    bitArray.push(0);
  }

  // Pad bytes 0xEC, 0x11
  const padPatterns = [0xec, 0x11];
  let padIdx = 0;
  while (bitArray.length < maxBits) {
    pushBits(padPatterns[padIdx % 2], 8);
    padIdx++;
  }

  // 2. Convert bit array to bytes
  const dataBytes = new Uint8Array(config.totalDataBytes);
  for (let i = 0; i < config.totalDataBytes; i++) {
    let byteVal = 0;
    for (let b = 0; b < 8; b++) {
      byteVal = (byteVal << 1) | bitArray[i * 8 + b];
    }
    dataBytes[i] = byteVal;
  }

  // 3. Error correction calculation
  const bytesPerBlock = Math.floor(config.totalDataBytes / config.blocks);
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];

  for (let b = 0; b < config.blocks; b++) {
    const start = b * bytesPerBlock;
    const end = b === config.blocks - 1 ? config.totalDataBytes : start + bytesPerBlock;
    const blockData = dataBytes.slice(start, end);
    dataBlocks.push(blockData);
    ecBlocks.push(rsCalculateEc(blockData, config.ecBytesPerBlock));
  }

  // 4. Interleave data and EC bytes
  const finalSequence: number[] = [];
  const maxDataBlockLen = Math.max(...dataBlocks.map((d) => d.length));
  for (let i = 0; i < maxDataBlockLen; i++) {
    for (let b = 0; b < config.blocks; b++) {
      if (i < dataBlocks[b].length) {
        finalSequence.push(dataBlocks[b][i]);
      }
    }
  }
  for (let i = 0; i < config.ecBytesPerBlock; i++) {
    for (let b = 0; b < config.blocks; b++) {
      finalSequence.push(ecBlocks[b][i]);
    }
  }

  // 5. Build QR Matrix
  const N = config.size;
  const matrix: boolean[][] = Array.from({ length: N }, () => Array(N).fill(false));
  const isReserved: boolean[][] = Array.from({ length: N }, () => Array(N).fill(false));

  function setModule(r: number, c: number, val: boolean) {
    matrix[r][c] = val;
    isReserved[r][c] = true;
  }

  // Finder patterns (7x7)
  function placeFinder(row: number, col: number) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = row + r;
        const nc = col + c;
        if (nr >= 0 && nr < N && nc >= 0 && nc < N) {
          const isBlack =
            (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
            (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
            (r >= 2 && r <= 4 && c >= 2 && c <= 4);
          setModule(nr, nc, isBlack);
        }
      }
    }
  }

  placeFinder(0, 0);
  placeFinder(0, N - 7);
  placeFinder(N - 7, 0);

  // Timing patterns
  for (let i = 8; i < N - 8; i++) {
    if (!isReserved[6][i]) setModule(6, i, i % 2 === 0);
    if (!isReserved[i][6]) setModule(i, 6, i % 2 === 0);
  }

  // Alignment patterns
  if (config.alignments.length > 0) {
    for (const r of config.alignments) {
      for (const c of config.alignments) {
        if (!isReserved[r][c]) {
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              const isBlack = Math.abs(dy) === 2 || Math.abs(dx) === 2 || (dy === 0 && dx === 0);
              setModule(r + dy, c + dx, isBlack);
            }
          }
        }
      }
    }
  }

  // Dark module
  setModule(4 * config.version + 9, 8, true);

  // Reserve format info area
  for (let i = 0; i < 9; i++) {
    if (!isReserved[8][i]) isReserved[8][i] = true;
    if (!isReserved[i][8]) isReserved[i][8] = true;
  }
  for (let i = N - 8; i < N; i++) {
    if (!isReserved[8][i]) isReserved[8][i] = true;
    if (!isReserved[i][8]) isReserved[i][8] = true;
  }

  // 6. Data module placement (zigzag)
  let bitIdx = 0;
  const totalDataBits = finalSequence.length * 8;
  let up = true;

  for (let col = N - 1; col > 0; col -= 2) {
    if (col === 6) col--; // skip timing pattern col
    const rows = up
      ? Array.from({ length: N }, (_, i) => N - 1 - i)
      : Array.from({ length: N }, (_, i) => i);

    for (const row of rows) {
      for (const c of [col, col - 1]) {
        if (!isReserved[row][c]) {
          let bit = false;
          if (bitIdx < totalDataBits) {
            const byteNum = Math.floor(bitIdx / 8);
            const bitOffset = 7 - (bitIdx % 8);
            bit = ((finalSequence[byteNum] >> bitOffset) & 1) === 1;
            bitIdx++;
          }
          // Mask 0: (row + c) % 2 === 0
          if ((row + c) % 2 === 0) {
            bit = !bit;
          }
          matrix[row][c] = bit;
        }
      }
    }
    up = !up;
  }

  // 7. Format Information (Mask 0, EC Level M = 00)
  // Format bits for Level M (00), Mask 0 (000) with BCH error correction and 0x5412 XOR: 0b101010000010010
  const formatBits = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];
  for (let i = 0; i < 15; i++) {
    const bit = formatBits[i] === 1;
    if (i < 6) matrix[8][i] = bit;
    else if (i < 8) matrix[8][i + 1] = bit;
    else matrix[14 - (i - 7)][8] = bit;

    if (i < 7) matrix[N - 1 - i][8] = bit;
    else matrix[8][N - 15 + i] = bit;
  }

  return matrix;
}

/**
 * Generates an SVG string of the QR Code.
 */
export function generateQrSvg(
  text: string,
  options?: {
    size?: number;
    margin?: number;
    color?: string;
    background?: string;
  },
): string {
  const matrix = generateQrMatrix(text);
  const n = matrix.length;
  const size = options?.size || 200;
  const margin = options?.margin !== undefined ? options.margin : 2;
  const totalCells = n + margin * 2;
  const cellSize = size / totalCells;

  const color = options?.color || '#000000';
  const bg = options?.background || '#ffffff';

  let rects = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (matrix[r][c]) {
        const x = (c + margin) * cellSize;
        const y = (r + margin) * cellSize;
        rects += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${cellSize.toFixed(2)}" height="${cellSize.toFixed(2)}" fill="${color}"/>`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${bg}"/>
  ${rects}
</svg>`;
}
