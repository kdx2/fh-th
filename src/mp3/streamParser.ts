import { ID3V2_HEADER_BYTES, ID3_TAG_FIRST_BYTE, extractId3v2TagLength } from './frameHeader.js';

const EMPTY = Buffer.alloc(0);

/** A run of frame bytes ready to scan, starting at `start` within `data`. */
export interface FrameRegion {
  readonly data: Buffer;
  readonly start: number;
}

/**
 * Streaming logic shared by the frame counter and the format validator.
 *
 * For each chunk it performs two cross-chunk-aware steps and then hands the
 * subclass the frame data to scan:
 *
 *   1. re-attach any bytes carried over from the previous chunk;
 *   2. skip a leading ID3v2 metadata tag (which may span several chunks).
 *
 * All the streaming bookkeeping (a tag bigger than one chunk, a tag header split
 * across a boundary) lives here, so subclasses only deal with frames.
 */
export abstract class Mp3StreamParser {
  /** Bytes received but not yet consumed: a tag fragment, or a partial frame. */
  protected carry: Buffer = EMPTY;

  private isLeadingTagResolved = false; // have we dealt with a possible leading tag?
  private tagBytesRemaining = 0; // bytes still to skip from a tag that spilled over

  /**
   * Prepend carried-over bytes, skip a leading ID3v2 tag, and return the frame
   * region to scan — or `null` when this chunk yielded no frame data yet (it was
   * all tag, or the tag's 10-byte header has not fully arrived).
   */
  protected skipToFrames(chunk: Buffer): FrameRegion | null {
    const data = this.carry.length ? Buffer.concat([this.carry, chunk]) : chunk;
    this.carry = EMPTY;

    const start = this.skipLeadingTag(data);
    return start === null ? null : { data, start };
  }

  /** Offset where the frames begin, or `null` if the leading tag isn't behind us yet. */
  private skipLeadingTag(data: Buffer): number | null {
    // Continue skipping a tag whose body spilled past the previous chunk.
    if (this.tagBytesRemaining > 0) {
      const currentBytesToSkip = Math.min(this.tagBytesRemaining, data.length);
      this.tagBytesRemaining -= currentBytesToSkip;
      return this.tagBytesRemaining > 0 ? null : currentBytesToSkip;
    }

    if (this.isLeadingTagResolved) return 0; // already handled: frames start at the front

    // Not an "ID3" tag → nothing to skip.
    if (data[0] !== ID3_TAG_FIRST_BYTE) {
      this.isLeadingTagResolved = true;
      return 0;
    }

    // It is "ID3", but the 10-byte header hasn't fully arrived — wait for the rest.
    if (data.length < ID3V2_HEADER_BYTES) {
      this.carry = Buffer.from(data);
      return null;
    }

    // Full header available: skip 10 + size, which may spill into later chunks.
    this.isLeadingTagResolved = true;
    const tagLength = extractId3v2TagLength(data, 0);
    if (tagLength <= data.length) return tagLength;
    this.tagBytesRemaining = tagLength - data.length;
    return null;
  }
}
