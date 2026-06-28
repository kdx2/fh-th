import { describe, expect, it } from 'vitest';
import { assertSupported, decodeHeader, isSupported } from '../src/processor-mp3/frameHeader.js';
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
