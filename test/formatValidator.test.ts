import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { Mp3FormatValidator } from '../src/processor-mp3/formatValidator.js';
import { InvalidMp3Error, UnsupportedFormatError } from '../src/processor-mp3/errors.js';

/** 4-byte header: 64 kbps, 44.1 kHz, no padding → 208-byte frames. */
function header(version: number, layer: number): Buffer {
  const b1 = 0xe0 | (version << 3) | (layer << 1) | 1;
  const b2 = (5 << 4) | (0 << 2);
  return Buffer.from([0xff, b1, b2, 0x00]);
}

/** A complete 208-byte MPEG-1 Layer III frame (header + zeroed body). */
function fullFrame(version = 0b11, layer = 0b01): Buffer {
  const frame = Buffer.alloc(208);
  header(version, layer).copy(frame, 0);
  return frame;
}

/** A leading ID3v2 tag with `bodyLength` zeroed body bytes. */
function id3v2Tag(bodyLength: number): Buffer {
  const tag = Buffer.alloc(10 + bodyLength);
  tag[0] = 0x49;
  tag[1] = 0x44;
  tag[2] = 0x33; // "ID3"
  tag[3] = 0x04; // v2.4
  tag[9] = bodyLength & 0x7f; // synchsafe size (kept small)
  return tag;
}

/** Two back-to-back frames — enough for next-sync verification to confirm. */
const TWO_FRAMES = Buffer.concat([fullFrame(), fullFrame()]);

/** Feed a validator chunk by chunk and finalise. */
function feedAll(chunks: Buffer[]): void {
  const v = new Mp3FormatValidator();
  for (const c of chunks) v.consume(c);
  v.finalise();
}

describe('Mp3FormatValidator', () => {
  it('accepts consecutive MPEG-1 Layer III frames (next-sync confirmed)', () => {
    expect(() => feedAll([TWO_FRAMES])).not.toThrow();
  });

  it('accepts a single frame at end-of-stream (no following frame to confirm)', () => {
    expect(() => feedAll([fullFrame()])).not.toThrow();
  });

  it('skips a leading ID3v2 tag', () => {
    expect(() => feedAll([Buffer.concat([id3v2Tag(24), TWO_FRAMES])])).not.toThrow();
  });

  it('skips an ID3v2 tag that spans multiple chunks', () => {
    const data = Buffer.concat([id3v2Tag(40), TWO_FRAMES]);
    // split mid-header (byte 5) and mid-tag-body (byte 25)
    expect(() =>
      feedAll([data.subarray(0, 5), data.subarray(5, 25), data.subarray(25)]),
    ).not.toThrow();
  });

  it('skips leading non-frame junk via resync', () => {
    const junk = Buffer.from([0x00, 0x11, 0x22, 0x33, 0x44]);
    expect(() => feedAll([Buffer.concat([junk, TWO_FRAMES])])).not.toThrow();
  });

  it('handles a frame sync split across chunk boundaries', () => {
    expect(() => feedAll([TWO_FRAMES.subarray(0, 2), TWO_FRAMES.subarray(2)])).not.toThrow();
  });

  it('rejects MPEG-2 with a 415', () => {
    expect(() => feedAll([header(0b10, 0b01)])).toThrow(UnsupportedFormatError);
  });

  it('rejects Layer II with a 415', () => {
    expect(() => feedAll([header(0b11, 0b10)])).toThrow(UnsupportedFormatError);
  });

  it('throws 422 when no frame is ever found', () => {
    try {
      feedAll([Buffer.from('not an mp3 at all, just text')]);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidMp3Error);
      expect((err as InvalidMp3Error).statusCode).toBe(422);
    }
  });

  it('validates the real sample file (assets/sample.mp3)', async () => {
    const file = await readFile(new URL('../assets/sample.mp3', import.meta.url));
    const v = new Mp3FormatValidator();
    for (let i = 0; i < file.length; i += 65536) {
      v.consume(file.subarray(i, i + 65536));
    }
    expect(() => v.finalise()).not.toThrow();
  });
});
