import type { Readable } from 'node:stream';
import { Mp3FrameCounter } from './frameCounter.js';

/**
 * Count MPEG-1 Audio Layer III frames in a byte stream.
 *
 * The stream is consumed incrementally — one chunk at a time — so:
 *  - memory stays flat (~one chunk) regardless of file size, and
 *  - the event loop is never blocked by a whole-file parse (each `update()` does
 *    O(chunk) work, and other requests interleave between chunks).
 *
 * A fresh `Mp3FrameCounter` per call guarantees the result reflects only this
 * stream's bytes, even when many uploads are processed concurrently.
 */
export async function countFramesInStream(stream: Readable): Promise<number> {
  const counter = new Mp3FrameCounter();
  for await (const chunk of stream) {
    counter.update(chunk as Buffer);
  }
  return counter.finalise();
}
