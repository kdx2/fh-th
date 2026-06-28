import type { FrameParser } from './types.js';

/**
 * Counts MPEG-1 Audio Layer III frames in a stream of MP3 bytes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  TODO: implement the frame-counting logic.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export class Mp3FrameCounter implements FrameParser {
  public framesCount: number;

  constructor() {
    this.framesCount = 0
  }

  update(_chunk: Buffer): void {
    this.framesCount += 1;
  }

  finalise(): number {
    return this.framesCount;
  }
}
