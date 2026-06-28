import { UnsupportedFormatError } from './errors.js';

/**
 * Minimal MPEG audio frame-header decoding, used for *format validation*.
 *
 * This intentionally only reads the version/layer (and enough to tell a real
 * frame from random bytes). The bitrate/sample-rate values and frame length —
 * i.e. the counting maths — belong to the parser.
 */

// 2-bit field values from the header (see docs/frame-counting-algorithm.md).
export const MPEG_VERSION_1 = 0b11;
export const LAYER_III = 0b01;

const VERSION_NAMES: Record<number, string> = {
  0b00: 'MPEG Version 2.5',
  0b01: 'reserved',
  0b10: 'MPEG Version 2',
  0b11: 'MPEG Version 1',
};

const LAYER_NAMES: Record<number, string> = {
  0b00: 'reserved',
  0b01: 'Layer III',
  0b10: 'Layer II',
  0b11: 'Layer I',
};

export interface FrameHeader {
  /** 2-bit MPEG version id. */
  version: number;
  /** 2-bit layer id. */
  layer: number;
}

/**
 * Decode the 4-byte header at `offset` iff it is a *plausible* MPEG audio frame:
 * valid 11-bit sync, non-reserved version/layer, and valid bitrate/sample-rate
 * indices. Returns `null` otherwise, so callers can resync past non-frame bytes
 * (e.g. an ID3 tag) without mistaking them for a frame.
 */
export function decodeHeader(buf: Buffer, offset: number): FrameHeader | null {
  if (offset + 4 > buf.length) return null;

  const b0 = buf[offset]!;
  const b1 = buf[offset + 1]!;
  const b2 = buf[offset + 2]!;

  // 11-bit frame sync: 0xFF followed by three set bits.
  if (b0 !== 0xff || (b1 & 0xe0) !== 0xe0) return null;

  const version = (b1 >> 3) & 0b11;
  const layer = (b1 >> 1) & 0b11;
  if (version === 0b01 || layer === 0b00) return null; // reserved → not a real frame

  const bitrateIndex = (b2 >> 4) & 0b1111;
  const sampleRateIndex = (b2 >> 2) & 0b11;
  if (bitrateIndex === 0b0000 || bitrateIndex === 0b1111) return null; // "free" / "bad"
  if (sampleRateIndex === 0b11) return null; // reserved

  return { version, layer };
}

/** True iff the frame is MPEG-1 Layer III (the only format we support). */
export function isSupported(header: FrameHeader): boolean {
  return header.version === MPEG_VERSION_1 && header.layer === LAYER_III;
}

/** Throw {@link UnsupportedFormatError} unless the frame is MPEG-1 Layer III. */
export function assertSupported(header: FrameHeader): void {
  if (isSupported(header)) return;

  const version = VERSION_NAMES[header.version] ?? 'unknown version';
  const layer = LAYER_NAMES[header.layer] ?? 'unknown layer';
  throw new UnsupportedFormatError(
    `Unsupported audio format: expected MPEG Version 1 Layer III, received ${version} ${layer}.`,
  );
}
