import { describe, expect, it } from 'vitest';
import {
  assertSupported,
  computeFrameLength,
  decodeHeader,
  extractId3v2TagLength,
  isSupported,
} from '../src/processor-mp3/frameHeader.js';
import { UnsupportedFormatError } from '../src/processor-mp3/errors.js';

/**
 * Build a 4-byte MPEG audio header from its fields.
 * version/layer are the 2-bit ids; bitrate/sampleRate are table indices.
 */
function header(opts: {
  version?: number;
  layer?: number;
  bitrate?: number;
  sampleRate?: number;
  padding?: number;
}): Buffer {
  const { version = 0b11, layer = 0b01, bitrate = 5, sampleRate = 0, padding = 0 } = opts;
  const b1 = 0xe0 | (version << 3) | (layer << 1) | 1; // sync + fields + protection
  const b2 = (bitrate << 4) | (sampleRate << 2) | (padding << 1);
  return Buffer.from([0xff, b1, b2, 0x00]);
}

/** Build an ID3v2 tag with `bodyLength` bytes of (zeroed) body. */
function id3v2Tag(bodyLength: number, isFooterPresent = false): Buffer {
  const tag = Buffer.alloc(10 + bodyLength + (isFooterPresent ? 10 : 0));
  tag[0] = 0x49; // I
  tag[1] = 0x44; // D
  tag[2] = 0x33; // 3
  tag[3] = 0x04; // version 2.4
  tag[5] = isFooterPresent ? 0x10 : 0x00; // flags (footer bit)
  // synchsafe size (7 bits per byte)
  tag[6] = (bodyLength >> 21) & 0x7f;
  tag[7] = (bodyLength >> 14) & 0x7f;
  tag[8] = (bodyLength >> 7) & 0x7f;
  tag[9] = bodyLength & 0x7f;
  return tag;
}

describe('decodeHeader', () => {
  it('decodes a valid MPEG-1 Layer III header (matches the sample: FF FB 50)', () => {
    const h = decodeHeader(header({}), 0);
    expect(h).toEqual({ version: 0b11, layer: 0b01 });
    expect(isSupported(h!)).toBe(true);
  });

  it('returns null when there is no frame sync', () => {
    expect(decodeHeader(Buffer.from([0x49, 0x44, 0x33, 0x00]), 0)).toBeNull(); // "ID3"
  });

  it('returns null for reserved version or layer bits', () => {
    expect(decodeHeader(header({ version: 0b01 }), 0)).toBeNull(); // reserved version
    expect(decodeHeader(header({ layer: 0b00 }), 0)).toBeNull(); // reserved layer
  });

  it('returns null for free/bad bitrate and reserved sample rate', () => {
    expect(decodeHeader(header({ bitrate: 0 }), 0)).toBeNull();
    expect(decodeHeader(header({ bitrate: 0b1111 }), 0)).toBeNull();
    expect(decodeHeader(header({ sampleRate: 0b11 }), 0)).toBeNull();
  });

  it('returns null when fewer than 4 bytes are available', () => {
    expect(decodeHeader(Buffer.from([0xff, 0xfb]), 0)).toBeNull();
  });
});

describe('computeFrameLength', () => {
  it('computes 208 bytes for 64 kbps @ 44.1 kHz, no padding (the sample’s first frame)', () => {
    expect(computeFrameLength(header({ bitrate: 5, sampleRate: 0, padding: 0 }), 0)).toBe(208);
  });

  it('computes 627 bytes for 192 kbps @ 44.1 kHz with padding', () => {
    expect(computeFrameLength(header({ bitrate: 11, sampleRate: 0, padding: 1 }), 0)).toBe(627);
  });
});

describe('id3v2TagLength', () => {
  it('returns 0 when there is no ID3 tag', () => {
    expect(extractId3v2TagLength(header({}), 0)).toBe(0);
  });

  it('returns header + synchsafe size', () => {
    expect(extractId3v2TagLength(id3v2Tag(20), 0)).toBe(30); // 10 + 20
  });

  it('adds 10 bytes when a footer is present', () => {
    expect(extractId3v2TagLength(id3v2Tag(20, true), 0)).toBe(40); // 10 + 20 + 10
  });
});

describe('assertSupported', () => {
  it('accepts MPEG-1 Layer III', () => {
    expect(() => assertSupported({ version: 0b11, layer: 0b01 })).not.toThrow();
  });

  it('rejects MPEG-2 with a 415 and a descriptive message', () => {
    try {
      assertSupported({ version: 0b10, layer: 0b01 });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(UnsupportedFormatError);
      expect((err as UnsupportedFormatError).statusCode).toBe(415);
      expect((err as Error).message).toContain('MPEG Version 2');
    }
  });

  it('rejects Layer II', () => {
    expect(() => assertSupported({ version: 0b11, layer: 0b10 })).toThrow(/Layer II/);
  });
});
