/**
 * Zero-dependency ISO/IEC 18004 QR Code Matrix & SVG Path Encoder (Byte Mode, ECC Level L, Versions 1..12).
 * Produces crisp vector SVG paths locally in the browser with zero external requests.
 */

interface VersionSpec {
  version: number;
  ecCodewordsPerBlock: number;
  groups: { count: number; dataCodewords: number }[];
  alignment: number[];
}

const VERSION_SPECS_L: readonly VersionSpec[] = [
  { version: 1, ecCodewordsPerBlock: 7, groups: [{ count: 1, dataCodewords: 19 }], alignment: [] },
  { version: 2, ecCodewordsPerBlock: 10, groups: [{ count: 1, dataCodewords: 34 }], alignment: [6, 18] },
  { version: 3, ecCodewordsPerBlock: 15, groups: [{ count: 1, dataCodewords: 55 }], alignment: [6, 22] },
  { version: 4, ecCodewordsPerBlock: 20, groups: [{ count: 1, dataCodewords: 80 }], alignment: [6, 26] },
  { version: 5, ecCodewordsPerBlock: 26, groups: [{ count: 1, dataCodewords: 108 }], alignment: [6, 30] },
  { version: 6, ecCodewordsPerBlock: 18, groups: [{ count: 2, dataCodewords: 68 }], alignment: [6, 34] },
  { version: 7, ecCodewordsPerBlock: 20, groups: [{ count: 2, dataCodewords: 78 }], alignment: [6, 22, 38] },
  { version: 8, ecCodewordsPerBlock: 24, groups: [{ count: 2, dataCodewords: 97 }], alignment: [6, 24, 42] },
  { version: 9, ecCodewordsPerBlock: 30, groups: [{ count: 2, dataCodewords: 116 }], alignment: [6, 26, 46] },
  {
    version: 10,
    ecCodewordsPerBlock: 18,
    groups: [
      { count: 2, dataCodewords: 68 },
      { count: 2, dataCodewords: 69 },
    ],
    alignment: [6, 28, 50],
  },
  { version: 11, ecCodewordsPerBlock: 20, groups: [{ count: 4, dataCodewords: 81 }], alignment: [6, 30, 54] },
  {
    version: 12,
    ecCodewordsPerBlock: 24,
    groups: [
      { count: 2, dataCodewords: 92 },
      { count: 2, dataCodewords: 93 },
    ],
    alignment: [6, 32, 58],
  },
];

function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  let root = 1;
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], root);
    }
    poly = next;
    root = gfMul(root, 0x02);
  }
  return poly;
}

function rsComputeRemainder(data: Uint8Array, ecCount: number): Uint8Array {
  const gen = rsGeneratorPoly(ecCount);
  const rem = new Uint8Array(ecCount);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ rem[0];
    rem.copyWithin(0, 1);
    rem[ecCount - 1] = 0;
    for (let j = 0; j < ecCount; j++) {
      rem[j] ^= gfMul(gen[j + 1], factor);
    }
  }
  return rem;
}

function getMaskBit(mask: number, r: number, c: number): boolean {
  switch (mask) {
    case 0:
      return (r + c) % 2 === 0;
    case 1:
      return r % 2 === 0;
    case 2:
      return c % 3 === 0;
    case 3:
      return (r + c) % 3 === 0;
    case 4:
      return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5:
      return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6:
      return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    default:
      return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
  }
}

function computeFormatBitsLevelL(mask: number): number {
  const data = (0b01 << 3) | (mask & 0b111);
  let rem = data;
  for (let i = 0; i < 10; i++) {
    rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  }
  return ((data << 10) | rem) ^ 0x5412;
}

function computeVersionBits(version: number): number {
  let rem = version;
  for (let i = 0; i < 12; i++) {
    rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  }
  return (version << 12) | rem;
}

function drawFormatBits(modules: boolean[][], isFunc: boolean[][], size: number, mask: number): void {
  const bits = computeFormatBitsLevelL(mask);
  const setMod = (r: number, c: number, dark: boolean) => {
    modules[r][c] = dark;
    isFunc[r][c] = true;
  };
  // Copy 1 around top-left finder: bits 0..14 where bit 14 is MSB and bit 0 is LSB
  for (let i = 0; i <= 5; i++) setMod(i, 8, ((bits >>> i) & 1) !== 0);
  setMod(7, 8, ((bits >>> 6) & 1) !== 0);
  setMod(8, 8, ((bits >>> 7) & 1) !== 0);
  setMod(8, 7, ((bits >>> 8) & 1) !== 0);
  for (let i = 9; i < 15; i++) setMod(8, 14 - i, ((bits >>> i) & 1) !== 0);

  // Copy 2 split between top-right and bottom-left
  for (let i = 0; i < 8; i++) setMod(8, size - 1 - i, ((bits >>> i) & 1) !== 0);
  for (let i = 8; i < 15; i++) setMod(size - 15 + i, 8, ((bits >>> i) & 1) !== 0);
  // Always-dark module
  setMod(size - 8, 8, true);
}

function computePenaltyScore(modules: boolean[][], size: number): number {
  let penalty = 0;
  for (let r = 0; r < size; r++) {
    let runColor = modules[r][0];
    let runLen = 1;
    for (let c = 1; c < size; c++) {
      if (modules[r][c] === runColor) {
        runLen++;
        if (runLen === 5) penalty += 3;
        else if (runLen > 5) penalty += 1;
      } else {
        runColor = modules[r][c];
        runLen = 1;
      }
    }
  }
  for (let c = 0; c < size; c++) {
    let runColor = modules[0][c];
    let runLen = 1;
    for (let r = 1; r < size; r++) {
      if (modules[r][c] === runColor) {
        runLen++;
        if (runLen === 5) penalty += 3;
        else if (runLen > 5) penalty += 1;
      } else {
        runColor = modules[r][c];
        runLen = 1;
      }
    }
  }
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const color = modules[r][c];
      if (
        color === modules[r][c + 1] &&
        color === modules[r + 1][c] &&
        color === modules[r + 1][c + 1]
      ) {
        penalty += 3;
      }
    }
  }
  return penalty;
}

export function encodeQrMatrix(text: string): { size: number; modules: boolean[][] } {
  const bytes = new TextEncoder().encode(text);

  let chosenSpec: VersionSpec | null = null;
  for (const spec of VERSION_SPECS_L) {
    const countBits = spec.version <= 9 ? 8 : 16;
    const totalDataCodewords = spec.groups.reduce(
      (sum, g) => sum + g.count * g.dataCodewords,
      0,
    );
    const maxBytes = Math.floor((totalDataCodewords * 8 - 4 - countBits) / 8);
    if (bytes.length <= maxBytes) {
      chosenSpec = spec;
      break;
    }
  }
  if (!chosenSpec) {
    throw new Error("QR payload exceeds supported length.");
  }

  const { version, ecCodewordsPerBlock, groups, alignment } = chosenSpec;
  const countBits = version <= 9 ? 8 : 16;
  const totalDataCodewords = groups.reduce((sum, g) => sum + g.count * g.dataCodewords, 0);

  // Build bit buffer: Mode 0100 (Byte), char count, raw bytes, terminator, pad bytes 0xEC / 0x11
  const bitBuf: number[] = [];
  const appendBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bitBuf.push((val >>> i) & 1);
    }
  };
  appendBits(0b0100, 4);
  appendBits(bytes.length, countBits);
  for (let i = 0; i < bytes.length; i++) {
    appendBits(bytes[i], 8);
  }
  const capacityBits = totalDataCodewords * 8;
  appendBits(0, Math.min(4, capacityBits - bitBuf.length));
  appendBits(0, (8 - (bitBuf.length % 8)) % 8);
  let padToggle = 0;
  while (bitBuf.length < capacityBits) {
    appendBits(padToggle % 2 === 0 ? 0xec : 0x11, 8);
    padToggle++;
  }

  const dataCodewords = new Uint8Array(totalDataCodewords);
  for (let i = 0; i < bitBuf.length; i++) {
    dataCodewords[i >>> 3] |= bitBuf[i] << (7 - (i & 7));
  }

  // Split into RS blocks, compute EC codewords, and interleave
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let offset = 0;
  let maxBlockLen = 0;
  for (const grp of groups) {
    for (let i = 0; i < grp.count; i++) {
      const slice = dataCodewords.slice(offset, offset + grp.dataCodewords);
      offset += grp.dataCodewords;
      dataBlocks.push(slice);
      ecBlocks.push(rsComputeRemainder(slice, ecCodewordsPerBlock));
      if (slice.length > maxBlockLen) maxBlockLen = slice.length;
    }
  }

  const allCodewords: number[] = [];
  for (let i = 0; i < maxBlockLen; i++) {
    for (const blk of dataBlocks) {
      if (i < blk.length) allCodewords.push(blk[i]);
    }
  }
  for (let i = 0; i < ecCodewordsPerBlock; i++) {
    for (const ec of ecBlocks) {
      allCodewords.push(ec[i]);
    }
  }

  const size = 17 + version * 4;
  const baseModules: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const isFunc: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  const setFunc = (r: number, c: number, dark: boolean) => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      baseModules[r][c] = dark;
      isFunc[r][c] = true;
    }
  };

  const drawFinder = (r0: number, c0: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const rr = dr - 3;
        const cc = dc - 3;
        const dist = Math.max(Math.abs(rr), Math.abs(cc));
        const dark = dist !== 2 && dist !== 4;
        setFunc(r0 + dr, c0 + dc, dark);
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  for (let i = 0; i < size; i++) {
    if (!isFunc[6][i]) setFunc(6, i, i % 2 === 0);
    if (!isFunc[i][6]) setFunc(i, 6, i % 2 === 0);
  }

  for (const cy of alignment) {
    for (const cx of alignment) {
      if (
        (cy === 6 && cx === 6) ||
        (cy === 6 && cx === size - 7) ||
        (cy === size - 7 && cx === 6)
      ) {
        continue;
      }
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          setFunc(cy + dr, cx + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
        }
      }
    }
  }

  drawFormatBits(baseModules, isFunc, size, 0);

  if (version >= 7) {
    const vBits = computeVersionBits(version);
    for (let i = 0; i < 18; i++) {
      const dark = ((vBits >>> i) & 1) !== 0;
      const a = Math.floor(i / 3);
      const b = (i % 3) + size - 11;
      setFunc(b, a, dark);
      setFunc(a, b, dark);
    }
  }

  // Zigzag placement of data + EC codewords
  let bitIdx = 0;
  const totalBits = allCodewords.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        const upward = ((right + 1) & 2) === 0;
        const r = upward ? size - 1 - vert : vert;
        if (!isFunc[r][c] && bitIdx < totalBits) {
          const byte = allCodewords[bitIdx >>> 3];
          baseModules[r][c] = ((byte >>> (7 - (bitIdx & 7))) & 1) !== 0;
          bitIdx++;
        }
      }
    }
  }

  // Choose optimal mask 0..7
  let bestMask = 0;
  let bestPenalty = Number.POSITIVE_INFINITY;
  let bestMatrix = baseModules;

  for (let mask = 0; mask < 8; mask++) {
    const candidate = baseModules.map((row) => [...row]);
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!isFunc[r][c] && getMaskBit(mask, r, c)) {
          candidate[r][c] = !candidate[r][c];
        }
      }
    }
    drawFormatBits(candidate, isFunc, size, mask);
    const score = computePenaltyScore(candidate, size);
    if (score < bestPenalty) {
      bestPenalty = score;
      bestMask = mask;
      bestMatrix = candidate;
    }
  }

  drawFormatBits(bestMatrix, isFunc, size, bestMask);
  return { size, modules: bestMatrix };
}

export function buildQrSvgPath(text: string, margin = 3): { viewBoxSize: number; pathData: string } {
  const { size, modules } = encodeQrMatrix(text);
  const viewBoxSize = size + margin * 2;
  const parts: string[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (modules[r][c]) {
        parts.push(`M${c + margin} ${r + margin}h1v1h-1z`);
      }
    }
  }
  return { viewBoxSize, pathData: parts.join("") };
}
