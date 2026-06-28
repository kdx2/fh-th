import { Mp3StreamParser } from './streamParser.js';
import {
  MPEG_FRAME_HEADER_BYTES,
  assertSupported,
  computeFrameLength,
  decodeHeader,
  isSupported,
} from './frameHeader.js';
import { InvalidMp3Error } from './errors.js';

/**
 * Streaming format guard. The base class skips a leading ID3v2 tag; this class
 * inspects the first real frame and:
 *   - throws `UnsupportedFormatError` (415) if it isn't MPEG-1 Layer III;
 *   - throws `InvalidMp3Error` (422) from `finalise()` if no frame is ever found.
 *
 * A supported candidate is confirmed by the next frame's sync, rejecting a stray
 * `0xFF` in the payload/junk. Once validated it is a no-op.
 */
export class Mp3FormatValidator extends Mp3StreamParser {
  private isValidated = false;
  private isPendingSupported = false; // a supported frame awaiting next-sync confirmation

  consume(chunk: Buffer): void {
    if (this.isValidated) return;

    const region = this.skipToFrames(chunk);
    if (region) this.checkFirstFrame(region.data, region.start);
  }

  finalise(): void {
    // Accept a supported frame found at end-of-stream with no successor to confirm it.
    if (this.isValidated || this.isPendingSupported) return;
    throw new InvalidMp3Error();
  }

  /** Find the first real frame from `start` and assert it is MPEG-1 Layer III. */
  private checkFirstFrame(data: Buffer, start: number): void {
    this.isPendingSupported = false;
    let cursor = start;
    while (data.length - cursor >= MPEG_FRAME_HEADER_BYTES) {
      const header = decodeHeader(data, cursor);
      if (!header) {
        cursor += 1; // resync past non-frame bytes
        continue;
      }
      if (!isSupported(header)) {
        assertSupported(header); // throws 415
      }
      // Confirm the candidate via the next frame's sync.
      const frameLength = computeFrameLength(data, cursor);
      if (cursor + frameLength + MPEG_FRAME_HEADER_BYTES > data.length) {
        this.isPendingSupported = true; // valid so far; just lack the next header's bytes
        break;
      }
      if (!decodeHeader(data, cursor + frameLength)) {
        cursor += 1; // false sync inside the payload/junk
        continue;
      }
      this.isValidated = true;
      return;
    }
    this.carry = Buffer.from(data.subarray(cursor));
  }
}
