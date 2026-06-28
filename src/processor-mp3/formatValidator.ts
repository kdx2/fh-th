import { assertSupported, decodeHeader } from './frameHeader.js';
import { InvalidMp3Error } from './errors.js';

/**
 * Streaming format guard. Fed the same chunks as the counter, it scans for the
 * first plausible MPEG audio frame and:
 *   - throws `UnsupportedFormatError` (415) if that frame is not MPEG-1 Layer III;
 *   - throws `InvalidMp3Error` (422) from `finalise()` if no frame is ever found.
 *
 * Once the first frame is validated it becomes a no-op, so the cost is bounded to
 * locating the first header (plus a ≤3-byte carry across the chunk boundary).
 */
export class Mp3FormatValidator {
  private carry: Buffer = Buffer.alloc(0);
  private validated = false;

  validate(chunk: Buffer): void {
    if (this.validated) return;

    const data = this.carry.length ? Buffer.concat([this.carry, chunk]) : chunk;

    let i = 0;
    while (data.length - i >= 4) {
      const header = decodeHeader(data, i);
      if (header) {
        assertSupported(header); // throws 415 if not MPEG-1 Layer III
        this.validated = true;
        this.carry = Buffer.alloc(0);
        return;
      }
      i += 1; // resync past non-frame bytes (e.g. an ID3 tag)
    }

    // Keep the trailing <4 bytes in case a sync straddles the chunk boundary.
    // Copy out, since the chunk's backing memory may be reused by the stream.
    this.carry = Buffer.from(data.subarray(i));
  }

  finalise(): void {
    if (!this.validated) {
      throw new InvalidMp3Error();
    }
  }
}
