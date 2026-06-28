import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { Mp3FormatValidator } from '../src/processor-mp3/formatValidator.js';
import { InvalidMp3Error, UnsupportedFormatError } from '../src/processor-mp3/errors.js';

function header(version: number, layer: number): Buffer {
  const b1 = 0xe0 | (version << 3) | (layer << 1) | 1;
  const b2 = (5 << 4) | (0 << 2); // 64 kbps, 44.1 kHz
  return Buffer.from([0xff, b1, b2, 0x00]);
}

const MPEG1_L3 = header(0b11, 0b01);
const MPEG2_L3 = header(0b10, 0b01);
const MPEG1_L2 = header(0b11, 0b10);

/** Feed a validator chunk by chunk and finalise. */
function run(chunks: Buffer[]): void {
  const v = new Mp3FormatValidator();
  for (const c of chunks) v.validate(c);
  v.finalise();
}

describe('Mp3FormatValidator', () => {
  it('accepts a valid MPEG-1 Layer III frame', () => {
    expect(() => run([MPEG1_L3])).not.toThrow();
  });

  it('skips leading non-frame bytes (e.g. an ID3-like prefix)', () => {
    const prefix = Buffer.from([0x49, 0x44, 0x33, 0x00, 0x00, 0x00]); // "ID3.."
    expect(() => run([Buffer.concat([prefix, MPEG1_L3])])).not.toThrow();
  });

  it('handles a frame sync split across chunk boundaries', () => {
    expect(() => run([MPEG1_L3.subarray(0, 2), MPEG1_L3.subarray(2)])).not.toThrow();
  });

  it('rejects MPEG-2 with a 415', () => {
    expect(() => run([MPEG2_L3])).toThrow(UnsupportedFormatError);
  });

  it('rejects Layer II with a 415', () => {
    expect(() => run([MPEG1_L2])).toThrow(UnsupportedFormatError);
  });

  it('throws 422 when no frame is ever found', () => {
    try {
      run([Buffer.from('not an mp3 at all, just text')]);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidMp3Error);
      expect((err as InvalidMp3Error).statusCode).toBe(422);
    }
  });

  it('validates the real sample file (assets/sample.mp3)', async () => {
    const file = await readFile(new URL('../assets/sample.mp3', import.meta.url));
    // feed in 64 KB chunks to exercise the streaming path
    const v = new Mp3FormatValidator();
    for (let i = 0; i < file.length; i += 65536) {
      v.validate(file.subarray(i, i + 65536));
    }
    expect(() => v.finalise()).not.toThrow();
  });
});
