import { UnsupportedFormatError } from './errors.js';

/**
 * MPEG audio frame-header decoding for MPEG-1 Layer III, plus a small ID3v2
 * helper. Used by the format guard, and reusable by the frame counter.
 */

// ── Structural sizes ────────────────────────────────────────────────────────
export const MPEG_FRAME_HEADER_BYTES = 4;
export const ID3V2_HEADER_BYTES = 10;
export const ID3_TAG_FIRST_BYTE = 0x49; // ASCII 'I' — the start of the "ID3" marker

// ── Frame sync (first 11 bits all set) ──────────────────────────────────────
const FRAME_SYNC_BYTE_0 = 0xff; // byte 0: 11111111
const FRAME_SYNC_BYTE_1_BITS = 0xe0; // byte 1: top three bits 111

// ── 2-bit version / layer field values ──────────────────────────────────────
export const MPEG_VERSION_1 = 0b11;
export const LAYER_III = 0b01;
const RESERVED_VERSION = 0b01;
const RESERVED_LAYER = 0b00;

// ── Invalid table indices (never reach the maths) ───────────────────────────
const FREE_BITRATE_INDEX = 0b0000;
const BAD_BITRATE_INDEX = 0b1111;
const RESERVED_SAMPLE_RATE_INDEX = 0b11;

// ── ID3v2 header layout ─────────────────────────────────────────────────────
const ID3_TAG_MARKER = Buffer.from('ID3');
const ID3_FLAGS_OFFSET = 5;
const ID3_FOOTER_FLAG = 0x10;
const ID3_FOOTER_BYTES = 10;

// ── VBR header (Xing/Info) carried inside the first frame ────────────────────
const XING_TAG = Buffer.from('Xing'); // written by VBR encoders
const INFO_TAG = Buffer.from('Info'); // written by CBR encoders
const CHANNEL_MODE_MONO = 0b11; // header byte 3, bits 7-6
const SIDE_INFO_BYTES_MONO = 17;
const SIDE_INFO_BYTES_OTHER = 32;

// ── Frame-length maths ──────────────────────────────────────────────────────
const FRAME_LENGTH_COEFFICIENT = 144; // 1152 samples/frame ÷ 8 bits/byte
const BITS_PER_KBPS = 1000;

// MPEG-1 Layer III lookup tables, indexed by the header's 4- and 2-bit fields.
const BITRATE_KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const SAMPLE_RATE_HZ = [44100, 48000, 32000, 0];

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
 * Decode the 4-byte header at `offset` iff it is a *plausible* MPEG audio frame. Has a:
 * - valid 11-bit sync
 * - non-reserved version/layer bit
 * - valid bitrate/sample-rate indices.
 *
 * Returns `null` otherwise, so callers can resync past non-frame bytes
 * (e.g. an ID3 tag) without mistaking them for a frame.
 */
export function decodeHeader(data: Buffer, offset: number): FrameHeader | null {
  if (offset + MPEG_FRAME_HEADER_BYTES > data.length) return null;

  const b0 = data[offset]!;
  const b1 = data[offset + 1]!;
  const b2 = data[offset + 2]!;

  if (b0 !== FRAME_SYNC_BYTE_0 || (b1 & FRAME_SYNC_BYTE_1_BITS) !== FRAME_SYNC_BYTE_1_BITS) {
    return null;
  }

  const version = (b1 >> 3) & 0b11;
  const layer = (b1 >> 1) & 0b11;
  if (version === RESERVED_VERSION || layer === RESERVED_LAYER) return null;

  const bitrateIndex = (b2 >> 4) & 0b1111;
  const sampleRateIndex = (b2 >> 2) & 0b11;
  if (bitrateIndex === FREE_BITRATE_INDEX || bitrateIndex === BAD_BITRATE_INDEX) return null;
  if (sampleRateIndex === RESERVED_SAMPLE_RATE_INDEX) return null;

  return { version, layer };
}

/**
 * Byte length of the MPEG-1 Layer III frame whose header starts at `offset`.
 * Assumes a header already accepted by {@link decodeHeader}; returns 0 for
 * invalid indices (defensive).
 */
export function computeFrameLength(data: Buffer, offset: number): number {
  if (offset + MPEG_FRAME_HEADER_BYTES > data.length) return 0;

  const b2 = data[offset + 2]!;
  const bitrateKbps = BITRATE_KBPS[(b2 >> 4) & 0b1111] ?? 0;
  const sampleRateHz = SAMPLE_RATE_HZ[(b2 >> 2) & 0b11] ?? 0;
  const padding = (b2 >> 1) & 0b1;
  if (bitrateKbps === 0 || sampleRateHz === 0) return 0;

  return (
    Math.floor((FRAME_LENGTH_COEFFICIENT * bitrateKbps * BITS_PER_KBPS) / sampleRateHz) + padding
  );
}

/**
 * Length in bytes of an ID3v2 tag starting at `offset` (10-byte header +
 * synchsafe size, plus a 10-byte footer if present), or 0 if there is no tag.
 * Requires at least 10 bytes to be available.
 */
export function extractId3v2TagLength(data: Buffer, offset = 0): number {
  if (offset + ID3V2_HEADER_BYTES > data.length) return 0;
  if (!data.subarray(offset, offset + ID3_TAG_MARKER.length).equals(ID3_TAG_MARKER)) return 0;

  // Size is synchsafe: only the low 7 bits of each of the 4 bytes count.
  const size =
    (data[offset + 6]! << 21) |
    (data[offset + 7]! << 14) |
    (data[offset + 8]! << 7) |
    data[offset + 9]!;
  const isFooterPresent = (data[offset + ID3_FLAGS_OFFSET]! & ID3_FOOTER_FLAG) !== 0;

  return ID3V2_HEADER_BYTES + size + (isFooterPresent ? ID3_FOOTER_BYTES : 0);
}

/**
 * True if the frame at `offset` is a Xing/Info VBR-header frame - an MPEG VBR
 * metadata frame which does not contain audio.
 */
export function isXingFrame(data: Buffer, offset: number): boolean {
  if (offset + MPEG_FRAME_HEADER_BYTES > data.length) return false;

  const channelMode = (data[offset + 3]! >> 6) & 0b11;
  const sideInfoBytes =
    channelMode === CHANNEL_MODE_MONO ? SIDE_INFO_BYTES_MONO : SIDE_INFO_BYTES_OTHER;
  const tagStart = offset + MPEG_FRAME_HEADER_BYTES + sideInfoBytes;
  if (tagStart + XING_TAG.length > data.length) return false;

  const tag = data.subarray(tagStart, tagStart + XING_TAG.length);
  return tag.equals(XING_TAG) || tag.equals(INFO_TAG);
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
