import { Mp3StreamParser } from './streamParser.js';
import { MPEG_FRAME_HEADER_BYTES, computeFrameLength, decodeHeader } from './frameHeader.js';

/**
 * Counts MPEG-1 Audio Layer III frames in a streamed MP3.
 *
 * The base class skips a leading ID3v2 tag and hands over each frame region;
 * this class walks the frames within it — decode header → hop by frame length →
 * confirm the next header — and carries any partial frame to the next chunk.
 * See `docs/frame-counting-algorithm.md`.
 */
export class Mp3FrameCounter extends Mp3StreamParser {
  public frameCount = 0;

  consume(chunk: Buffer): void {
    const region = this.skipToFrames(chunk);
    if (region) this.countFrames(region.data, region.start);
  }

  finalise(): number {
    // The last frame has no successor to confirm it; count it if its header is valid.
    if (this.carry.length >= MPEG_FRAME_HEADER_BYTES && decodeHeader(this.carry, 0)) {
      this.frameCount += 1;
      this.carry = Buffer.alloc(0);
    }
    return this.frameCount;
  }

  /** Walk frames from `start`, counting each one confirmed by the next sync. */
  private countFrames(data: Buffer, start: number): void {
    let cursor = start;
    while (data.length - cursor >= MPEG_FRAME_HEADER_BYTES) {
      if (!decodeHeader(data, cursor)) {
        cursor += 1; // resync past non-frame bytes
        continue;
      }
      const frameLength = computeFrameLength(data, cursor);
      const nextHeaderEnd = cursor + frameLength + MPEG_FRAME_HEADER_BYTES;
      if (frameLength < MPEG_FRAME_HEADER_BYTES || nextHeaderEnd > data.length) {
        break; // need the next header to confirm this frame — carry and wait
      }
      if (!decodeHeader(data, cursor + frameLength)) {
        cursor += 1; // false sync inside the payload
        continue;
      }
      this.frameCount += 1;
      cursor += frameLength; // hop to the next header
    }
    this.carry = Buffer.from(data.subarray(cursor));
  }
}
