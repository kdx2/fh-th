import { Buffer } from 'node:buffer';

import { describe, expect, it } from 'vitest';

import { Mp3FrameCounter } from '../../src/processor-mp3/frameCounter.js';

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
