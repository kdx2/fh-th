import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { Mp3FrameCounter } from '../../src/mp3/frameCounter.js';

/** 208-byte MPEG-1 L3 frame (64 kbps, 44.1 kHz, stereo). */
function audioFrame(): Buffer {
  const frame = Buffer.alloc(208);
  Buffer.from([0xff, 0xfb, (5 << 4) | (0 << 2), 0x00]).copy(frame, 0);
  return frame;
}

/** Same frame, but carrying a "Xing" tag after the 32-byte stereo side info. */
function xingFrame(): Buffer {
  const frame = audioFrame();
  frame.write('Xing', 4 + 32);
  return frame;
}

/** CBR equivalent: the same header frame carrying an "Info" tag instead of "Xing". */
function infoFrame(): Buffer {
  const frame = audioFrame();
  frame.write('Info', 4 + 32);
  return frame;
}

describe('Mp3FrameCounter — Xing/Info exclusion', () => {
  it('excludes a leading Xing header frame (counts only the audio frames)', () => {
    const counter = new Mp3FrameCounter();
    counter.consume(Buffer.concat([xingFrame(), audioFrame(), audioFrame()]));
    expect(counter.finalise()).toBe(2);
  });

  it('excludes a leading Info header frame (the CBR equivalent of Xing)', () => {
    const counter = new Mp3FrameCounter();
    counter.consume(Buffer.concat([infoFrame(), audioFrame(), audioFrame()]));
    expect(counter.finalise()).toBe(2);
  });

  it('counts a leading real audio frame normally when there is no Xing/Info', () => {
    const counter = new Mp3FrameCounter();
    counter.consume(Buffer.concat([audioFrame(), audioFrame()]));
    expect(counter.finalise()).toBe(2);
  });

  it('counts the real sample at 6089, matching mediainfo (Xing frame excluded)', async () => {
    const file = await readFile(new URL('../../assets/sample.mp3', import.meta.url));
    const counter = new Mp3FrameCounter();
    for (let i = 0; i < file.length; i += 65536) {
      counter.consume(file.subarray(i, i + 65536));
    }
    expect(counter.finalise()).toBe(6089);
  });
});

describe('Mp3FrameCounter.finalise', () => {
  it('returns 0 when no frames have been counted', () => {
    const counter = new Mp3FrameCounter();

    expect(counter.finalise()).toBe(0);
  });

  it('returns the total number of frames counted', () => {
    const counter = new Mp3FrameCounter();
    // Drive the counter's state directly so this test exercises finalise() in
    // isolation, independent of how consume() arrives at the count.
    counter.frameCount = 6089;

    expect(counter.finalise()).toBe(6089);
  });

  it('reflects state accumulated through consume()', () => {
    const counter = new Mp3FrameCounter();
    counter.consume(Buffer.alloc(0));
    counter.consume(Buffer.alloc(0));
    counter.consume(Buffer.alloc(0));

    expect(counter.finalise()).toBe(counter.frameCount);
  });

  it('is pure: repeated calls return the same value without mutating state', () => {
    const counter = new Mp3FrameCounter();
    counter.frameCount = 42;

    const first = counter.finalise();
    const second = counter.finalise();

    expect(first).toBe(42);
    expect(second).toBe(42);
    expect(counter.frameCount).toBe(42);
  });
});
